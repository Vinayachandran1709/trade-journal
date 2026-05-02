from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class PatternResponse(BaseModel):
    pattern_type: str
    title: str
    description: str
    severity: str
    data: dict[str, object] = Field(default_factory=dict)
    locked: bool = False


class PatternsEnvelope(BaseModel):
    patterns: list[PatternResponse] = Field(default_factory=list)
    total_completed_trades: int
    threshold: int
    unlocked: bool


class AnalyzePatternsResponse(BaseModel):
    patterns: list[PatternResponse] = Field(default_factory=list)
    total_completed_trades: int
    threshold: int
    unlocked: bool


class TradeExtremes(BaseModel):
    symbol: str | None = None
    pnl: float | None = None
    exit_date: date | None = None


class MonthlyPnlPoint(BaseModel):
    month: str
    pnl: float


class AnalyticsSummaryResponse(BaseModel):
    total_trades: int
    win_rate: float
    total_pnl: float
    avg_pnl_per_trade: float
    best_trade: TradeExtremes
    worst_trade: TradeExtremes
    avg_holding_days: float
    most_traded_symbol: str | None = None
    monthly_pnl: list[MonthlyPnlPoint] = Field(default_factory=list)

