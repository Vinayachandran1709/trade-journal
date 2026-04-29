from __future__ import annotations

import csv
import io
import logging
import re
import zipfile
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from html import unescape
from urllib.parse import urljoin

import httpx
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.stock import Stock

logger = logging.getLogger(__name__)

NSE_SOURCE_CANDIDATES = [
    "https://archives.nseindia.com/content/equities/EQUITY_L.csv",
    "https://www.nseindia.com/content/equities/EQUITY_L.csv",
    "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv",
]
BSE_BHAVCOPY_URL = "https://www.bseindia.com/download/BhavCopy/Equity/EQ_ISINCODE_{date}.zip"
BSE_BHAVCOPY_PAGE_URL = "https://www.bseindia.com/markets/MarketInfo/BhavCopy.aspx?ln=en-us"
BSE_UDIFF_FILENAME_TEMPLATE = "BhavCopy_BSE_CM_0_0_0_{date}_F_0000.csv"
HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/csv,application/zip,text/plain,*/*",
    "Referer": "https://www.nseindia.com/",
}
CORPORATE_SUFFIX_PATTERNS = [
    r"\bprivate limited\b",
    r"\bpvt ltd\b",
    r"\bpvt\. ltd\b",
    r"\blimited\b",
    r"\bltd\b",
    r"\bcompany\b",
    r"\bco\b",
    r"\bindia\b",
]
AMBIGUOUS_ALIASES = {
    "it",
    "can",
    "on",
    "in",
    "are",
    "or",
    "am",
    "pm",
    "be",
    "go",
    "do",
    "yes",
}


class StockMasterSyncError(Exception):
    pass


@dataclass
class NormalizedStockRecord:
    isin: str | None
    company_name: str
    display_name: str
    normalized_company_name: str
    nse_symbol: str | None = None
    bse_code: str | None = None
    exchanges: set[str] = field(default_factory=set)
    aliases: set[str] = field(default_factory=set)
    status: str = "active"
    source_names: set[str] = field(default_factory=set)


def normalize_whitespace(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def normalize_symbol(value: str | None) -> str | None:
    cleaned = normalize_whitespace(value).upper()
    return cleaned or None


def normalize_bse_code(value: str | None) -> str | None:
    cleaned = re.sub(r"\D", "", value or "")
    return cleaned or None


def normalize_lookup_text(value: str | None) -> str:
    cleaned = normalize_whitespace(value).lower()
    cleaned = cleaned.replace("&", " and ")
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def strip_corporate_suffixes(value: str | None) -> str:
    cleaned = normalize_whitespace(value)
    if not cleaned:
        return ""

    reduced = normalize_lookup_text(cleaned)
    changed = True
    while changed and reduced:
        changed = False
        for pattern in CORPORATE_SUFFIX_PATTERNS:
            next_reduced = re.sub(fr"(?:{pattern})$", "", reduced).strip()
            if next_reduced != reduced:
                reduced = re.sub(r"\s+", " ", next_reduced).strip()
                changed = True
    return reduced


def generate_aliases(
    company_name: str,
    display_name: str,
    nse_symbol: str | None = None,
    bse_name: str | None = None,
    bse_code: str | None = None,
) -> list[str]:
    aliases: set[str] = set()

    def add(value: str | None) -> None:
        normalized = normalize_whitespace(value)
        if len(normalized) < 2:
            return
        if normalize_lookup_text(normalized) in AMBIGUOUS_ALIASES:
            return
        aliases.add(normalized)

    add(company_name)
    add(display_name)
    add(bse_name)
    if nse_symbol:
        add(nse_symbol.upper())
    if bse_code:
        add(bse_code)

    cleaned_company = strip_corporate_suffixes(company_name)
    cleaned_display = strip_corporate_suffixes(display_name)
    if cleaned_company:
        add(cleaned_company.title())
    if cleaned_display:
        add(cleaned_display.title())

    for value in (company_name, display_name, bse_name):
        base = normalize_whitespace(value)
        if not base:
            continue
        add(re.sub(r"\([^)]*\)", "", base))
        add(base.replace("&", "and"))
        add(base.replace("-", " "))
        add(base.replace(".", " "))

    return sorted(aliases, key=lambda item: (-len(item), item))


def _pick_display_name(*values: str | None) -> str:
    candidates = [normalize_whitespace(value) for value in values if normalize_whitespace(value)]
    if not candidates:
        return "Unknown"
    return max(candidates, key=len)


def _download_text(url: str) -> str:
    with httpx.Client(timeout=30.0, follow_redirects=True, headers=HTTP_HEADERS) as client:
        response = client.get(url)
        response.raise_for_status()
        return response.text


def _download_bytes(url: str) -> bytes:
    with httpx.Client(timeout=30.0, follow_redirects=True, headers=HTTP_HEADERS) as client:
        response = client.get(url)
        response.raise_for_status()
        return response.content


def _looks_like_zip(payload: bytes) -> bool:
    return payload.startswith(b"PK\x03\x04")


def _looks_like_html(payload: bytes) -> bool:
    sample = payload[:512].lstrip().lower()
    return sample.startswith(b"<!doctype html") or sample.startswith(b"<html") or b"<body" in sample


def _extract_csv_text_from_archive(payload: bytes) -> str:
    if not _looks_like_zip(payload):
        raise StockMasterSyncError("BSE download did not return a ZIP archive")

    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        csv_name = next(
            (name for name in archive.namelist() if name.lower().endswith(".csv")),
            None,
        )
        if not csv_name:
            raise StockMasterSyncError("BSE archive did not contain a CSV file")
        return archive.read(csv_name).decode("utf-8-sig", errors="ignore")


def _extract_direct_bse_download_links(page_html: str) -> list[str]:
    matches = re.findall(r'href=["\']([^"\']+)["\']', page_html, flags=re.IGNORECASE)
    links: list[str] = []

    for href in matches:
        resolved = urljoin(BSE_BHAVCOPY_PAGE_URL, unescape(href.strip()))
        lower_resolved = resolved.lower()
        if "bseindia.com" not in lower_resolved:
            continue
        if "bhavcopy" not in lower_resolved and "download" not in lower_resolved:
            continue
        if not any(token in lower_resolved for token in ("equity", "udiff", ".csv", ".zip", "isin")):
            continue
        links.append(resolved)

    unique_links: list[str] = []
    seen: set[str] = set()
    for link in links:
        if link in seen:
            continue
        seen.add(link)
        unique_links.append(link)
    return unique_links


def _download_bse_page_links() -> list[str]:
    page_html = _download_text(BSE_BHAVCOPY_PAGE_URL)
    links = _extract_direct_bse_download_links(page_html)
    if not links:
        raise StockMasterSyncError("BSE bhavcopy page did not expose any downloadable equity files")
    return links


def _parse_rows(text: str) -> list[dict[str, str]]:
    sample = text[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",|;\t")
    except csv.Error:
        dialect = csv.excel

    rows = csv.DictReader(io.StringIO(text), dialect=dialect)
    return [{(key or "").strip(): (value or "").strip() for key, value in row.items()} for row in rows]


def _parse_legacy_bse_rows(rows: list[dict[str, str]]) -> list[NormalizedStockRecord]:
    records: list[NormalizedStockRecord] = []
    for row in rows:
        security_type = normalize_symbol(row.get("SC_TYPE"))
        if security_type and security_type not in {"Q", "EQ"}:
            continue

        company_name = normalize_whitespace(row.get("SC_NAME"))
        isin = normalize_symbol(row.get("ISIN_CODE") or row.get("ISIN NO"))
        bse_code = normalize_bse_code(row.get("SC_CODE"))
        if not company_name or not bse_code:
            continue

        display_name = _pick_display_name(company_name)
        records.append(
            NormalizedStockRecord(
                isin=isin,
                company_name=company_name,
                display_name=display_name,
                normalized_company_name=normalize_lookup_text(company_name),
                bse_code=bse_code,
                exchanges={"BSE"},
                aliases=set(
                    generate_aliases(
                        company_name,
                        display_name,
                        bse_name=company_name,
                        bse_code=bse_code,
                    )
                ),
                source_names={company_name},
            )
        )
    return records


def _parse_udiff_bse_rows(rows: list[dict[str, str]]) -> list[NormalizedStockRecord]:
    records: list[NormalizedStockRecord] = []
    for row in rows:
        segment = normalize_symbol(row.get("Sgmt") or row.get("Segment"))
        if segment and segment != "CM":
            continue

        instrument_type = normalize_symbol(
            row.get("FinInstrmTp") or row.get("FinInstrmType") or row.get("InstrmTp")
        )
        if instrument_type and instrument_type not in {"STK", "EQ", "EQUITY"}:
            continue

        company_name = normalize_whitespace(
            row.get("FinInstrmNm")
            or row.get("FinInstrmName")
            or row.get("SctyName")
            or row.get("SC_NAME")
        )
        isin = normalize_symbol(row.get("ISIN") or row.get("ISIN_CODE") or row.get("ISIN No"))
        bse_code = normalize_bse_code(
            row.get("FinInstrmId")
            or row.get("InstrmId")
            or row.get("SC_CODE")
            or row.get("TckrSymb")
        )
        if not company_name or not bse_code:
            continue

        display_name = _pick_display_name(company_name)
        records.append(
            NormalizedStockRecord(
                isin=isin,
                company_name=company_name,
                display_name=display_name,
                normalized_company_name=normalize_lookup_text(company_name),
                bse_code=bse_code,
                exchanges={"BSE"},
                aliases=set(
                    generate_aliases(
                        company_name,
                        display_name,
                        bse_name=company_name,
                        bse_code=bse_code,
                    )
                ),
                source_names={company_name},
            )
        )
    return records


def _parse_bse_csv_text(text: str, source_url: str) -> list[NormalizedStockRecord]:
    rows = _parse_rows(text)
    if not rows:
        return []

    header_keys = {key for key in rows[0].keys() if key}
    if {"SC_CODE", "SC_NAME"} & header_keys:
        return _parse_legacy_bse_rows(rows)
    if {"FinInstrmId", "FinInstrmNm", "ISIN"} & header_keys:
        return _parse_udiff_bse_rows(rows)

    raise StockMasterSyncError(
        f"Unsupported BSE file format from {source_url}: {sorted(header_keys)}"
    )


def _fetch_bse_records_from_url(url: str) -> list[NormalizedStockRecord]:
    payload = _download_bytes(url)
    if _looks_like_html(payload):
        raise StockMasterSyncError("BSE download returned HTML instead of a data file")

    lower_url = url.lower()
    if _looks_like_zip(payload) or lower_url.endswith(".zip"):
        text = _extract_csv_text_from_archive(payload)
    else:
        text = payload.decode("utf-8-sig", errors="ignore")
    return _parse_bse_csv_text(text, url)


def fetch_nse_stock_master() -> list[NormalizedStockRecord]:
    last_error: Exception | None = None
    for url in NSE_SOURCE_CANDIDATES:
        try:
            text = _download_text(url)
            rows = csv.DictReader(io.StringIO(text))
            records: list[NormalizedStockRecord] = []
            for row in rows:
                series = normalize_symbol(row.get(" SERIES") or row.get("SERIES"))
                if series and series != "EQ":
                    continue

                symbol = normalize_symbol(row.get("SYMBOL"))
                company_name = normalize_whitespace(row.get("NAME OF COMPANY"))
                isin = normalize_symbol(row.get(" ISIN NUMBER") or row.get("ISIN NUMBER"))
                if not symbol or not company_name:
                    continue

                display_name = _pick_display_name(company_name)
                records.append(
                    NormalizedStockRecord(
                        isin=isin,
                        company_name=company_name,
                        display_name=display_name,
                        normalized_company_name=normalize_lookup_text(company_name),
                        nse_symbol=symbol,
                        exchanges={"NSE"},
                        aliases=set(generate_aliases(company_name, display_name, nse_symbol=symbol)),
                        source_names={company_name},
                    )
                )

            if records:
                return records
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.warning("NSE stock master download failed from %s: %s", url, exc)

    raise StockMasterSyncError(
        f"Unable to download NSE stock master: {last_error}"
    )


def fetch_bse_stock_master() -> list[NormalizedStockRecord]:
    today = datetime.now(UTC).date()
    last_error: Exception | None = None
    candidate_urls: list[str] = []

    for offset in range(0, 10):
        candidate_date = today - timedelta(days=offset)
        legacy_date_token = candidate_date.strftime("%d%m%y")
        udiff_date_token = candidate_date.strftime("%Y%m%d")
        candidate_urls.append(BSE_BHAVCOPY_URL.format(date=legacy_date_token))
        candidate_urls.append(
            urljoin(
                "https://www.bseindia.com/download/BhavCopy/Equity/",
                BSE_UDIFF_FILENAME_TEMPLATE.format(date=udiff_date_token),
            )
        )

    try:
        candidate_urls.extend(_download_bse_page_links())
    except Exception as exc:  # noqa: BLE001
        last_error = exc
        logger.info("BSE bhavcopy page discovery unavailable, continuing with dated file fallbacks: %s", exc)

    seen_urls: set[str] = set()
    for url in candidate_urls:
        if url in seen_urls:
            continue
        seen_urls.add(url)

        try:
            records = _fetch_bse_records_from_url(url)
            if records:
                return records
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.warning("BSE stock master download failed from %s: %s", url, exc)

    raise StockMasterSyncError(
        f"Unable to download BSE stock master: {last_error}"
    )


def merge_stock_records(records: list[NormalizedStockRecord]) -> list[NormalizedStockRecord]:
    merged: dict[str, NormalizedStockRecord] = {}

    for record in records:
        key = (
            record.isin
            or (f"NSE:{record.nse_symbol}" if record.nse_symbol else None)
            or (f"BSE:{record.bse_code}" if record.bse_code else None)
        )
        if not key:
            continue

        existing = merged.get(key)
        if not existing:
            merged[key] = record
            continue

        existing.company_name = _pick_display_name(existing.company_name, record.company_name)
        existing.display_name = _pick_display_name(existing.display_name, record.display_name)
        existing.normalized_company_name = normalize_lookup_text(existing.company_name)
        existing.nse_symbol = existing.nse_symbol or record.nse_symbol
        existing.bse_code = existing.bse_code or record.bse_code
        existing.exchanges.update(record.exchanges)
        existing.aliases.update(record.aliases)
        existing.source_names.update(record.source_names)
        existing.status = record.status or existing.status

    for record in merged.values():
        record.aliases = set(
            generate_aliases(
                record.company_name,
                record.display_name,
                nse_symbol=record.nse_symbol,
                bse_name=max(record.source_names, key=len) if record.source_names else None,
                bse_code=record.bse_code,
            )
        )

    return list(merged.values())


def upsert_stock_master(db: Session, records: list[NormalizedStockRecord]) -> dict[str, int]:
    existing_by_isin = {
        stock.isin: stock
        for stock in db.query(Stock).filter(Stock.isin.isnot(None)).all()
        if stock.isin
    }
    existing_by_nse = {
        stock.nse_symbol: stock
        for stock in db.query(Stock).filter(Stock.nse_symbol.isnot(None)).all()
        if stock.nse_symbol
    }
    existing_by_bse = {
        stock.bse_code: stock
        for stock in db.query(Stock).filter(Stock.bse_code.isnot(None)).all()
        if stock.bse_code
    }

    inserted = 0
    updated = 0
    now = datetime.utcnow()

    for record in records:
        stock = None
        if record.isin:
            stock = existing_by_isin.get(record.isin)
        if stock is None and record.nse_symbol:
            stock = existing_by_nse.get(record.nse_symbol)
        if stock is None and record.bse_code:
            stock = existing_by_bse.get(record.bse_code)

        alias_list = sorted(record.aliases, key=lambda item: (-len(item), item))
        alias_blob = "|".join(normalize_lookup_text(alias) for alias in alias_list)

        if stock is None:
            stock = Stock(
                isin=record.isin,
                company_name=record.company_name,
                display_name=record.display_name,
                normalized_company_name=record.normalized_company_name,
                nse_symbol=record.nse_symbol,
                bse_code=record.bse_code,
                exchanges=sorted(record.exchanges),
                aliases=alias_list,
                alias_blob=alias_blob,
                status=record.status,
                last_updated=now,
            )
            db.add(stock)
            inserted += 1
        else:
            stock.isin = stock.isin or record.isin
            stock.company_name = _pick_display_name(stock.company_name, record.company_name)
            stock.display_name = _pick_display_name(stock.display_name, record.display_name)
            stock.normalized_company_name = normalize_lookup_text(stock.company_name)
            stock.nse_symbol = stock.nse_symbol or record.nse_symbol
            stock.bse_code = stock.bse_code or record.bse_code
            stock.exchanges = sorted(set(stock.exchanges or []).union(record.exchanges))
            stock.aliases = sorted(
                set(stock.aliases or []).union(alias_list),
                key=lambda item: (-len(item), item),
            )
            stock.alias_blob = "|".join(
                normalize_lookup_text(alias) for alias in (stock.aliases or [])
            )
            stock.status = record.status
            stock.last_updated = now
            updated += 1

        if stock.isin:
            existing_by_isin[stock.isin] = stock
        if stock.nse_symbol:
            existing_by_nse[stock.nse_symbol] = stock
        if stock.bse_code:
            existing_by_bse[stock.bse_code] = stock

    db.commit()
    return {"inserted": inserted, "updated": updated}


def sync_stock_master(db: Session) -> dict:
    source_failures: list[str] = []

    try:
        nse_records = fetch_nse_stock_master()
    except Exception as exc:  # noqa: BLE001
        logger.exception("NSE stock sync failed")
        nse_records = []
        source_failures.append(f"NSE: {exc}")

    try:
        bse_records = fetch_bse_stock_master()
    except Exception as exc:  # noqa: BLE001
        logger.exception("BSE stock sync failed")
        bse_records = []
        source_failures.append(f"BSE: {exc}")

    if not nse_records and not bse_records:
        raise StockMasterSyncError("Both NSE and BSE stock master downloads failed")

    merged_records = merge_stock_records([*nse_records, *bse_records])
    write_counts = upsert_stock_master(db, merged_records)

    total_stocks = db.query(func.count(Stock.id)).scalar() or 0
    total_unique_isins = db.query(func.count(Stock.isin)).filter(Stock.isin.isnot(None)).scalar() or 0
    total_aliases = sum(len(stock.aliases or []) for stock in db.query(Stock).all())
    last_sync_time = db.query(func.max(Stock.last_updated)).scalar()

    return {
        "nse_records_seen": len(nse_records),
        "bse_records_seen": len(bse_records),
        "merged_records": len(merged_records),
        "inserted": write_counts["inserted"],
        "updated": write_counts["updated"],
        "total_stocks": total_stocks,
        "total_unique_isins": total_unique_isins,
        "total_aliases": total_aliases,
        "last_sync_time": last_sync_time.isoformat() if last_sync_time else None,
        "source_failures": source_failures,
    }


def resolve_stock_lookup(query: str, db: Session) -> Stock | None:
    normalized_query = normalize_whitespace(query)
    if not normalized_query:
        return None

    upper_query = normalized_query.upper()
    if upper_query.startswith("NSE:"):
        return (
            db.query(Stock)
            .filter(Stock.nse_symbol == upper_query.split(":", 1)[1])
            .first()
        )
    if upper_query.startswith("BSE:"):
        return (
            db.query(Stock)
            .filter(Stock.bse_code == normalize_bse_code(upper_query.split(":", 1)[1]))
            .first()
        )

    numeric_code = normalize_bse_code(normalized_query)
    if numeric_code and len(numeric_code) >= 5:
        stock = db.query(Stock).filter(Stock.bse_code == numeric_code).first()
        if stock:
            return stock

    stock = db.query(Stock).filter(Stock.nse_symbol == upper_query).first()
    if stock:
        return stock

    normalized_name = normalize_lookup_text(normalized_query)
    if not normalized_name:
        return None

    direct_match = (
        db.query(Stock)
        .filter(Stock.normalized_company_name == normalized_name)
        .first()
    )
    if direct_match:
        return direct_match

    candidates = (
        db.query(Stock)
        .filter(
            or_(
                Stock.alias_blob.like(f"%{normalized_name}%"),
                Stock.normalized_company_name.like(f"%{normalized_name}%"),
            )
        )
        .all()
    )
    for stock in candidates:
        alias_set = {
            normalize_lookup_text(alias)
            for alias in (stock.aliases or [])
        }
        if normalized_name in alias_set or normalized_name == stock.normalized_company_name:
            return stock

    return None


def get_quote_symbol_for_stock_input(symbol_or_name: str, db: Session) -> tuple[str, Stock | None]:
    normalized = normalize_whitespace(symbol_or_name)
    upper = normalized.upper()

    if any(upper.endswith(suffix) for suffix in (".NS", ".BO", "=F", "=X")) or upper.startswith("^"):
        return upper, None

    stock = resolve_stock_lookup(normalized, db)
    if stock:
        if upper.startswith("BSE:") and stock.bse_code:
            return f"{stock.bse_code}.BO", stock
        if stock.nse_symbol:
            return f"{stock.nse_symbol}.NS", stock
        if stock.bse_code:
            return f"{stock.bse_code}.BO", stock

    if normalize_bse_code(normalized) and len(normalize_bse_code(normalized) or "") >= 5:
        return f"{normalize_bse_code(normalized)}.BO", stock

    return f"{upper}.NS", stock


def build_stock_dictionary(db: Session) -> tuple[dict, str]:
    rows = db.query(Stock).filter(Stock.status == "active").all()
    updated_at = max((row.last_updated for row in rows), default=None)
    updated_iso = (
        updated_at.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z")
        if updated_at
        else datetime.now(UTC).isoformat().replace("+00:00", "Z")
    )
    version = updated_iso[:10]
    stocks: dict[str, dict] = {}

    for row in rows:
        key = row.nse_symbol or (f"BSE:{row.bse_code}" if row.bse_code else row.display_name)
        stocks[key] = {
            "isin": row.isin,
            "name": row.company_name,
            "display_name": row.display_name,
            "nse": row.nse_symbol,
            "bse": row.bse_code,
            "exchanges": row.exchanges or [],
            "aliases": row.aliases or [],
        }

    etag = f'W/"stocks-{len(stocks)}-{updated_at.timestamp() if updated_at else 0}"'
    return {
        "version": version,
        "updated_at": updated_iso,
        "stocks": stocks,
    }, etag


def get_stock_master_debug(db: Session) -> dict:
    total_stocks = db.query(func.count(Stock.id)).scalar() or 0
    total_unique_isins = db.query(func.count(Stock.isin)).filter(Stock.isin.isnot(None)).scalar() or 0
    total_aliases = sum(len(stock.aliases or []) for stock in db.query(Stock).all())
    last_sync_time = db.query(func.max(Stock.last_updated)).scalar()

    dictionary, _etag = build_stock_dictionary(db)
    samples: dict[str, dict] = {}
    for label in ("TCS", "RELIANCE", "INFY", "HDFCBANK"):
        stock = db.query(Stock).filter(Stock.nse_symbol == label).first()
        if stock:
            samples[label] = {
                "isin": stock.isin,
                "company_name": stock.company_name,
                "display_name": stock.display_name,
                "nse_symbol": stock.nse_symbol,
                "bse_code": stock.bse_code,
                "exchanges": stock.exchanges or [],
                "alias_count": len(stock.aliases or []),
            }

    return {
        "nse_records_seen": len([symbol for symbol in dictionary["stocks"].values() if symbol.get("nse")]),
        "bse_records_seen": len([symbol for symbol in dictionary["stocks"].values() if symbol.get("bse")]),
        "total_unique_isins": total_unique_isins,
        "total_stocks": total_stocks,
        "total_aliases": total_aliases,
        "last_sync_time": last_sync_time.isoformat() if last_sync_time else None,
        "dictionary_version": dictionary["version"],
        "samples": samples,
        "source_failures": [],
    }
