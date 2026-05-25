from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_serializer
from typing import Literal


class TradeCreate(BaseModel):
    stock_symbol: str
    trade_type: str
    quantity: int
    price: Decimal
    trade_date: date
    broker: str | None = None
    import_source: str | None = None
    emotion_tag: str | None = None
    notes: str | None = None
    screenshot_url: str | None = None
    entry_method: str | None = None
    trade_time: time | None = None
    instrument_type: str | None = None


class TradeResponse(BaseModel):
    id: int
    user_id: int
    stock_symbol: str
    trade_type: str
    quantity: int
    price: Decimal
    trade_date: date
    broker: str | None
    import_source: str | None
    emotion_tag: str | None
    notes: str | None
    screenshot_url: str | None
    entry_method: str | None
    trade_time: time | None
    instrument_type: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TradeImportRequest(BaseModel):
    email_content: str = Field(..., min_length=1)


class AutoCapturedTradeInput(BaseModel):
    stock_symbol: str
    trade_type: Literal["BUY", "SELL"]
    quantity: int = Field(..., gt=0)
    price: Decimal = Field(..., gt=0)
    trade_date: date
    trade_time: time | None = None
    instrument_type: str | None = None
    entry_method: str | None = None
    emotion_tag: str | None = None
    notes: str | None = None
    screenshot_url: str | None = None


class AutoCaptureRequest(BaseModel):
    broker: Literal["zerodha", "groww"]
    capture_method: Literal["dom"]
    trades: list[AutoCapturedTradeInput] = Field(default_factory=list)


class TradeAnnotationUpdateRequest(BaseModel):
    emotion_tag: str | None = None
    note: str | None = None


class TradeImportResponse(BaseModel):
    imported: int
    trades: list[TradeResponse] = Field(default_factory=list)
    imported_count: int = 0
    duplicate_count: int = 0
    imported_trade_ids: list[int] = Field(default_factory=list)
    detected_broker: str | None = None
    mode: Literal["imported", "manual_mapping_required"] = "imported"
    preview_headers: list[str] = Field(default_factory=list)
    preview_rows: list[dict[str, str]] = Field(default_factory=list)
    message: str | None = None


class TradesSummary(BaseModel):
    total_trades: int
    total_invested: Decimal
    unique_symbols: int
    net_pnl_today: Decimal = Decimal("0")
    max_loss_threshold: Decimal = Decimal("0")
    hidden_trade_count: int = 0

    @field_serializer("total_invested", "net_pnl_today", "max_loss_threshold", when_used="json")
    def serialize_decimal_fields(self, value: Decimal) -> float:
        return float(value)


class CompletedTradeResponse(BaseModel):
    id: int
    user_id: int
    stock_symbol: str
    entry_date: date
    exit_date: date
    entry_price: Decimal
    exit_price: Decimal
    quantity: int
    pnl: Decimal
    total_charges: Decimal
    net_pnl: Decimal
    return_pct: Decimal
    holding_days: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_serializer(
        "entry_price",
        "exit_price",
        "pnl",
        "total_charges",
        "net_pnl",
        "return_pct",
        when_used="json",
    )
    def serialize_decimal_fields(self, value: Decimal) -> float:
        return float(value)


class PaginatedTradesResponse(BaseModel):
    trades: list[TradeResponse]
    total: int
    hidden_trade_count: int
    is_limited: bool


class PaginatedCompletedTradesResponse(BaseModel):
    trades: list[CompletedTradeResponse]
    total: int
    hidden_trade_count: int
    is_limited: bool
