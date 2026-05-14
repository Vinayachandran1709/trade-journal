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
from app.utils.datetime import utcnow_naive

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


TOP_200_FALLBACK_STOCKS = [
    {"nse_symbol": "RELIANCE", "company_name": "Reliance Industries Limited", "display_name": "Reliance", "isin": "INE002A01018"},
    {"nse_symbol": "TCS", "company_name": "Tata Consultancy Services Limited", "display_name": "TCS", "isin": "INE467B01029"},
    {"nse_symbol": "HDFCBANK", "company_name": "HDFC Bank Limited", "display_name": "HDFC Bank", "isin": "INE040A01034"},
    {"nse_symbol": "INFY", "company_name": "Infosys Limited", "display_name": "Infosys", "isin": "INE009A01021"},
    {"nse_symbol": "ICICIBANK", "company_name": "ICICI Bank Limited", "display_name": "ICICI Bank", "isin": "INE090A01021"},
    {"nse_symbol": "HINDUNILVR", "company_name": "Hindustan Unilever Limited", "display_name": "HUL", "isin": "INE030A01027"},
    {"nse_symbol": "ITC", "company_name": "ITC Limited", "display_name": "ITC", "isin": "INE154A01025"},
    {"nse_symbol": "SBIN", "company_name": "State Bank of India", "display_name": "SBI", "isin": "INE062A01020"},
    {"nse_symbol": "BHARTIARTL", "company_name": "Bharti Airtel Limited", "display_name": "Bharti Airtel", "isin": "INE397D01024"},
    {"nse_symbol": "KOTAKBANK", "company_name": "Kotak Mahindra Bank Limited", "display_name": "Kotak Bank", "isin": "INE237A01028"},
    {"nse_symbol": "LT", "company_name": "Larsen & Toubro Limited", "display_name": "L&T", "isin": "INE018A01030"},
    {"nse_symbol": "HCLTECH", "company_name": "HCL Technologies Limited", "display_name": "HCL Tech", "isin": "INE860A01027"},
    {"nse_symbol": "AXISBANK", "company_name": "Axis Bank Limited", "display_name": "Axis Bank", "isin": "INE238A01034"},
    {"nse_symbol": "ASIANPAINT", "company_name": "Asian Paints Limited", "display_name": "Asian Paints", "isin": "INE021A01026"},
    {"nse_symbol": "MARUTI", "company_name": "Maruti Suzuki India Limited", "display_name": "Maruti Suzuki", "isin": "INE585B01010"},
    {"nse_symbol": "SUNPHARMA", "company_name": "Sun Pharmaceutical Industries Limited", "display_name": "Sun Pharma", "isin": "INE044A01036"},
    {"nse_symbol": "TITAN", "company_name": "Titan Company Limited", "display_name": "Titan", "isin": "INE280A01028"},
    {"nse_symbol": "BAJFINANCE", "company_name": "Bajaj Finance Limited", "display_name": "Bajaj Finance", "isin": "INE296A01024"},
    {"nse_symbol": "WIPRO", "company_name": "Wipro Limited", "display_name": "Wipro", "isin": "INE075A01022"},
    {"nse_symbol": "ULTRACEMCO", "company_name": "UltraTech Cement Limited", "display_name": "UltraTech Cement", "isin": "INE481G01011"},
    {"nse_symbol": "TATAMOTORS", "company_name": "Tata Motors Limited", "display_name": "Tata Motors", "isin": "INE155A01022"},
    {"nse_symbol": "TATASTEEL", "company_name": "Tata Steel Limited", "display_name": "Tata Steel", "isin": "INE081A01020"},
    {"nse_symbol": "NTPC", "company_name": "NTPC Limited", "display_name": "NTPC", "isin": "INE733E01010"},
    {"nse_symbol": "POWERGRID", "company_name": "Power Grid Corporation of India", "display_name": "Power Grid", "isin": "INE752E01010"},
    {"nse_symbol": "BAJAJFINSV", "company_name": "Bajaj Finserv Limited", "display_name": "Bajaj Finserv", "isin": "INE918I01018"},
    {"nse_symbol": "JSWSTEEL", "company_name": "JSW Steel Limited", "display_name": "JSW Steel", "isin": "INE019A01038"},
    {"nse_symbol": "ONGC", "company_name": "Oil and Natural Gas Corporation", "display_name": "ONGC", "isin": "INE213A01029"},
    {"nse_symbol": "ADANIENT", "company_name": "Adani Enterprises Limited", "display_name": "Adani Enterprises", "isin": "INE423A01024"},
    {"nse_symbol": "ADANIPORTS", "company_name": "Adani Ports & Special Economic Zone", "display_name": "Adani Ports", "isin": "INE742F01042"},
    {"nse_symbol": "COALINDIA", "company_name": "Coal India Limited", "display_name": "Coal India", "isin": "INE522F01014"},
    {"nse_symbol": "TECHM", "company_name": "Tech Mahindra Limited", "display_name": "Tech Mahindra", "isin": "INE669C01036"},
    {"nse_symbol": "INDUSINDBK", "company_name": "IndusInd Bank Limited", "display_name": "IndusInd Bank", "isin": "INE095A01012"},
    {"nse_symbol": "HINDALCO", "company_name": "Hindalco Industries Limited", "display_name": "Hindalco", "isin": "INE038A01020"},
    {"nse_symbol": "BPCL", "company_name": "Bharat Petroleum Corporation", "display_name": "BPCL", "isin": "INE029A01011"},
    {"nse_symbol": "DRREDDY", "company_name": "Dr. Reddy's Laboratories", "display_name": "Dr Reddy", "isin": "INE089A01023"},
    {"nse_symbol": "CIPLA", "company_name": "Cipla Limited", "display_name": "Cipla", "isin": "INE059A01026"},
    {"nse_symbol": "GRASIM", "company_name": "Grasim Industries Limited", "display_name": "Grasim", "isin": "INE047A01021"},
    {"nse_symbol": "EICHERMOT", "company_name": "Eicher Motors Limited", "display_name": "Eicher Motors", "isin": "INE066A01021"},
    {"nse_symbol": "DIVISLAB", "company_name": "Divi's Laboratories Limited", "display_name": "Divis Lab", "isin": "INE361B01024"},
    {"nse_symbol": "APOLLOHOSP", "company_name": "Apollo Hospitals Enterprise", "display_name": "Apollo Hospitals", "isin": "INE437A01024"},
    {"nse_symbol": "HEROMOTOCO", "company_name": "Hero MotoCorp Limited", "display_name": "Hero MotoCorp", "isin": "INE158A01026"},
    {"nse_symbol": "TATACONSUM", "company_name": "Tata Consumer Products Limited", "display_name": "Tata Consumer", "isin": "INE192A01025"},
    {"nse_symbol": "SBILIFE", "company_name": "SBI Life Insurance Company", "display_name": "SBI Life", "isin": "INE123W01016"},
    {"nse_symbol": "BRITANNIA", "company_name": "Britannia Industries Limited", "display_name": "Britannia", "isin": "INE216A01030"},
    {"nse_symbol": "HDFCLIFE", "company_name": "HDFC Life Insurance Company", "display_name": "HDFC Life", "isin": "INE795G01014"},
    {"nse_symbol": "DABUR", "company_name": "Dabur India Limited", "display_name": "Dabur", "isin": "INE016A01026"},
    {"nse_symbol": "PIDILITIND", "company_name": "Pidilite Industries Limited", "display_name": "Pidilite", "isin": "INE318A01026"},
    {"nse_symbol": "VEDL", "company_name": "Vedanta Limited", "display_name": "Vedanta", "isin": "INE205A01025"},
    {"nse_symbol": "GAIL", "company_name": "GAIL (India) Limited", "display_name": "GAIL", "isin": "INE129A01019"},
    {"nse_symbol": "IOC", "company_name": "Indian Oil Corporation", "display_name": "Indian Oil", "isin": "INE242A01010"},
    {"nse_symbol": "IRCTC", "company_name": "Indian Railway Catering and Tourism Corporation", "display_name": "IRCTC", "isin": "INE335Y01020"},
    {"nse_symbol": "ZOMATO", "company_name": "Zomato Limited", "display_name": "Zomato", "isin": "INE758T01015"},
    {"nse_symbol": "ETERNAL", "company_name": "Eternal Limited", "display_name": "Eternal", "isin": "INE758T01015"},
    {"nse_symbol": "PAYTM", "company_name": "One 97 Communications Limited", "display_name": "Paytm", "isin": "INE982J01020"},
    {"nse_symbol": "NYKAA", "company_name": "FSN E-Commerce Ventures Limited", "display_name": "Nykaa", "isin": "INE388Y01029"},
    {"nse_symbol": "DELHIVERY", "company_name": "Delhivery Limited", "display_name": "Delhivery", "isin": "INE148O01028"},
    {"nse_symbol": "SWIGGY", "company_name": "Bundl Technologies Private Limited", "display_name": "Swiggy", "isin": None},
    {"nse_symbol": "LICI", "company_name": "Life Insurance Corporation of India", "display_name": "LIC", "isin": "INE0J1Y01017"},
    {"nse_symbol": "HAL", "company_name": "Hindustan Aeronautics Limited", "display_name": "HAL", "isin": "INE066F01020"},
    {"nse_symbol": "BEL", "company_name": "Bharat Electronics Limited", "display_name": "BEL", "isin": "INE263A01024"},
    {"nse_symbol": "M&M", "company_name": "Mahindra & Mahindra Limited", "display_name": "M&M", "isin": "INE101A01026"},
    {"nse_symbol": "TATAPOWER", "company_name": "Tata Power Company Limited", "display_name": "Tata Power", "isin": "INE245A01021"},
    {"nse_symbol": "INDIGO", "company_name": "InterGlobe Aviation Limited", "display_name": "IndiGo", "isin": "INE646L01027"},
    {"nse_symbol": "DMART", "company_name": "Avenue Supermarts Limited", "display_name": "DMart", "isin": "INE192R01011"},
    {"nse_symbol": "SIEMENS", "company_name": "Siemens Limited", "display_name": "Siemens", "isin": "INE003A01024"},
    {"nse_symbol": "ABB", "company_name": "ABB India Limited", "display_name": "ABB", "isin": "INE117A01022"},
    {"nse_symbol": "BIOCON", "company_name": "Biocon Limited", "display_name": "Biocon", "isin": "INE376G01013"},
    {"nse_symbol": "LUPIN", "company_name": "Lupin Limited", "display_name": "Lupin", "isin": "INE326A01037"},
    {"nse_symbol": "MARICO", "company_name": "Marico Limited", "display_name": "Marico", "isin": "INE196A01026"},
    {"nse_symbol": "COLPAL", "company_name": "Colgate-Palmolive (India) Limited", "display_name": "Colgate", "isin": "INE259A01022"},
    {"nse_symbol": "BANKBARODA", "company_name": "Bank of Baroda", "display_name": "Bank of Baroda", "isin": "INE028A01039"},
    {"nse_symbol": "PNB", "company_name": "Punjab National Bank", "display_name": "PNB", "isin": "INE160A01022"},
    {"nse_symbol": "CANBK", "company_name": "Canara Bank", "display_name": "Canara Bank", "isin": "INE476A01014"},
    {"nse_symbol": "YESBANK", "company_name": "Yes Bank Limited", "display_name": "Yes Bank", "isin": "INE528G01035"},
    {"nse_symbol": "FEDERALBNK", "company_name": "Federal Bank Limited", "display_name": "Federal Bank", "isin": "INE171A01029"},
    {"nse_symbol": "BANDHANBNK", "company_name": "Bandhan Bank Limited", "display_name": "Bandhan Bank", "isin": "INE545U01014"},
    {"nse_symbol": "IDFCFIRSTB", "company_name": "IDFC First Bank Limited", "display_name": "IDFC First Bank", "isin": "INE092T01019"},
    {"nse_symbol": "IRFC", "company_name": "Indian Railway Finance Corporation", "display_name": "IRFC", "isin": "INE053F01010"},
    {"nse_symbol": "RVNL", "company_name": "Rail Vikas Nigam Limited", "display_name": "RVNL", "isin": "INE415G01027"},
    {"nse_symbol": "NHPC", "company_name": "NHPC Limited", "display_name": "NHPC", "isin": "INE848E01016"},
    {"nse_symbol": "PFC", "company_name": "Power Finance Corporation", "display_name": "PFC", "isin": "INE134E01011"},
    {"nse_symbol": "RECLTD", "company_name": "REC Limited", "display_name": "REC", "isin": "INE020B01018"},
    {"nse_symbol": "SAIL", "company_name": "Steel Authority of India", "display_name": "SAIL", "isin": "INE114A01011"},
    {"nse_symbol": "BHEL", "company_name": "Bharat Heavy Electricals", "display_name": "BHEL", "isin": "INE257A01026"},
    {"nse_symbol": "NESTLEIND", "company_name": "Nestle India Limited", "display_name": "Nestle India", "isin": "INE239A01016"},
    {"nse_symbol": "BAJAJ-AUTO", "company_name": "Bajaj Auto Limited", "display_name": "Bajaj Auto", "isin": "INE917I01010"},
    {"nse_symbol": "HAVELLS", "company_name": "Havells India Limited", "display_name": "Havells", "isin": "INE176B01034"},
    {"nse_symbol": "VOLTAS", "company_name": "Voltas Limited", "display_name": "Voltas", "isin": "INE226A01021"},
    {"nse_symbol": "POLYCAB", "company_name": "Polycab India Limited", "display_name": "Polycab", "isin": "INE455K01017"},
    {"nse_symbol": "TRENT", "company_name": "Trent Limited", "display_name": "Trent", "isin": "INE849A01020"},
    {"nse_symbol": "PERSISTENT", "company_name": "Persistent Systems Limited", "display_name": "Persistent", "isin": "INE262H01013"},
    {"nse_symbol": "COFORGE", "company_name": "Coforge Limited", "display_name": "Coforge", "isin": "INE591G01017"},
    {"nse_symbol": "MPHASIS", "company_name": "Mphasis Limited", "display_name": "Mphasis", "isin": "INE356A01018"},
    {"nse_symbol": "LTIM", "company_name": "LTIMindtree Limited", "display_name": "LTIMindtree", "isin": "INE214T01019"},
    {"nse_symbol": "LTTS", "company_name": "L&T Technology Services", "display_name": "L&T Technology", "isin": "INE010V01017"},
    {"nse_symbol": "NAUKRI", "company_name": "Info Edge (India) Limited", "display_name": "Naukri", "isin": "INE663F01024"},
    {"nse_symbol": "JUBLFOOD", "company_name": "Jubilant FoodWorks Limited", "display_name": "Jubilant FoodWorks", "isin": "INE797F01020"},
    {"nse_symbol": "MUTHOOTFIN", "company_name": "Muthoot Finance Limited", "display_name": "Muthoot Finance", "isin": "INE414G01012"},
    {"nse_symbol": "CHOLAFIN", "company_name": "Cholamandalam Investment and Finance", "display_name": "Chola Finance", "isin": "INE121A01024"},
    {"nse_symbol": "MOTHERSON", "company_name": "Samvardhana Motherson International", "display_name": "Motherson", "isin": "INE775A01035"},
    {"nse_symbol": "DIXON", "company_name": "Dixon Technologies (India) Limited", "display_name": "Dixon", "isin": "INE935N01020"},
    {"nse_symbol": "TATATECH", "company_name": "Tata Technologies Limited", "display_name": "Tata Technologies", "isin": "INE142M01025"},
    {"nse_symbol": "JIOFIN", "company_name": "Jio Financial Services Limited", "display_name": "Jio Financial", "isin": "INE758E01017"},
    {"nse_symbol": "ADANIGREEN", "company_name": "Adani Green Energy Limited", "display_name": "Adani Green", "isin": "INE364U01010"},
    {"nse_symbol": "ADANIENSOL", "company_name": "Adani Energy Solutions Limited", "display_name": "Adani Energy", "isin": "INE931S01010"},
    {"nse_symbol": "JSWENERGY", "company_name": "JSW Energy Limited", "display_name": "JSW Energy", "isin": "INE121E01018"},
]


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
    now = utcnow_naive()

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


def seed_top_200_stocks(db: Session) -> int:
    """Seed the stocks table with a core NSE universe when live sources are unavailable."""
    records = [
        NormalizedStockRecord(
            isin=stock.get("isin"),
            company_name=stock["company_name"],
            display_name=stock["display_name"],
            normalized_company_name=normalize_lookup_text(stock["company_name"]),
            nse_symbol=stock["nse_symbol"],
            exchanges={"NSE"},
            aliases=set(
                generate_aliases(
                    stock["company_name"],
                    stock["display_name"],
                    nse_symbol=stock["nse_symbol"],
                )
            ),
            source_names={stock["company_name"]},
        )
        for stock in TOP_200_FALLBACK_STOCKS
    ]
    return upsert_stock_master(db, records)["inserted"]


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

    merged_records = merge_stock_records([*nse_records, *bse_records])
    if merged_records:
        write_counts = upsert_stock_master(db, merged_records)
    else:
        write_counts = {"inserted": 0, "updated": 0}

    total_stocks = db.query(func.count(Stock.id)).scalar() or 0
    fallback_seeded = 0
    if total_stocks < 50:
        fallback_seeded = seed_top_200_stocks(db)
        total_stocks = db.query(func.count(Stock.id)).scalar() or 0

    if not merged_records and fallback_seeded == 0:
        raise StockMasterSyncError("Both NSE and BSE stock master downloads failed")

    total_unique_isins = db.query(func.count(Stock.isin)).filter(Stock.isin.isnot(None)).scalar() or 0
    total_aliases = sum(len(stock.aliases or []) for stock in db.query(Stock).all())
    last_sync_time = db.query(func.max(Stock.last_updated)).scalar()

    result = {
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
    if fallback_seeded:
        result["fallback_seeded"] = fallback_seeded
    return result


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
