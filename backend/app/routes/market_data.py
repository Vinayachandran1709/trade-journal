from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.market_data import (
    MarketDashboardResponse,
    StockQuoteResponse,
    WatchlistResponse,
)
from app.services.market_data_service import (
    get_market_dashboard,
    get_ticker_quote,
    get_watchlist_data,
)
from app.services.earnings_service import get_upcoming_earnings
from app.utils.dependencies import get_current_user, get_optional_current_user

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/dashboard", response_model=MarketDashboardResponse)
def dashboard(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    """Full market dashboard with optional personalization for authenticated users."""
    return get_market_dashboard(db, current_user)


@router.get("/watchlist", response_model=WatchlistResponse)
def watchlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_watchlist_data(current_user, db)


@router.get("/quote/{symbol}", response_model=StockQuoteResponse)
def quote(symbol: str, db: Session = Depends(get_db)):
    """Single stock/index quote. Pass bare NSE symbol (e.g. TCS) or suffixed (TCS.NS). Public endpoint."""
    return get_ticker_quote(symbol, db)


@router.get("/earnings")
async def upcoming_earnings(
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    user_id = current_user.id if current_user else None
    return await get_upcoming_earnings(db, user_id)
