from typing import Optional
from pydantic import BaseModel


class IndexData(BaseModel):
    value: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None


class VixData(BaseModel):
    value: Optional[float] = None
    change: Optional[float] = None
    context: str = "Unknown"


class FiiDiiData(BaseModel):
    fii_net: Optional[float] = None
    dii_net: Optional[float] = None
    date: Optional[str] = None
    source: str = "unavailable"


class StockMover(BaseModel):
    symbol: str
    price: float
    change_pct: float


class GlobalCue(BaseModel):
    value: Optional[float] = None
    change_pct: Optional[float] = None


class MarketDashboardResponse(BaseModel):
    indices: dict[str, Optional[IndexData]]
    vix: VixData
    fii_dii: FiiDiiData
    top_gainers: list[StockMover]
    top_losers: list[StockMover]
    global_cues: dict[str, Optional[GlobalCue]]
    market_status: str
    last_updated: str
    is_stale: bool


class StockQuoteResponse(BaseModel):
    symbol: str
    price: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None
    high_52w: Optional[float] = None
    low_52w: Optional[float] = None
    volume: Optional[int] = None
    market_status: str
    last_updated: str
    is_stale: bool
