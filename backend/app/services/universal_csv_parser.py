from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from app.services.trade_import_service import normalize_trade_payload


def _normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.strip().lower()).strip()


COMMON_FIELD_ALIASES: dict[str, list[str]] = {
    "stock_symbol": [
        "stock symbol",
        "symbol",
        "tradingsymbol",
        "trading symbol",
        "security name",
        "security",
        "scrip",
        "scrip name",
        "stock",
        "instrument",
    ],
    "trade_type": [
        "transaction type",
        "trade type",
        "type",
        "side",
        "action",
        "buy sell",
        "b s",
    ],
    "quantity": [
        "quantity",
        "qty",
        "net qty",
        "executed qty",
        "filled quantity",
    ],
    "price": [
        "price",
        "avg price",
        "average price",
        "avg traded price",
        "rate",
        "execution price",
    ],
    "trade_date": [
        "trade date",
        "date",
        "order date",
        "execution date",
        "transaction date",
        "order execution time",
    ],
    "trade_time": [
        "trade time",
        "time",
        "execution time",
        "order time",
        "order execution time",
    ],
    "instrument_type": [
        "instrument type",
        "segment",
        "instrument",
        "series",
        "product",
    ],
    "entry_method": ["entry method", "order source", "source"],
}


BROKER_SIGNATURES: dict[str, set[str]] = {
    "zerodha": {"tradingsymbol", "exchange", "trade date", "trade type", "quantity"},
    "groww": {"trade date", "stock symbol", "transaction type", "quantity", "price"},
    "angel_one": {"symbol", "buy sell", "net qty", "avg price"},
    "upstox": {"trading symbol", "transaction type", "quantity", "order date"},
    "dhan": {"security name", "type", "executed qty", "avg traded price"},
    "5paisa": {"scrip name", "buy sell", "qty", "rate"},
    "icici_direct": {"stock", "action", "qty", "price", "trade date"},
    "hdfc_sec": {"symbol", "transaction type", "quantity", "average price"},
    "kotak_sec": {"symbol", "b s", "qty", "price", "date"},
    "motilal_oswal": {"scrip", "buy sell", "qty", "rate", "trade date"},
}


TRADE_TYPE_MAP = {
    "BUY": "BUY",
    "B": "BUY",
    "BOUGHT": "BUY",
    "SELL": "SELL",
    "S": "SELL",
    "SOLD": "SELL",
}


@dataclass
class UniversalCsvParseResult:
    detected_broker: str | None
    confidence: float
    trades: list[dict[str, Any]]
    preview_headers: list[str]
    preview_rows: list[dict[str, str]]
    manual_mapping_required: bool
    message: str | None = None


def detect_broker_from_headers(headers: list[str]) -> tuple[str | None, float]:
    if not headers:
        return None, 0.0

    normalized_headers = {_normalize_header(header) for header in headers if header}
    best_match: tuple[str | None, float] = (None, 0.0)

    for broker, signature in BROKER_SIGNATURES.items():
        matched = len(normalized_headers.intersection(signature))
        confidence = matched / len(signature)
        if confidence > best_match[1]:
            best_match = (broker, confidence)

    return best_match


def _decode_csv(file_content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return file_content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return file_content.decode("utf-8", errors="ignore")


def _sanitize_cell(value: Any) -> str:
    return str(value or "").strip()


def _build_header_lookup(headers: list[str]) -> dict[str, str]:
    return {_normalize_header(header): header for header in headers if header}


def _extract_value(
    row: dict[str, Any], header_lookup: dict[str, str], aliases: list[str]
) -> str | None:
    for alias in aliases:
        actual = header_lookup.get(_normalize_header(alias))
        if actual is None:
            continue
        value = _sanitize_cell(row.get(actual))
        if value:
            return value
    return None


def _parse_trade_date_and_time(
    date_value: str | None, time_value: str | None
) -> tuple[date | str | None, str | None]:
    if not date_value:
        return None, time_value

    raw = date_value.strip()
    if raw:
        for fmt in (
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%d-%m-%Y %H:%M:%S",
            "%d-%m-%Y %H:%M",
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
        ):
            try:
                parsed = datetime.strptime(raw, fmt)
                return parsed.date(), time_value or parsed.strftime("%H:%M:%S")
            except ValueError:
                continue

    return raw, time_value


def _normalize_row(
    row: dict[str, Any], headers: list[str], broker: str
) -> dict[str, Any] | None:
    header_lookup = _build_header_lookup(headers)

    stock_symbol = _extract_value(row, header_lookup, COMMON_FIELD_ALIASES["stock_symbol"])
    trade_type_value = _extract_value(row, header_lookup, COMMON_FIELD_ALIASES["trade_type"])
    quantity = _extract_value(row, header_lookup, COMMON_FIELD_ALIASES["quantity"])
    price = _extract_value(row, header_lookup, COMMON_FIELD_ALIASES["price"])
    trade_date = _extract_value(row, header_lookup, COMMON_FIELD_ALIASES["trade_date"])
    trade_time = _extract_value(row, header_lookup, COMMON_FIELD_ALIASES["trade_time"])
    instrument_type = _extract_value(
        row, header_lookup, COMMON_FIELD_ALIASES["instrument_type"]
    )
    entry_method = _extract_value(row, header_lookup, COMMON_FIELD_ALIASES["entry_method"])

    if not stock_symbol or not trade_type_value or not quantity or not price or not trade_date:
        return None

    normalized_trade_type = TRADE_TYPE_MAP.get(trade_type_value.strip().upper())
    if normalized_trade_type is None:
        return None

    parsed_trade_date, parsed_trade_time = _parse_trade_date_and_time(
        trade_date, trade_time
    )

    normalized = normalize_trade_payload(
        {
            "stock_symbol": stock_symbol,
            "trade_type": normalized_trade_type,
            "quantity": re.sub(r"[^\d-]", "", quantity),
            "price": re.sub(r"[^\d.]", "", price),
            "trade_date": parsed_trade_date,
            "trade_time": parsed_trade_time,
            "instrument_type": instrument_type,
            "entry_method": entry_method,
            "broker": broker,
        }
    )
    return normalized


def parse_universal_csv(
    file_content: bytes, *, forced_broker: str | None = None
) -> UniversalCsvParseResult:
    if not file_content or not file_content.strip():
        return UniversalCsvParseResult(
            detected_broker=forced_broker,
            confidence=0.0,
            trades=[],
            preview_headers=[],
            preview_rows=[],
            manual_mapping_required=True,
            message="CSV file is empty.",
        )

    text = _decode_csv(file_content)
    reader = csv.DictReader(io.StringIO(text))
    headers = list(reader.fieldnames or [])
    rows = list(reader)
    preview_rows = [
        {header: _sanitize_cell(row.get(header)) for header in headers[:8]}
        for row in rows[:5]
    ]

    detected_broker, confidence = (
        (forced_broker, 1.0)
        if forced_broker
        else detect_broker_from_headers(headers)
    )

    if detected_broker is None or confidence < 0.6:
        return UniversalCsvParseResult(
            detected_broker=detected_broker,
            confidence=confidence,
            trades=[],
            preview_headers=headers,
            preview_rows=preview_rows,
            manual_mapping_required=True,
            message="Could not confidently detect the broker format.",
        )

    trades = [
        normalized
        for row in rows
        if (normalized := _normalize_row(row, headers, detected_broker)) is not None
    ]

    if not trades:
        return UniversalCsvParseResult(
            detected_broker=detected_broker,
            confidence=confidence,
            trades=[],
            preview_headers=headers,
            preview_rows=preview_rows,
            manual_mapping_required=True,
            message="The CSV matched a supported broker, but no trade rows could be normalized.",
        )

    return UniversalCsvParseResult(
        detected_broker=detected_broker,
        confidence=confidence,
        trades=trades,
        preview_headers=headers,
        preview_rows=preview_rows,
        manual_mapping_required=False,
    )
