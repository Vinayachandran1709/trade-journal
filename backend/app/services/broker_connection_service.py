from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.broker_connection import BrokerConnection
from app.models.user import User
from app.schemas.broker import DhanConnectRequest
from app.services.brokers.base import BrokerAPIError, BrokerAuthError
from app.services.brokers.dhan import DhanBrokerClient
from app.services.token_encryption_service import (
    TokenEncryptionError,
    encrypt_token,
)
from app.utils.datetime import utcnow_naive


SUPPORTED_BROKERS = [
    {
        "code": "dhan",
        "label": "Dhan",
        "status": "active",
        "connection_fields": ["client_id", "access_token", "account_label"],
    },
    {
        "code": "angel_one",
        "label": "Angel One",
        "status": "planned",
        "connection_fields": [],
    },
]


def list_supported_brokers() -> list[dict[str, Any]]:
    return SUPPORTED_BROKERS


def list_user_broker_connections(db: Session, user_id: int) -> list[BrokerConnection]:
    return (
        db.query(BrokerConnection)
        .filter(BrokerConnection.user_id == user_id)
        .order_by(BrokerConnection.created_at.desc(), BrokerConnection.id.desc())
        .all()
    )


def get_user_broker_connection(
    db: Session, user_id: int, connection_id: int
) -> BrokerConnection:
    connection = (
        db.query(BrokerConnection)
        .filter(
            BrokerConnection.id == connection_id,
            BrokerConnection.user_id == user_id,
        )
        .first()
    )
    if connection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Broker connection not found",
        )
    return connection


def _http_502(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=detail,
    )


def connect_dhan_broker(
    db: Session,
    *,
    current_user: User,
    request: DhanConnectRequest,
) -> BrokerConnection:
    try:
        encrypted_token = encrypt_token(request.access_token)
    except TokenEncryptionError as exc:
        raise _http_502(str(exc))

    client = DhanBrokerClient(
        access_token=request.access_token,
        client_id=request.client_id,
    )

    existing_for_client = (
        db.query(BrokerConnection)
        .filter(
            BrokerConnection.user_id == current_user.id,
            BrokerConnection.broker_name == "dhan",
            BrokerConnection.client_id == request.client_id.strip(),
        )
        .first()
    )

    try:
        validation = client.validate_credentials()
    except BrokerAuthError as exc:
        if existing_for_client is not None:
            existing_for_client.auth_status = "reauth_required"
            existing_for_client.last_error_code = exc.error_code
            existing_for_client.last_error_message = str(exc)
            existing_for_client.sync_status = "failed"
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        )
    except BrokerAPIError as exc:
        if existing_for_client is not None:
            existing_for_client.auth_status = "error"
            existing_for_client.last_error_message = str(exc)
            existing_for_client.sync_status = "failed"
            db.commit()
        raise _http_502(str(exc))

    (
        db.query(BrokerConnection)
        .filter(
            BrokerConnection.user_id == current_user.id,
            BrokerConnection.broker_name == "dhan",
            BrokerConnection.id != (existing_for_client.id if existing_for_client else -1),
            BrokerConnection.is_active.is_(True),
        )
        .update({"is_active": False}, synchronize_session=False)
    )

    connection = existing_for_client
    if connection is None:
        connection = BrokerConnection(
            user_id=current_user.id,
            broker_name="dhan",
            client_id=request.client_id.strip(),
        )
        db.add(connection)

    connection.client_id = request.client_id.strip()
    connection.broker_user_id = validation.broker_user_id or request.client_id.strip()
    connection.account_label = (
        request.account_label.strip() if request.account_label else connection.account_label
    )
    connection.access_token_encrypted = encrypted_token
    connection.refresh_token_encrypted = None
    connection.auth_status = "connected"
    connection.sync_status = (
        "never_synced"
        if connection.last_synced_at is None
        else connection.sync_status or "never_synced"
    )
    connection.last_error_code = None
    connection.last_error_message = None
    connection.metadata_json = {
        **(connection.metadata_json or {}),
        "broker_user_id": validation.broker_user_id or request.client_id.strip(),
        "validated_at": utcnow_naive().isoformat(),
        **validation.metadata,
    }
    connection.is_active = True

    db.commit()
    db.refresh(connection)
    return connection


def disconnect_broker_connection(
    db: Session, *, current_user: User, connection_id: int
) -> BrokerConnection:
    connection = get_user_broker_connection(db, current_user.id, connection_id)
    connection.access_token_encrypted = None
    connection.refresh_token_encrypted = None
    connection.auth_status = "disconnected"
    connection.sync_status = "never_synced"
    connection.is_active = False
    connection.last_error_code = None
    connection.last_error_message = None
    db.commit()
    db.refresh(connection)
    return connection


def get_broker_connection_status(
    db: Session, *, current_user: User, connection_id: int
) -> BrokerConnection:
    return get_user_broker_connection(db, current_user.id, connection_id)
