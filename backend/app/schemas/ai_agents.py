from pydantic import BaseModel


class WhyMovingRequest(BaseModel):
    symbol: str


class WhyMovingSource(BaseModel):
    title: str
    url: str
    publisher: str
    published_at: str | None = None
    source_type: str = "trusted_news"
    recency_bucket: str | None = None
    trust_score: int = 0
    relevance_score: int = 0
    final_score: float = 0.0


class WhyMovingResponse(BaseModel):
    symbol: str
    explanation: str
    price: float | None = None
    change_pct: float | None = None
    company_name: str | None = None
    source_count: int = 0
    confidence: str = "low"
    source_quality: str = "fallback_web"
    sources: list[WhyMovingSource]
    model_used: str
    queries_remaining: int
    queries_limit: int
    cached: bool
    disclaimer: str


class TickerIntelligenceResponse(BaseModel):
    symbol: str
    company_name: str | None = None
    exchange: str | None = None
    price: float | None = None
    change: float | None = None
    change_pct: float | None = None
    high_52w: float | None = None
    low_52w: float | None = None
    volume: int | None = None
    avg_volume: int | None = None
    volume_vs_avg: str
    sector: str | None = None
    market_cap: str | None = None
    next_event: str | None = None
    sentiment_line: str
    disclaimer: str


class QuotaExceededResponse(BaseModel):
    error: str
    message: str
    queries_used: int
    queries_limit: int
    upgrade_url: str
