from datetime import datetime

from pydantic import BaseModel


class CreateOrderRequest(BaseModel):
    plan: str


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    plan: str


class VerifyPaymentRequest(BaseModel):
    order_id: str
    payment_id: str
    signature: str


class VerifyPaymentResponse(BaseModel):
    status: str
    subscription_status: str
    plan: str
    expires_at: str


class BillingStatusResponse(BaseModel):
    subscription_status: str | None = None
    subscription_plan: str | None = None
    subscription_expires_at: datetime | None = None
    razorpay_subscription_id: str | None = None


class ApplyCouponRequest(BaseModel):
    code: str


class ApplyCouponResponse(BaseModel):
    status: str
    message: str
    expires_at: str
