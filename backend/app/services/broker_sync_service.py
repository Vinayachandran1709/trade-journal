from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.broker_connection import BrokerConnection
from app.models.broker_order import BrokerOrder
from app.models.trade import Trade
from app.models.user import User
from app.services.broker_connection_service import get_user_broker_connection
from app.services.broker_order_mapper import (
    aggregate_dhan_trades_to_trade_payloads,
    map_dhan_order_to_broker_order,
)
from app.services.brokers.base import BrokerAPIError, BrokerAuthError
from app.services.brokers.dhan import DhanBrokerClient
from app.services.token_encryption_service import (
    TokenEncryptionError,
    decrypt_token,
)
from app.services.trade_processor import rebuild_completed_trades
from app.utils.datetime import utcnow_naive


def _sync_error(connection: BrokerConnection, db: Session, detail: str) -> HTTPException:
    connection.sync_status = "failed"
    connection.last_error_message = detail
    db.commit()
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)


def _build_status_metadata(
    connection: BrokerConnection,
    *,
    positions: list[dict[str, Any]],
    holdings: list[dict[str, Any]],
    orders_count: int,
    trades_inserted: int,
) -> dict[str, Any]:
    existing = connection.metadata_json or {}
    return {
        **existing,
        "last_positions_count": len(positions),
        "last_holdings_count": len(holdings),
        "last_orders_count": orders_count,
        "last_trades_inserted": trades_inserted,
        "positions_snapshot": positions,
        "holdings_snapshot": holdings,
    }


def _upsert_broker_orders(
    db: Session,
    *,
    connection: BrokerConnection,
    orders: list[dict[str, Any]],
) -> tuple[dict[str, BrokerOrder], int]:
    by_order_id: dict[str, BrokerOrder] = {}
    upsert_count = 0

    for order in orders:
        mapped = map_dhan_order_to_broker_order(connection, order)
        order_id = mapped["broker_order_id"]
        if not order_id:
            continue

        existing = (
            db.query(BrokerOrder)
            .filter(
                BrokerOrder.broker_connection_id == connection.id,
                BrokerOrder.broker_order_id == order_id,
            )
            .first()
        )
        if existing is None:
            existing = BrokerOrder(**mapped)
            db.add(existing)
        else:
            existing_raw_payload = dict(existing.raw_payload or {})
            existing_sync_meta = dict(existing_raw_payload.get("sync_meta") or {})
            for key, value in mapped.items():
                setattr(existing, key, value)
            if existing_sync_meta:
                existing.raw_payload = {
                    **dict(existing.raw_payload or {}),
                    "sync_meta": existing_sync_meta,
                }
        by_order_id[order_id] = existing
        upsert_count += 1

    db.flush()
    return by_order_id, upsert_count


def _insert_synced_trades(
    db: Session,
    *,
    connection: BrokerConnection,
    order_map: dict[str, BrokerOrder],
    aggregated_trade_payloads: list[dict[str, Any]],
) -> int:
    inserted = 0

    for payload in aggregated_trade_payloads:
        order_id = payload["order_id"]
        broker_order = order_map.get(order_id)
        if broker_order is None:
            continue

        raw_payload = dict(broker_order.raw_payload or {})
        sync_meta = dict(raw_payload.get("sync_meta") or {})
        if sync_meta.get("imported_trade_id"):
            broker_order.raw_payload = {**raw_payload, "sync_meta": sync_meta}
            continue

        if not payload["stock_symbol"] or not payload["trade_type"] or payload["trade_date"] is None:
            continue

        trade = Trade(
            user_id=connection.user_id,
            stock_symbol=payload["stock_symbol"],
            trade_type=payload["trade_type"],
            quantity=payload["quantity"],
            price=payload["price"],
            trade_date=payload["trade_date"],
            trade_time=payload["trade_time"],
            broker="dhan",
            import_source="broker_sync",
            instrument_type=payload["instrument_type"],
            entry_method="broker_api",
        )
        db.add(trade)
        db.flush()

        sync_meta.update(
            {
                "imported_trade_id": trade.id,
                "imported_at": utcnow_naive().isoformat(),
                "source_trade_count": len(payload["source_trades"]),
            }
        )
        broker_order.raw_payload = {**raw_payload, "sync_meta": sync_meta}
        inserted += 1

    return inserted


def sync_broker_connection(
    db: Session,
    *,
    current_user: User,
    connection_id: int,
) -> dict[str, Any]:
    connection = get_user_broker_connection(db, current_user.id, connection_id)
    if connection.broker_name != "dhan":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Dhan sync is supported right now",
        )
    if not connection.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Broker connection is inactive",
        )

    try:
        access_token = decrypt_token(connection.access_token_encrypted)
    except TokenEncryptionError as exc:
        raise _sync_error(connection, db, str(exc))

    client = DhanBrokerClient(
        access_token=access_token,
        client_id=connection.client_id or "",
    )

    connection.sync_status = "syncing"
    db.commit()

    try:
        payload = client.fetch_sync_payload()
    except BrokerAuthError as exc:
        connection.auth_status = "reauth_required"
        connection.sync_status = "failed"
        connection.last_error_code = exc.error_code
        connection.last_error_message = str(exc)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        )
    except BrokerAPIError as exc:
        raise _sync_error(connection, db, str(exc))

    order_map, orders_upserted = _upsert_broker_orders(
        db,
        connection=connection,
        orders=payload.orders,
    )
    aggregated_trades = aggregate_dhan_trades_to_trade_payloads(payload.trades)
    trades_inserted = _insert_synced_trades(
        db,
        connection=connection,
        order_map=order_map,
        aggregated_trade_payloads=aggregated_trades,
    )

    completed_count = 0
    if trades_inserted > 0:
        completed_count = rebuild_completed_trades(db, connection.user_id)

    connection.auth_status = "connected"
    connection.sync_status = "synced"
    connection.last_synced_at = utcnow_naive()
    connection.last_error_code = None
    connection.last_error_message = None
    connection.metadata_json = _build_status_metadata(
        connection,
        positions=payload.positions,
        holdings=payload.holdings,
        orders_count=len(payload.orders),
        trades_inserted=trades_inserted,
    )
    db.commit()
    db.refresh(connection)

    return {
        "connection": connection,
        "orders_upserted": orders_upserted,
        "trades_inserted": trades_inserted,
        "completed_trades_rebuilt": trades_inserted > 0,
        "completed_trades_count": completed_count,
        "warnings": [],
    }


def list_broker_orders(
    db: Session,
    *,
    current_user: User,
    connection_id: int | None = None,
    symbol: str | None = None,
    status_filter: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[BrokerOrder], int]:
    query = db.query(BrokerOrder).filter(BrokerOrder.user_id == current_user.id)

    if connection_id is not None:
        query = query.filter(BrokerOrder.broker_connection_id == connection_id)
    if symbol:
        query = query.filter(BrokerOrder.symbol == symbol.upper())
    if status_filter:
        query = query.filter(BrokerOrder.status == status_filter.upper())

    total = query.count()
    items = (
        query.order_by(BrokerOrder.executed_at.desc(), BrokerOrder.id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return items, total
