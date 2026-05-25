import os
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ["DATABASE_URL"] = "sqlite:///./test_trade_processing.sqlite3"
os.environ["SECRET_KEY"] = "test-secret-key"

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.completed_trade import CompletedTrade  # noqa: E402
from app.models.trade import Trade  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.auth_service import create_access_token, hash_password  # noqa: E402
from app.services.behavioral_engine import detect_expiry_day_tilt  # noqa: E402
from app.services.trade_processor import (  # noqa: E402
    calculate_completed_trades,
    parse_trade_instrument,
)


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db_session():
    Base.metadata.create_all(bind=engine, tables=[User.__table__, Trade.__table__, CompletedTrade.__table__])
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine, tables=[CompletedTrade.__table__, Trade.__table__, User.__table__])


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


def create_user(db_session, *, preferences=None, email="trade-tests@example.com") -> User:
    user = User(
        email=email,
        hashed_password=hash_password("password123"),
        name="Trade Tests",
        preferences=preferences,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def auth_headers_for(user: User) -> dict[str, str]:
    token = create_access_token({"sub": user.email})
    return {"Authorization": f"Bearer {token}"}


def add_trade(
    db_session,
    *,
    user_id: int,
    stock_symbol: str,
    trade_type: str,
    quantity: int,
    price: str,
    trade_date: date,
    instrument_type: str | None = None,
):
    db_session.add(
        Trade(
            user_id=user_id,
            stock_symbol=stock_symbol,
            trade_type=trade_type,
            quantity=quantity,
            price=Decimal(price),
            trade_date=trade_date,
            instrument_type=instrument_type,
        )
    )
    db_session.commit()


def test_parse_trade_instrument_supports_monthly_option():
    parsed = parse_trade_instrument("NIFTY26MAY18000CE")

    assert parsed.instrument_type == "OPT"
    assert parsed.underlying_asset == "NIFTY"
    assert parsed.option_type == "CE"
    assert parsed.strike_price == Decimal("18000")
    assert parsed.expiry_date == date(2026, 5, 28)


def test_parse_trade_instrument_supports_weekly_option():
    parsed = parse_trade_instrument("BANKNIFTY2651452000PE")

    assert parsed.instrument_type == "OPT"
    assert parsed.underlying_asset == "BANKNIFTY"
    assert parsed.option_type == "PE"
    assert parsed.strike_price == Decimal("52000")
    assert parsed.expiry_date == date(2026, 5, 14)


def test_parse_trade_instrument_supports_futures():
    parsed = parse_trade_instrument("FINNIFTY26MAYFUT")

    assert parsed.instrument_type == "FUT"
    assert parsed.underlying_asset == "FINNIFTY"
    assert parsed.expiry_date == date(2026, 5, 26)


def test_calculate_completed_trades_keeps_stock_net_equal_to_gross(db_session):
    user = create_user(db_session)
    add_trade(
        db_session,
        user_id=user.id,
        stock_symbol="RELIANCE.NS",
        trade_type="BUY",
        quantity=10,
        price="100.00",
        trade_date=date(2026, 5, 20),
    )
    add_trade(
        db_session,
        user_id=user.id,
        stock_symbol="RELIANCE.NS",
        trade_type="SELL",
        quantity=10,
        price="110.00",
        trade_date=date(2026, 5, 21),
    )

    completed = calculate_completed_trades(db_session, user.id)

    assert len(completed) == 1
    assert completed[0].stock_symbol == "RELIANCE"
    assert completed[0].pnl == Decimal("100.00")
    assert completed[0].gross_pnl == Decimal("100.00")
    assert completed[0].total_charges == Decimal("0.00")
    assert completed[0].net_pnl == Decimal("100.00")


def test_calculate_completed_trades_uses_contract_level_fifo(db_session):
    user = create_user(db_session)
    add_trade(
        db_session,
        user_id=user.id,
        stock_symbol="NIFTY26MAY18000CE",
        trade_type="BUY",
        quantity=1,
        price="100.00",
        trade_date=date(2026, 5, 20),
        instrument_type="OPT",
    )
    add_trade(
        db_session,
        user_id=user.id,
        stock_symbol="NIFTY26MAY18100CE",
        trade_type="BUY",
        quantity=1,
        price="80.00",
        trade_date=date(2026, 5, 20),
        instrument_type="OPT",
    )
    add_trade(
        db_session,
        user_id=user.id,
        stock_symbol="NIFTY26MAY18000CE",
        trade_type="SELL",
        quantity=1,
        price="120.00",
        trade_date=date(2026, 5, 21),
        instrument_type="OPT",
    )

    completed = calculate_completed_trades(db_session, user.id)

    assert len(completed) == 1
    assert completed[0].stock_symbol == "NIFTY26MAY18000CE"
    assert completed[0].quantity == 1
    assert completed[0].pnl == Decimal("1000.00")
    assert completed[0].gross_pnl == Decimal("1000.00")
    assert completed[0].total_charges == Decimal("57.45")
    assert completed[0].net_pnl == Decimal("942.55")


def test_detect_expiry_day_tilt_uses_net_pnl_and_returns_severity(db_session):
    user = create_user(db_session)
    trades = [
        *[
            CompletedTrade(
                user_id=user.id,
                stock_symbol="NIFTY26MAY18000CE",
                entry_date=date(2026, 5, 1),
                exit_date=date(2026, 5, 28),
                entry_price=Decimal("100"),
                exit_price=Decimal("90"),
                quantity=1,
                pnl=Decimal("-1500"),
                gross_pnl=Decimal("-1500"),
                total_charges=Decimal("50"),
                net_pnl=Decimal("-1500"),
                return_pct=Decimal("-10"),
                holding_days=0,
            )
            for _ in range(10)
        ],
        *[
            CompletedTrade(
                user_id=user.id,
                stock_symbol="NIFTY26MAY18000CE",
                entry_date=date(2026, 5, 2),
                exit_date=date(2026, 5, 27),
                entry_price=Decimal("100"),
                exit_price=Decimal("120"),
                quantity=1,
                pnl=Decimal("600"),
                gross_pnl=Decimal("600"),
                total_charges=Decimal("50"),
                net_pnl=Decimal("600"),
                return_pct=Decimal("20"),
                holding_days=0,
            )
            for _ in range(10)
        ],
    ]
    db_session.add_all(trades)
    db_session.commit()

    result = detect_expiry_day_tilt(user.id, db_session)

    assert result is not None
    assert result["pattern_type"] == "expiry_day_tilt"
    assert result["severity"] == "high"
    assert result["data"]["estimated_loss"] == 21000.0


def test_detect_expiry_day_tilt_returns_none_without_comparison_set(db_session):
    user = create_user(db_session)
    db_session.add(
        CompletedTrade(
            user_id=user.id,
            stock_symbol="BANKNIFTY26MAY48000PE",
            entry_date=date(2026, 5, 1),
            exit_date=date(2026, 5, 27),
            entry_price=Decimal("100"),
            exit_price=Decimal("90"),
            quantity=25,
            pnl=Decimal("-250"),
            gross_pnl=Decimal("-250"),
            total_charges=Decimal("20"),
            net_pnl=Decimal("-270"),
            return_pct=Decimal("-10"),
            holding_days=0,
        )
    )
    db_session.commit()

    assert detect_expiry_day_tilt(user.id, db_session) is None


def test_trade_summary_and_preferences_round_trip(client, db_session):
    today_ist = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    user = create_user(
        db_session,
        preferences={"brokers": [], "sectors": [], "style": None, "daily_loss_limit": 1500},
    )
    add_trade(
        db_session,
        user_id=user.id,
        stock_symbol="TCS",
        trade_type="BUY",
        quantity=5,
        price="100.00",
        trade_date=today_ist,
    )
    db_session.add(
        CompletedTrade(
            user_id=user.id,
            stock_symbol="NIFTY26MAY18000CE",
            entry_date=today_ist,
            exit_date=today_ist,
            entry_price=Decimal("100"),
            exit_price=Decimal("90"),
            quantity=50,
            pnl=Decimal("-500"),
            gross_pnl=Decimal("-500"),
            total_charges=Decimal("45"),
            net_pnl=Decimal("-545"),
            return_pct=Decimal("-10"),
            holding_days=0,
        )
    )
    db_session.commit()

    headers = auth_headers_for(user)
    summary_response = client.get("/api/trades/summary", headers=headers)
    completed_response = client.get("/api/trades/completed", headers=headers)
    preferences_response = client.patch(
        "/api/auth/preferences",
        headers=headers,
        json={
            "brokers": ["zerodha"],
            "sectors": ["IT"],
            "style": "swing",
            "daily_loss_limit": 2500,
        },
    )

    assert summary_response.status_code == 200
    assert summary_response.json()["net_pnl_today"] == -545.0
    assert summary_response.json()["max_loss_threshold"] == 1500.0

    assert completed_response.status_code == 200
    completed_payload = completed_response.json()["trades"][0]
    assert completed_payload["gross_pnl"] == -500.0
    assert completed_payload["total_charges"] == 45.0
    assert completed_payload["net_pnl"] == -545.0

    assert preferences_response.status_code == 200
    assert preferences_response.json()["preferences"]["daily_loss_limit"] == 2500
