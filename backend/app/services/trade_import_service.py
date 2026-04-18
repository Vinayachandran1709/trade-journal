from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.orm import Session

from app.models.trade import Trade
from app.services.trade_processor import clean_stock_symbol, validate_trade_data


@dataclass
class TradeImportResult:
    imported_trades: list[Trade]
    duplicate_count: int
    skipped_count: int


def _parse_trade_date(value: Any) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()

    text = str(value).strip()
    for fmt in (
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d %b %Y",
        "%d %B %Y",
    ):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    return date.fromisoformat(text)


def parse_trade_time(value: Any) -> time | None:
    if value in (None, ""):
        return None
    if isinstance(value, time):
        return value
    if isinstance(value, datetime):
        return value.time().replace(microsecond=0)

    text = str(value).strip()
    for fmt in (
        "%H:%M:%S",
        "%H:%M",
        "%I:%M:%S %p",
        "%I:%M %p",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
    ):
        try:
            parsed = datetime.strptime(text, fmt)
            if fmt.startswith("%d") or fmt.startswith("%Y"):
                return parsed.time().replace(microsecond=0)
            return parsed.time()
        except ValueError:
            continue

    return None


def normalize_trade_payload(
    trade_data: dict[str, Any],
    *,
    default_broker: str | None = None,
    default_import_source: str | None = None,
    default_entry_method: str | None = None,
) -> dict[str, Any] | None:
    try:
        stock_symbol = clean_stock_symbol(str(trade_data["stock_symbol"]))
        trade_type = str(trade_data["trade_type"]).strip().upper()
        quantity = int(trade_data["quantity"])
        price = Decimal(str(trade_data["price"])).quantize(Decimal("0.01"))
        trade_date = _parse_trade_date(trade_data["trade_date"])
    except (KeyError, TypeError, ValueError, InvalidOperation):
        return None

    normalized = {
        "stock_symbol": stock_symbol,
        "trade_type": trade_type,
        "quantity": quantity,
        "price": price,
        "trade_date": trade_date,
        "broker": (
            str(trade_data.get("broker")).strip().lower()
            if trade_data.get("broker") is not None
            else default_broker
        ),
        "import_source": (
            str(trade_data.get("import_source")).strip().lower()
            if trade_data.get("import_source") is not None
            else default_import_source
        ),
        "entry_method": (
            str(trade_data.get("entry_method")).strip().lower()
            if trade_data.get("entry_method") is not None
            else default_entry_method
        ),
        "trade_time": parse_trade_time(trade_data.get("trade_time")),
        "instrument_type": (
            str(trade_data.get("instrument_type")).strip().upper()
            if trade_data.get("instrument_type")
            else None
        ),
        "emotion_tag": trade_data.get("emotion_tag"),
        "notes": trade_data.get("notes") or trade_data.get("note"),
        "screenshot_url": trade_data.get("screenshot_url"),
    }

    if not validate_trade_data(normalized):
        return None

    return normalized


def make_trade_dedupe_key(user_id: int, trade_data: dict[str, Any]) -> tuple[Any, ...]:
    return (
        user_id,
        trade_data["stock_symbol"],
        trade_data["trade_type"],
        int(trade_data["quantity"]),
        Decimal(str(trade_data["price"])).quantize(Decimal("0.01")),
        trade_data["trade_date"],
    )


def get_existing_trade(
    db: Session, user_id: int, trade_data: dict[str, Any]
) -> Trade | None:
    price = Decimal(str(trade_data["price"])).quantize(Decimal("0.01"))
    return (
        db.query(Trade)
        .filter(
            Trade.user_id == user_id,
            Trade.stock_symbol == trade_data["stock_symbol"],
            Trade.trade_type == trade_data["trade_type"],
            Trade.quantity == int(trade_data["quantity"]),
            Trade.price == price,
            Trade.trade_date == trade_data["trade_date"],
        )
        .first()
    )


def import_trades(
    db: Session,
    *,
    user_id: int,
    trades: list[dict[str, Any]],
    default_broker: str | None = None,
    import_source: str | None = None,
    default_entry_method: str | None = None,
) -> TradeImportResult:
    imported_trades: list[Trade] = []
    duplicate_count = 0
    skipped_count = 0
    batch_keys: set[tuple[Any, ...]] = set()

    for trade_data in trades:
        normalized = normalize_trade_payload(
            trade_data,
            default_broker=default_broker,
            default_import_source=import_source,
            default_entry_method=default_entry_method,
        )
        if normalized is None:
            skipped_count += 1
            continue

        dedupe_key = make_trade_dedupe_key(user_id, normalized)
        if dedupe_key in batch_keys or get_existing_trade(db, user_id, normalized):
            duplicate_count += 1
            batch_keys.add(dedupe_key)
            continue

        new_trade = Trade(
            user_id=user_id,
            stock_symbol=normalized["stock_symbol"],
            trade_type=normalized["trade_type"],
            quantity=normalized["quantity"],
            price=normalized["price"],
            trade_date=normalized["trade_date"],
            broker=normalized["broker"],
            import_source=normalized["import_source"],
            emotion_tag=normalized["emotion_tag"],
            notes=normalized["notes"],
            screenshot_url=normalized["screenshot_url"],
            entry_method=normalized["entry_method"],
            trade_time=normalized["trade_time"],
            instrument_type=normalized["instrument_type"],
        )
        db.add(new_trade)
        imported_trades.append(new_trade)
        batch_keys.add(dedupe_key)

    db.commit()

    for trade in imported_trades:
        db.refresh(trade)

    return TradeImportResult(
        imported_trades=imported_trades,
        duplicate_count=duplicate_count,
        skipped_count=skipped_count,
    )
