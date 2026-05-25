from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_serializer


class UserPreferences(BaseModel):
    brokers: list[str] = Field(default_factory=list)
    sectors: list[str] = Field(default_factory=list)
    style: str | None = None
    daily_loss_limit: Decimal | None = None

    @field_serializer("daily_loss_limit", when_used="json")
    def serialize_daily_loss_limit(self, value: Decimal | None):
        return float(value) if value is not None else None


class UserResponse(BaseModel):
    id: int
    email: str
    name: str | None = None
    subscription_status: str | None = None
    subscription_plan: str | None = None
    subscription_expires_at: datetime | None = None
    razorpay_customer_id: str | None = None
    razorpay_subscription_id: str | None = None
    preferences: UserPreferences | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
