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


class BreadthData(BaseModel):
    advancing: int
    declining: int
    pct_advancing: int


class RegimeData(BaseModel):
    nifty_trend: str
    nifty_vs_vwap: str
    breadth: BreadthData
    interpretation: str


class SectorPerformanceData(BaseModel):
    index: str
    value: Optional[float] = None
    change_pct: Optional[float] = None


class OpenPositionContext(BaseModel):
    symbol: str
    net_quantity: int
    last_trade_date: Optional[str] = None


class PersonalizedMarketData(BaseModel):
    preferred_sectors: list[SectorPerformanceData]
    recent_symbols: list[str]
    open_positions: list[OpenPositionContext]


class WatchlistResponse(BaseModel):
    recent_symbols: list[str]
    preferred_sectors: list[str]
    sector_performance: dict[str, SectorPerformanceData]
    recent_stock_quotes: list["StockQuoteResponse"]


class MarketDashboardResponse(BaseModel):
    indices: dict[str, Optional[IndexData]]
    vix: VixData
    fii_dii: Optional[FiiDiiData] = None
    top_gainers: list[StockMover]
    top_losers: list[StockMover]
    global_cues: dict[str, Optional[GlobalCue]]
    sector_performance: dict[str, SectorPerformanceData]
    regime: RegimeData
    personalized: Optional[PersonalizedMarketData] = None
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


WatchlistResponse.model_rebuild()
