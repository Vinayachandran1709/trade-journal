from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from app.models.broker_connection import BrokerConnection
from app.services.trade_import_service import parse_trade_time
from app.services.trade_processor import clean_stock_symbol


def _to_decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _to_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value

    text = str(value).strip()
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
    ):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def infer_dhan_instrument_type(payload: dict[str, Any]) -> str | None:
    option_type = str(payload.get("drvOptionType") or "").strip().upper()
    segment = str(payload.get("exchangeSegment") or "").strip().upper()

    if option_type in {"CE", "PE", "CALL", "PUT"}:
        return "OPT"
    if "FUT" in segment:
        return "FUT"
    if "OPT" in segment:
        return "OPT"
    if segment:
        return "STK"
    return None


def map_dhan_order_to_broker_order(
    connection: BrokerConnection,
    order: dict[str, Any],
) -> dict[str, Any]:
    return {
        "user_id": connection.user_id,
        "broker_connection_id": connection.id,
        "broker_name": "dhan",
        "broker_order_id": str(order.get("orderId") or ""),
        "broker_parent_order_id": None,
        "exchange": str(order.get("exchangeSegment") or "").strip().upper() or None,
        "segment": str(order.get("exchangeSegment") or "").strip().upper() or None,
        "product_type": str(order.get("productType") or "").strip().upper() or None,
        "order_type": str(order.get("orderType") or "").strip().upper() or None,
        "side": str(order.get("transactionType") or "").strip().upper() or None,
        "symbol": str(order.get("tradingSymbol") or "").strip().upper(),
        "instrument_token": (
            str(order.get("securityId")).strip()
            if order.get("securityId") is not None
            else None
        ),
        "instrument_type": infer_dhan_instrument_type(order),
        "quantity": _to_int(order.get("quantity")),
        "filled_quantity": _to_int(order.get("filledQty")),
        "remaining_quantity": _to_int(order.get("remainingQuantity")),
        "price": _to_decimal(order.get("price")),
        "average_price": _to_decimal(order.get("averageTradedPrice")),
        "trigger_price": _to_decimal(order.get("triggerPrice")),
        "status": str(order.get("orderStatus") or "").strip().upper() or None,
        "ordered_at": _parse_datetime(order.get("createTime")),
        "executed_at": (
            _parse_datetime(order.get("exchangeTime"))
            or _parse_datetime(order.get("updateTime"))
        ),
        "capture_source": "api",
        "raw_payload": dict(order),
    }


def aggregate_dhan_trades_to_trade_payloads(
    trades: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for trade in trades:
        order_id = str(trade.get("orderId") or "").strip()
        if not order_id:
            continue
        grouped[order_id].append(trade)

    payloads: list[dict[str, Any]] = []

    for order_id, order_trades in grouped.items():
        first_trade = order_trades[0]
        total_qty = sum(
            _to_int(item.get("tradedQuantity")) or 0 for item in order_trades
        )
        if total_qty <= 0:
            continue

        weighted_notional = sum(
            (_to_decimal(item.get("tradedPrice")) or Decimal("0.00"))
            * Decimal(_to_int(item.get("tradedQuantity")) or 0)
            for item in order_trades
        )
        average_price = (
            (weighted_notional / Decimal(total_qty)).quantize(Decimal("0.01"))
            if total_qty
            else Decimal("0.00")
        )

        candidate_times = [
            _parse_datetime(item.get("exchangeTime"))
            or _parse_datetime(item.get("createTime"))
            or _parse_datetime(item.get("updateTime"))
            for item in order_trades
        ]
        candidate_times = [item for item in candidate_times if item is not None]
        trade_dt = min(candidate_times) if candidate_times else None

        payloads.append(
            {
                "order_id": order_id,
                "stock_symbol": clean_stock_symbol(
                    str(first_trade.get("tradingSymbol") or "")
                ),
                "trade_type": str(first_trade.get("transactionType") or "").strip().upper(),
                "quantity": total_qty,
                "price": average_price,
                "trade_date": trade_dt.date() if trade_dt else None,
                "trade_time": parse_trade_time(trade_dt) if trade_dt else None,
                "broker": "dhan",
                "import_source": "broker_sync",
                "instrument_type": infer_dhan_instrument_type(first_trade),
                "entry_method": "broker_api",
                "source_trades": order_trades,
            }
        )

    return payloads
