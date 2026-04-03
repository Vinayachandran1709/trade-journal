from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class TradeCreate(BaseModel):
    stock_symbol: str
    trade_type: str
    quantity: int
    price: Decimal
    trade_date: date
    broker: str | None = None
    import_source: str | None = None


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
    created_at: datetime

    model_config = {"from_attributes": True}


class TradeImportRequest(BaseModel):
    email_content: str = Field(..., min_length=1)


class TradeImportResponse(BaseModel):
    imported: int
    trades: list[TradeResponse]


class TradesSummary(BaseModel):
    total_trades: int
    total_invested: Decimal
    unique_symbols: int


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
    return_pct: Decimal
    holding_days: int
    created_at: datetime

    model_config = {"from_attributes": True}
