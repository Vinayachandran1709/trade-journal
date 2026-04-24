from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.market_data import MarketDashboardResponse, StockQuoteResponse
from app.services.market_data_service import get_market_dashboard, get_ticker_quote

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/dashboard", response_model=MarketDashboardResponse)
def dashboard(db: Session = Depends(get_db)):
    """Full market dashboard — indices, VIX, global cues, top movers. Public endpoint."""
    return get_market_dashboard(db)


@router.get("/quote/{symbol}", response_model=StockQuoteResponse)
def quote(symbol: str, db: Session = Depends(get_db)):
    """Single stock/index quote. Pass bare NSE symbol (e.g. TCS) or suffixed (TCS.NS). Public endpoint."""
    return get_ticker_quote(symbol, db)
