import os
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ["DATABASE_URL"] = "sqlite:///./test_expiry_tilt_detector.sqlite3"
os.environ["SECRET_KEY"] = "test-secret-key"

from app.database import Base  # noqa: E402
from app.models.completed_trade import CompletedTrade  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.auth_service import hash_password  # noqa: E402
from app.services.behavioral_engine import detect_expiry_day_tilt, is_expiry_session  # noqa: E402


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db_session():
    Base.metadata.create_all(bind=engine, tables=[User.__table__, CompletedTrade.__table__])
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine, tables=[CompletedTrade.__table__, User.__table__])


def create_user(db_session) -> User:
    user = User(
        email="expiry-tests@example.com",
        hashed_password=hash_password("password123"),
        name="Expiry Tests",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def make_trade(user_id: int, exit_date: date, net_pnl: str, symbol: str = "NIFTY2652823100CE") -> CompletedTrade:
    pnl_value = Decimal(net_pnl)
    return CompletedTrade(
        user_id=user_id,
        stock_symbol=symbol,
        entry_date=exit_date,
        exit_date=exit_date,
        entry_price=Decimal("100.00"),
        exit_price=Decimal("110.00"),
        quantity=1,
        pnl=pnl_value,
        gross_pnl=pnl_value,
        total_charges=Decimal("0.00"),
        net_pnl=pnl_value,
        return_pct=Decimal("10.00"),
        holding_days=0,
    )


def test_is_expiry_session_uses_explicit_weekday_map():
    assert is_expiry_session("MIDCPNIFTY", date(2026, 5, 25)) is True
    assert is_expiry_session("FINNIFTY", date(2026, 5, 26)) is True
    assert is_expiry_session("BANKNIFTY", date(2026, 5, 27)) is True
    assert is_expiry_session("NIFTY", date(2026, 5, 28)) is True
    assert is_expiry_session("SENSEX", date(2026, 5, 29)) is True


def test_expiry_tilt_requires_minimum_sample_size(db_session):
    user = create_user(db_session)
    db_session.add_all(
        [
            make_trade(user.id, date(2026, 5, 28), "-100.00"),
            make_trade(user.id, date(2026, 5, 27), "150.00"),
        ]
    )
    db_session.commit()

    assert detect_expiry_day_tilt(user.id, db_session) is None


def test_expiry_tilt_returns_high_severity_for_large_degradation(db_session):
    user = create_user(db_session)
    expiry_trades = [make_trade(user.id, date(2026, 5, 28), "-1500.00") for _ in range(10)]
    normal_trades = [make_trade(user.id, date(2026, 5, 27), "600.00") for _ in range(10)]
    db_session.add_all(expiry_trades + normal_trades)
    db_session.commit()

    result = detect_expiry_day_tilt(user.id, db_session)

    assert result is not None
    assert result["severity"] == "high"
    assert result["data"]["expiry_trade_count"] == 10
    assert result["data"]["normal_trade_count"] == 10
    assert result["data"]["expiry_win_rate"] == 0.0
    assert result["data"]["normal_win_rate"] == 100.0
    assert result["data"]["estimated_loss"] == 21000.0


def test_expiry_tilt_ignores_unknown_and_bad_data(db_session):
    user = create_user(db_session)
    db_session.add(make_trade(user.id, date(2026, 5, 28), "-500.00", symbol="NIFTY26XYZ23100CE"))
    db_session.commit()

    assert detect_expiry_day_tilt(user.id, db_session) is None
    assert is_expiry_session(None, None) is False
