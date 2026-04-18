from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
    id: int
    email: str
    name: str | None = None
    subscription_status: str | None = None
    subscription_plan: str | None = None
    subscription_expires_at: datetime | None = None
    razorpay_customer_id: str | None = None
    razorpay_subscription_id: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
