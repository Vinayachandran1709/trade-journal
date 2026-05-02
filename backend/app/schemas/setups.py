from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field


class ChecklistTemplateCreate(BaseModel):
    name: str = Field(default="Default Pre-Trade Checklist", min_length=1, max_length=100)
    items: list[str] | None = None


class ChecklistTemplateResponse(BaseModel):
    id: int
    user_id: int
    name: str
    checklist_items: list[str] | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TradeSetupCreate(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=50)
    thesis: str | None = None
    entry_price: Decimal = Field(..., gt=0)
    stop_loss_price: Decimal = Field(..., gt=0)
    target_price: Decimal = Field(..., gt=0)
    target2_price: Decimal | None = Field(default=None, gt=0)
    conviction_score: int = Field(..., ge=1, le=10)
    checklist_responses: dict[str, Any] = Field(default_factory=dict)
    position_size: int = Field(..., gt=0)
    risk_amount: Decimal | None = Field(default=None, ge=0)


class TradeSetupResponse(BaseModel):
    id: int
    user_id: int
    symbol: str | None
    thesis: str | None
    entry_price: Decimal | None
    stop_loss_price: Decimal | None
    target_price: Decimal | None
    target2_price: Decimal | None
    conviction_score: int | None
    checklist_responses: dict[str, Any] | None
    position_size: int | None
    risk_amount: Decimal | None
    risk_score: int | None
    risk_level: str | None
    linked_trade_id: int | None
    linked_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RiskFactor(BaseModel):
    factor: str
    detail: str
    impact: Literal["positive", "neutral", "negative"]


class SimilarSetups(BaseModel):
    count: int
    win_rate: float
    avg_pnl: float


class TradeSetupScoreResponse(BaseModel):
    risk_score: int
    risk_level: Literal["LOW", "MODERATE", "HIGH"]
    factors: list[RiskFactor]
    historical_similar_setups: SimilarSetups
    warning: str | None = None


class SetupReportCardResponse(BaseModel):
    setup: dict[str, Any]
    outcome: dict[str, Any]
    followed_plan: bool
    plan_deviation: str
    lesson: str


class RiskAlertResponse(BaseModel):
    alert_type: str
    severity: Literal["high", "medium", "info"]
    title: str
    message: str
    timestamp: datetime
    locked: bool = False
