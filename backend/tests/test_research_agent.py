import os
import sys
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ["DATABASE_URL"] = "sqlite:///./test_research_agent.sqlite3"
os.environ["SECRET_KEY"] = "test-secret-key"

from app.database import Base  # noqa: E402
from app.models.trade import Trade  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.auth_service import hash_password  # noqa: E402
from app.services.research_agent import (  # noqa: E402
    DISCLAIMER,
    _ensure_compliant_response,
    _get_open_positions,
    classify_query,
    extract_symbols,
)


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db_session():
    Base.metadata.create_all(bind=engine, tables=[User.__table__, Trade.__table__])
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine, tables=[Trade.__table__, User.__table__])


def create_user(db_session, email: str = "research@example.com") -> User:
    user = User(
        email=email,
        hashed_password=hash_password("password123"),
        name="Research User",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_classify_query_routes_portfolio_before_trade_summary():
    assert classify_query("How is my portfolio positioned right now?") == "portfolio"
    assert classify_query("What am I still holding?") == "portfolio"
    assert classify_query("How did I do this month?") == "my_trades"


def test_extract_symbols_finds_tickers_and_company_names():
    assert extract_symbols("Between INFY and TCS, which looks stronger today?") == ["INFY", "TCS"]
    assert extract_symbols("Compare Infosys vs TCS vs Reliance") == ["INFY", "TCS", "RELIANCE"]
    assert extract_symbols("What is happening in hdfc bank today?") == ["HDFCBANK"]


def test_get_open_positions_uses_fifo_matching(db_session):
    user = create_user(db_session)
    db_session.add_all(
        [
            Trade(
                user_id=user.id,
                stock_symbol="TCS",
                trade_type="BUY",
                quantity=10,
                price=3500,
                trade_date=date(2026, 5, 1),
            ),
            Trade(
                user_id=user.id,
                stock_symbol="TCS",
                trade_type="BUY",
                quantity=5,
                price=3600,
                trade_date=date(2026, 5, 2),
            ),
            Trade(
                user_id=user.id,
                stock_symbol="TCS",
                trade_type="SELL",
                quantity=12,
                price=3650,
                trade_date=date(2026, 5, 3),
            ),
            Trade(
                user_id=user.id,
                stock_symbol="INFY",
                trade_type="SELL",
                quantity=3,
                price=1450,
                trade_date=date(2026, 5, 4),
            ),
        ]
    )
    db_session.commit()

    open_positions = _get_open_positions(user.id, db_session)

    assert len(open_positions) == 1
    assert open_positions[0]["symbol"] == "TCS"
    assert open_positions[0]["quantity"] == 3
    assert open_positions[0]["avg_entry_price"] == 3600.0
    assert open_positions[0]["entry_date"] == "2026-05-02"
    assert open_positions[0]["holding_days"] >= 0


def test_compliant_response_rewrites_advisory_phrasing_once():
    raw = (
        "You should review Wednesday risk. "
        "This is data analysis, not investment advice. "
        "This is data analysis, not investment advice."
    )

    cleaned = _ensure_compliant_response(raw)

    assert "You should" not in cleaned
    assert cleaned.count(DISCLAIMER) == 1
    assert cleaned.endswith(DISCLAIMER)
