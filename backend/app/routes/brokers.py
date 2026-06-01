from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.broker import (
    BrokerConnectionStatusResponse,
    BrokerConnectionSummary,
    BrokerOrdersListResponse,
    BrokerSyncResponse,
    DhanConnectRequest,
    SupportedBrokerResponse,
)
from app.services.broker_connection_service import (
    connect_dhan_broker,
    disconnect_broker_connection,
    get_broker_connection_status,
    list_supported_brokers,
    list_user_broker_connections,
)
from app.services.broker_sync_service import list_broker_orders, sync_broker_connection
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/brokers", tags=["brokers"])


@router.get("/supported", response_model=list[SupportedBrokerResponse])
def get_supported_brokers() -> list[SupportedBrokerResponse]:
    return [SupportedBrokerResponse(**item) for item in list_supported_brokers()]


@router.get("/connections", response_model=list[BrokerConnectionSummary])
def get_connections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BrokerConnectionSummary]:
    return list_user_broker_connections(db, current_user.id)


@router.post("/dhan/connect", response_model=BrokerConnectionSummary)
def connect_dhan(
    request: DhanConnectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BrokerConnectionSummary:
    return connect_dhan_broker(db, current_user=current_user, request=request)


@router.post("/{connection_id}/sync", response_model=BrokerSyncResponse)
def sync_connection(
    connection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BrokerSyncResponse:
    result = sync_broker_connection(
        db,
        current_user=current_user,
        connection_id=connection_id,
    )
    return BrokerSyncResponse(**result)


@router.post("/{connection_id}/disconnect", response_model=BrokerConnectionSummary)
def disconnect_connection(
    connection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BrokerConnectionSummary:
    return disconnect_broker_connection(
        db,
        current_user=current_user,
        connection_id=connection_id,
    )


@router.get("/{connection_id}/status", response_model=BrokerConnectionStatusResponse)
def connection_status(
    connection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BrokerConnectionStatusResponse:
    return get_broker_connection_status(
        db,
        current_user=current_user,
        connection_id=connection_id,
    )


@router.get("/orders", response_model=BrokerOrdersListResponse)
def broker_orders(
    connection_id: int | None = Query(None),
    symbol: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BrokerOrdersListResponse:
    items, total = list_broker_orders(
        db,
        current_user=current_user,
        connection_id=connection_id,
        symbol=symbol,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )
    return BrokerOrdersListResponse(items=items, total=total)
