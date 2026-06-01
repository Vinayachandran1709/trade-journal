import base64
import os
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ["DATABASE_URL"] = "sqlite:///./test_broker_sync.sqlite3"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["BROKER_TOKEN_ENCRYPTION_KEY"] = base64.urlsafe_b64encode(
    b"1234567890ABCDEF1234567890ABCDEF"
).decode("utf-8")

from app.config import settings  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.broker_connection import BrokerConnection  # noqa: E402
from app.models.broker_order import BrokerOrder  # noqa: E402
from app.models.completed_trade import CompletedTrade  # noqa: E402
from app.models.trade import Trade  # noqa: E402
from app.models.trade_setup import TradeSetup  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.auth_service import create_access_token, hash_password  # noqa: E402
from app.services.brokers.base import BrokerAuthError, BrokerValidationResult  # noqa: E402
from app.services.brokers.dhan import DhanSyncPayload  # noqa: E402
from app.services.broker_order_mapper import aggregate_dhan_trades_to_trade_payloads  # noqa: E402
from app.services.token_encryption_service import (  # noqa: E402
    TokenEncryptionError,
    decrypt_token,
    encrypt_token,
)


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db_session():
    Base.metadata.create_all(
        bind=engine,
        tables=[
            User.__table__,
            Trade.__table__,
            CompletedTrade.__table__,
            TradeSetup.__table__,
            BrokerConnection.__table__,
            BrokerOrder.__table__,
        ],
    )
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(
            bind=engine,
            tables=[
                BrokerOrder.__table__,
                BrokerConnection.__table__,
                TradeSetup.__table__,
                CompletedTrade.__table__,
                Trade.__table__,
                User.__table__,
            ],
        )


@pytest.fixture()
def client(db_session):
    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def create_user(db_session, *, email: str) -> User:
    user = User(
        email=email,
        hashed_password=hash_password("password123"),
        name="Broker Test User",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def auth_headers_for(user: User) -> dict[str, str]:
    token = create_access_token({"sub": user.email})
    return {"Authorization": f"Bearer {token}"}


def sample_orders() -> list[dict]:
    return [
        {
            "dhanClientId": "CID123",
            "orderId": "ORD-1",
            "exchangeOrderId": "EX-1",
            "correlationId": "COR-1",
            "orderStatus": "TRADED",
            "transactionType": "BUY",
            "exchangeSegment": "NSE_EQ",
            "productType": "CNC",
            "orderType": "LIMIT",
            "validity": "DAY",
            "tradingSymbol": "INFY",
            "securityId": "1594",
            "quantity": 10,
            "disclosedQuantity": 0,
            "price": "100.00",
            "triggerPrice": "0",
            "afterMarketOrder": False,
            "boProfitValue": None,
            "boStopLossValue": None,
            "legName": None,
            "createTime": "2026-05-01 09:15:00",
            "updateTime": "2026-05-01 09:16:00",
            "exchangeTime": "2026-05-01 09:16:00",
            "drvExpiryDate": None,
            "drvOptionType": None,
            "drvStrikePrice": None,
            "omsErrorCode": None,
            "omsErrorDescription": None,
            "algoId": None,
            "remainingQuantity": 0,
            "averageTradedPrice": "100.00",
            "filledQty": 10,
        },
        {
            "dhanClientId": "CID123",
            "orderId": "ORD-2",
            "exchangeOrderId": "EX-2",
            "correlationId": "COR-2",
            "orderStatus": "TRADED",
            "transactionType": "SELL",
            "exchangeSegment": "NSE_EQ",
            "productType": "CNC",
            "orderType": "LIMIT",
            "validity": "DAY",
            "tradingSymbol": "INFY",
            "securityId": "1594",
            "quantity": 10,
            "disclosedQuantity": 0,
            "price": "120.00",
            "triggerPrice": "0",
            "afterMarketOrder": False,
            "boProfitValue": None,
            "boStopLossValue": None,
            "legName": None,
            "createTime": "2026-05-02 09:15:00",
            "updateTime": "2026-05-02 09:16:00",
            "exchangeTime": "2026-05-02 09:16:00",
            "drvExpiryDate": None,
            "drvOptionType": None,
            "drvStrikePrice": None,
            "omsErrorCode": None,
            "omsErrorDescription": None,
            "algoId": None,
            "remainingQuantity": 0,
            "averageTradedPrice": "120.00",
            "filledQty": 10,
        },
    ]


def sample_trades() -> list[dict]:
    return [
        {
            "dhanClientId": "CID123",
            "orderId": "ORD-1",
            "exchangeOrderId": "EX-1",
            "exchangeTradeId": "TR-1",
            "transactionType": "BUY",
            "exchangeSegment": "NSE_EQ",
            "productType": "CNC",
            "orderType": "LIMIT",
            "tradingSymbol": "INFY",
            "customSymbol": "INFY",
            "securityId": "1594",
            "tradedQuantity": 4,
            "tradedPrice": "100.00",
            "createTime": "2026-05-01 09:15:00",
            "updateTime": "2026-05-01 09:16:00",
            "exchangeTime": "2026-05-01 09:16:00",
            "drvExpiryDate": None,
            "drvOptionType": None,
            "drvStrikePrice": None,
        },
        {
            "dhanClientId": "CID123",
            "orderId": "ORD-1",
            "exchangeOrderId": "EX-1",
            "exchangeTradeId": "TR-2",
            "transactionType": "BUY",
            "exchangeSegment": "NSE_EQ",
            "productType": "CNC",
            "orderType": "LIMIT",
            "tradingSymbol": "INFY",
            "customSymbol": "INFY",
            "securityId": "1594",
            "tradedQuantity": 6,
            "tradedPrice": "100.00",
            "createTime": "2026-05-01 09:15:30",
            "updateTime": "2026-05-01 09:16:30",
            "exchangeTime": "2026-05-01 09:16:30",
            "drvExpiryDate": None,
            "drvOptionType": None,
            "drvStrikePrice": None,
        },
        {
            "dhanClientId": "CID123",
            "orderId": "ORD-2",
            "exchangeOrderId": "EX-2",
            "exchangeTradeId": "TR-3",
            "transactionType": "SELL",
            "exchangeSegment": "NSE_EQ",
            "productType": "CNC",
            "orderType": "LIMIT",
            "tradingSymbol": "INFY",
            "customSymbol": "INFY",
            "securityId": "1594",
            "tradedQuantity": 10,
            "tradedPrice": "120.00",
            "createTime": "2026-05-02 09:15:00",
            "updateTime": "2026-05-02 09:16:00",
            "exchangeTime": "2026-05-02 09:16:00",
            "drvExpiryDate": None,
            "drvOptionType": None,
            "drvStrikePrice": None,
        },
    ]


def patch_dhan_validation(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        "app.services.brokers.dhan.DhanBrokerClient.validate_credentials",
        lambda self: BrokerValidationResult(
            broker_user_id="CID123",
            metadata={"validated_with": "test"},
        ),
    )


def patch_dhan_sync(monkeypatch: pytest.MonkeyPatch, *, orders=None, trades=None):
    monkeypatch.setattr(
        "app.services.brokers.dhan.DhanBrokerClient.fetch_sync_payload",
        lambda self: DhanSyncPayload(
            orders=orders or sample_orders(),
            trades=trades or sample_trades(),
            positions=[{"symbol": "INFY", "netQty": 0}],
            holdings=[{"symbol": "INFY", "quantity": 0}],
        ),
    )


def create_connection(db_session, *, user_id: int, client_id: str = "CID123") -> BrokerConnection:
    connection = BrokerConnection(
        user_id=user_id,
        broker_name="dhan",
        client_id=client_id,
        broker_user_id=client_id,
        access_token_encrypted=encrypt_token("valid-token"),
        auth_status="connected",
        sync_status="never_synced",
        is_active=True,
    )
    db_session.add(connection)
    db_session.commit()
    db_session.refresh(connection)
    return connection


def test_token_encryption_roundtrip():
    encrypted = encrypt_token("secret-token")

    assert encrypted != "secret-token"
    assert decrypt_token(encrypted) == "secret-token"


def test_missing_broker_token_encryption_key_returns_clear_error():
    original = settings.BROKER_TOKEN_ENCRYPTION_KEY
    settings.BROKER_TOKEN_ENCRYPTION_KEY = ""
    try:
        with pytest.raises(TokenEncryptionError) as exc:
            encrypt_token("secret-token")
    finally:
        settings.BROKER_TOKEN_ENCRYPTION_KEY = original

    assert "BROKER_TOKEN_ENCRYPTION_KEY" in str(exc.value)


def test_dhan_connect_invalid_token_does_not_persist_bad_token_for_new_connection(
    client: TestClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    user = create_user(db_session, email="invalid-connect@example.com")
    headers = auth_headers_for(user)

    monkeypatch.setattr(
        "app.services.brokers.dhan.DhanBrokerClient.validate_credentials",
        lambda self: (_ for _ in ()).throw(
            BrokerAuthError(
                "Invalid token",
                status_code=401,
                error_code="DH-901",
                error_type="Invalid_Authentication",
            )
        ),
    )

    response = client.post(
        "/api/brokers/dhan/connect",
        headers=headers,
        json={"client_id": "CID123", "access_token": "bad-token"},
    )

    assert response.status_code == 401
    assert db_session.query(BrokerConnection).count() == 0


def test_dhan_sync_dh901_marks_connection_reauth_required(
    client: TestClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    user = create_user(db_session, email="reauth@example.com")
    connection = create_connection(db_session, user_id=user.id)
    headers = auth_headers_for(user)

    monkeypatch.setattr(
        "app.services.brokers.dhan.DhanBrokerClient.fetch_sync_payload",
        lambda self: (_ for _ in ()).throw(
            BrokerAuthError(
                "Invalid token",
                status_code=401,
                error_code="DH-901",
                error_type="Invalid_Authentication",
            )
        ),
    )

    response = client.post(f"/api/brokers/{connection.id}/sync", headers=headers)

    assert response.status_code == 401
    db_session.refresh(connection)
    assert connection.auth_status == "reauth_required"
    assert connection.sync_status == "failed"
    assert connection.last_error_code == "DH-901"


def test_dhan_trade_records_map_to_trade_insert_payloads():
    aggregated = aggregate_dhan_trades_to_trade_payloads(sample_trades())

    assert len(aggregated) == 2
    buy_payload = next(item for item in aggregated if item["order_id"] == "ORD-1")
    assert buy_payload["stock_symbol"] == "INFY"
    assert buy_payload["trade_type"] == "BUY"
    assert buy_payload["quantity"] == 10
    assert buy_payload["price"] == Decimal("100.00")
    assert buy_payload["trade_date"] == date(2026, 5, 1)
    assert str(buy_payload["trade_time"]) == "09:16:00"
    assert buy_payload["broker"] == "dhan"
    assert buy_payload["import_source"] == "broker_sync"
    assert buy_payload["entry_method"] == "broker_api"


def test_dhan_orders_upsert_broker_orders_and_insert_trades(
    client: TestClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    user = create_user(db_session, email="sync-success@example.com")
    connection = create_connection(db_session, user_id=user.id)
    headers = auth_headers_for(user)
    patch_dhan_sync(monkeypatch)

    response = client.post(f"/api/brokers/{connection.id}/sync", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["orders_upserted"] == 2
    assert payload["trades_inserted"] == 2
    assert payload["completed_trades_rebuilt"] is True
    assert db_session.query(BrokerOrder).count() == 2
    assert db_session.query(Trade).count() == 2
    assert db_session.query(CompletedTrade).count() == 1


def test_duplicate_sync_does_not_duplicate_broker_orders_or_trades(
    client: TestClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    user = create_user(db_session, email="dedupe@example.com")
    connection = create_connection(db_session, user_id=user.id)
    headers = auth_headers_for(user)
    patch_dhan_sync(monkeypatch)

    first = client.post(f"/api/brokers/{connection.id}/sync", headers=headers)
    second = client.post(f"/api/brokers/{connection.id}/sync", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert db_session.query(BrokerOrder).count() == 2
    assert db_session.query(Trade).count() == 2
    assert second.json()["trades_inserted"] == 0
    assert second.json()["completed_trades_rebuilt"] is False


def test_completed_trades_processing_is_triggered_only_when_new_trades_inserted(
    client: TestClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    user = create_user(db_session, email="rebuild@example.com")
    connection = create_connection(db_session, user_id=user.id)
    headers = auth_headers_for(user)
    patch_dhan_sync(monkeypatch)

    first = client.post(f"/api/brokers/{connection.id}/sync", headers=headers)
    second = client.post(f"/api/brokers/{connection.id}/sync", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["completed_trades_rebuilt"] is True
    assert second.json()["completed_trades_rebuilt"] is False


def test_broker_connection_status_and_sync_are_owner_scoped(
    client: TestClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    owner = create_user(db_session, email="owner-broker@example.com")
    intruder = create_user(db_session, email="intruder-broker@example.com")
    connection = create_connection(db_session, user_id=owner.id)
    intruder_headers = auth_headers_for(intruder)
    patch_dhan_sync(monkeypatch)

    status_response = client.get(
        f"/api/brokers/{connection.id}/status",
        headers=intruder_headers,
    )
    sync_response = client.post(
        f"/api/brokers/{connection.id}/sync",
        headers=intruder_headers,
    )

    assert status_response.status_code == 404
    assert sync_response.status_code == 404


def test_disconnect_clears_tokens_and_marks_connection_inactive(
    client: TestClient,
    db_session,
):
    user = create_user(db_session, email="disconnect@example.com")
    connection = create_connection(db_session, user_id=user.id)
    headers = auth_headers_for(user)

    response = client.post(
        f"/api/brokers/{connection.id}/disconnect",
        headers=headers,
    )

    assert response.status_code == 200
    db_session.refresh(connection)
    assert connection.access_token_encrypted is None
    assert connection.auth_status == "disconnected"
    assert connection.is_active is False


def test_connect_reuses_existing_client_and_replaces_token(
    client: TestClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    user = create_user(db_session, email="reconnect@example.com")
    connection = create_connection(db_session, user_id=user.id)
    headers = auth_headers_for(user)
    patch_dhan_validation(monkeypatch)

    response = client.post(
        "/api/brokers/dhan/connect",
        headers=headers,
        json={
            "client_id": "CID123",
            "access_token": "new-valid-token",
            "account_label": "Main Dhan",
        },
    )

    assert response.status_code == 200
    db_session.refresh(connection)
    assert decrypt_token(connection.access_token_encrypted) == "new-valid-token"
    assert connection.account_label == "Main Dhan"


def test_broker_sync_unlinks_existing_trade_setup_before_completed_trade_rebuild(
    client: TestClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    user = create_user(db_session, email="linked-broker-setup@example.com")
    connection = create_connection(db_session, user_id=user.id)
    headers = auth_headers_for(user)

    db_session.add_all(
        [
            Trade(
                user_id=user.id,
                stock_symbol="INFY",
                trade_type="BUY",
                quantity=10,
                price=Decimal("100.00"),
                trade_date=date(2026, 4, 20),
            ),
            Trade(
                user_id=user.id,
                stock_symbol="INFY",
                trade_type="SELL",
                quantity=10,
                price=Decimal("105.00"),
                trade_date=date(2026, 4, 21),
            ),
        ]
    )
    db_session.commit()

    old_completed = CompletedTrade(
        user_id=user.id,
        stock_symbol="INFY",
        entry_date=date(2026, 4, 20),
        exit_date=date(2026, 4, 21),
        entry_price=Decimal("100.00"),
        exit_price=Decimal("105.00"),
        quantity=10,
        pnl=Decimal("50.00"),
        gross_pnl=Decimal("50.00"),
        total_charges=Decimal("0.00"),
        net_pnl=Decimal("50.00"),
        return_pct=Decimal("5.00"),
        holding_days=1,
    )
    db_session.add(old_completed)
    db_session.commit()
    db_session.refresh(old_completed)

    setup = TradeSetup(
        user_id=user.id,
        name="Old linked setup",
        description="existing setup link",
        is_active=True,
        symbol="INFY",
        linked_trade_id=old_completed.id,
        linked_at=datetime(2026, 4, 21, 10, 0, 0),
    )
    db_session.add(setup)
    db_session.commit()

    patch_dhan_sync(monkeypatch)
    response = client.post(f"/api/brokers/{connection.id}/sync", headers=headers)

    assert response.status_code == 200
    db_session.refresh(setup)
    assert setup.linked_trade_id is None
    assert setup.linked_at is None
