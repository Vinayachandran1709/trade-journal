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

os.environ["DATABASE_URL"] = "sqlite:///./test_charges_engine.sqlite3"
os.environ["SECRET_KEY"] = "test-secret-key"

from app.database import Base  # noqa: E402
from app.models.completed_trade import CompletedTrade  # noqa: E402
from app.models.trade import Trade  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.auth_service import hash_password  # noqa: E402
from app.services.trade_processor import calculate_completed_trades  # noqa: E402


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
        tables=[User.__table__, Trade.__table__, CompletedTrade.__table__],
    )
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(
            bind=engine,
            tables=[CompletedTrade.__table__, Trade.__table__, User.__table__],
        )


def create_user(db_session) -> User:
    user = User(
        email="charges-tests@example.com",
        hashed_password=hash_password("password123"),
        name="Charges Tests",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def add_trade(
    db_session,
    *,
    user_id: int,
    stock_symbol: str,
    trade_type: str,
    quantity: int,
    price: str,
    trade_date: date,
    instrument_type: str,
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


def test_options_premium_turnover_and_lot_size_scaling(db_session):
    user = create_user(db_session)
    add_trade(
        db_session,
        user_id=user.id,
        stock_symbol="NIFTY2652823100CE",
        trade_type="BUY",
        quantity=1,
        price="100.00",
        trade_date=date(2026, 5, 27),
        instrument_type="OPT",
    )
    add_trade(
        db_session,
        user_id=user.id,
        stock_symbol="NIFTY2652823100CE",
        trade_type="SELL",
        quantity=1,
        price="110.00",
        trade_date=date(2026, 5, 28),
        instrument_type="OPT",
    )

    completed = calculate_completed_trades(db_session, user.id)

    assert len(completed) == 1
    trade = completed[0]
    assert trade.gross_pnl == Decimal("500.00")
    assert trade.pnl == Decimal("500.00")
    assert trade.total_charges == Decimal("56.84")
    assert trade.net_pnl == Decimal("443.16")


def test_futures_turnover_uses_price_times_lot_size(db_session):
    user = create_user(db_session)
    add_trade(
        db_session,
        user_id=user.id,
        stock_symbol="BANKNIFTY26MAYFUT",
        trade_type="BUY",
        quantity=2,
        price="50000.00",
        trade_date=date(2026, 5, 20),
        instrument_type="FUT",
    )
    add_trade(
        db_session,
        user_id=user.id,
        stock_symbol="BANKNIFTY26MAYFUT",
        trade_type="SELL",
        quantity=2,
        price="50010.00",
        trade_date=date(2026, 5, 21),
        instrument_type="FUT",
    )

    completed = calculate_completed_trades(db_session, user.id)

    assert len(completed) == 1
    trade = completed[0]
    assert trade.gross_pnl == Decimal("500.00")
    assert trade.total_charges == Decimal("3315.06")
    assert trade.net_pnl == Decimal("-2815.06")


def test_stocks_remain_zero_charge_for_backward_compatibility(db_session):
    user = create_user(db_session)
    add_trade(
        db_session,
        user_id=user.id,
        stock_symbol="TCS",
        trade_type="BUY",
        quantity=10,
        price="100.00",
        trade_date=date(2026, 5, 20),
        instrument_type="STK",
    )
    add_trade(
        db_session,
        user_id=user.id,
        stock_symbol="TCS",
        trade_type="SELL",
        quantity=10,
        price="101.00",
        trade_date=date(2026, 5, 21),
        instrument_type="STK",
    )

    completed = calculate_completed_trades(db_session, user.id)

    assert completed[0].gross_pnl == Decimal("10.00")
    assert completed[0].total_charges == Decimal("0.00")
    assert completed[0].net_pnl == Decimal("10.00")
