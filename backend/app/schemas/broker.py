from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class SupportedBrokerResponse(BaseModel):
    code: str
    label: str
    status: str
    connection_fields: list[str] = Field(default_factory=list)


class DhanConnectRequest(BaseModel):
    client_id: str = Field(..., min_length=1)
    access_token: str = Field(..., min_length=1)
    account_label: str | None = None


class BrokerConnectionSummary(BaseModel):
    id: int
    broker_name: str
    broker_user_id: str | None = None
    client_id: str | None = None
    account_label: str | None = None
    auth_status: str
    sync_status: str
    last_synced_at: datetime | None = None
    last_error_code: str | None = None
    last_error_message: str | None = None
    metadata_json: dict[str, Any] | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BrokerConnectionStatusResponse(BrokerConnectionSummary):
    pass


class BrokerOrderResponse(BaseModel):
    id: int
    broker_connection_id: int | None = None
    broker_name: str
    broker_order_id: str
    broker_parent_order_id: str | None = None
    exchange: str | None = None
    segment: str | None = None
    product_type: str | None = None
    order_type: str | None = None
    side: str | None = None
    symbol: str
    instrument_token: str | None = None
    instrument_type: str | None = None
    quantity: int | None = None
    filled_quantity: int | None = None
    remaining_quantity: int | None = None
    price: Decimal | None = None
    average_price: Decimal | None = None
    trigger_price: Decimal | None = None
    status: str | None = None
    ordered_at: datetime | None = None
    executed_at: datetime | None = None
    capture_source: str
    raw_payload: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_serializer(
        "price",
        "average_price",
        "trigger_price",
        when_used="json",
    )
    def serialize_decimal_fields(self, value: Decimal | None) -> float | None:
        return float(value) if value is not None else None


class BrokerOrdersListResponse(BaseModel):
    items: list[BrokerOrderResponse]
    total: int


class BrokerSyncResponse(BaseModel):
    connection: BrokerConnectionSummary
    orders_upserted: int
    trades_inserted: int
    completed_trades_rebuilt: bool
    completed_trades_count: int
    warnings: list[str] = Field(default_factory=list)
