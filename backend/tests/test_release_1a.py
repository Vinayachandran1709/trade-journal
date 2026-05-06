import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ["DATABASE_URL"] = "sqlite:///./test_release_1a.sqlite3"
os.environ["SECRET_KEY"] = "test-secret-key"

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.completed_trade import CompletedTrade  # noqa: E402
from app.models.trade import Trade  # noqa: E402
from app.models.trade_setup import TradeSetup  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.auth_service import create_access_token, hash_password  # noqa: E402
from app.services.universal_csv_parser import detect_broker_from_headers  # noqa: E402


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def client():
    Base.metadata.create_all(
        bind=engine,
        tables=[
            User.__table__,
            Trade.__table__,
            CompletedTrade.__table__,
            TradeSetup.__table__,
        ],
    )

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
    Base.metadata.drop_all(
        bind=engine,
        tables=[
            TradeSetup.__table__,
            CompletedTrade.__table__,
            Trade.__table__,
            User.__table__,
        ],
    )


@pytest.fixture()
def auth_headers(client: TestClient):
    db = TestingSessionLocal()
    user = User(
        email="release1a@example.com",
        hashed_password=hash_password("password123"),
        name="Release 1A",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()

    token = create_access_token({"sub": user.email})
    return {"Authorization": f"Bearer {token}"}


def test_auto_capture_dedupe_uses_manual_import_key(client: TestClient, auth_headers: dict[str, str]):
    response = client.post(
        "/api/trades/auto-capture",
        headers=auth_headers,
        json={
            "broker": "zerodha",
            "capture_method": "dom",
            "trades": [
                {
                    "stock_symbol": "TCS",
                    "trade_type": "BUY",
                    "quantity": 10,
                    "price": 3850,
                    "trade_date": "2026-04-17",
                    "trade_time": "09:20:00",
                    "instrument_type": "EQUITY",
                },
                {
                    "stock_symbol": "TCS",
                    "trade_type": "BUY",
                    "quantity": 10,
                    "price": 3850,
                    "trade_date": "2026-04-17",
                    "trade_time": "09:21:00",
                    "instrument_type": "EQUITY",
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["imported_count"] == 1
    assert payload["duplicate_count"] == 1
    assert payload["trades"][0]["entry_method"] == "dom"


@pytest.mark.parametrize(
    ("headers", "expected_broker"),
    [
        (["Tradingsymbol", "Exchange", "Trade Date", "Trade Type", "Quantity"], "zerodha"),
        (["Trade Date", "Stock Symbol", "Transaction Type", "Quantity", "Price"], "groww"),
        (["Symbol", "Buy Sell", "Net Qty", "Avg Price"], "angel_one"),
        (["Trading Symbol", "Transaction Type", "Quantity", "Order Date"], "upstox"),
        (["Security Name", "Type", "Executed Qty", "Avg Traded Price"], "dhan"),
        (["Scrip Name", "Buy Sell", "Qty", "Rate"], "5paisa"),
        (["Stock", "Action", "Qty", "Price", "Trade Date"], "icici_direct"),
        (["Symbol", "Transaction Type", "Quantity", "Average Price"], "hdfc_sec"),
        (["Symbol", "B S", "Qty", "Price", "Date"], "kotak_sec"),
        (["Scrip", "Buy Sell", "Qty", "Rate", "Trade Date"], "motilal_oswal"),
    ],
)
def test_universal_csv_broker_detection(headers: list[str], expected_broker: str):
    broker, confidence = detect_broker_from_headers(headers)

    assert broker == expected_broker
    assert confidence >= 0.75


def test_repeated_extension_capture_is_idempotent(
    client: TestClient, auth_headers: dict[str, str]
):
    payload = {
        "broker": "groww",
        "capture_method": "dom",
        "trades": [
            {
                "stock_symbol": "INFY",
                "trade_type": "SELL",
                "quantity": 5,
                "price": 1420.5,
                "trade_date": "2026-04-18",
                "trade_time": "10:15:00",
                "instrument_type": "EQUITY",
            }
        ],
    }

    first = client.post("/api/trades/auto-capture", headers=auth_headers, json=payload)
    second = client.post("/api/trades/auto-capture", headers=auth_headers, json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["imported_count"] == 1
    assert second.json()["imported_count"] == 0
    assert second.json()["duplicate_count"] == 1
