import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.coupon import Coupon
from app.models.payment_event import PaymentEvent
from app.models.user import User
from app.schemas.billing import (
    ApplyCouponRequest,
    ApplyCouponResponse,
    BillingStatusResponse,
    CreateOrderRequest,
    CreateOrderResponse,
    VerifyPaymentRequest,
    VerifyPaymentResponse,
)
from app.services import razorpay_service
from app.utils.datetime import utcnow_naive
from app.utils.dependencies import get_current_user

billing_router = APIRouter(prefix="/api/billing", tags=["billing"])
webhook_router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

_PLAN_DURATIONS = {
    "pro_monthly": timedelta(days=30),
    "pro_annual": timedelta(days=365),
}
def _activate_subscription(user: User, plan: str, db: Session) -> datetime:
    duration = _PLAN_DURATIONS.get(plan, timedelta(days=30))
    expires_at = utcnow_naive() + duration
    user.subscription_status = "pro"
    user.subscription_plan = plan
    user.subscription_expires_at = expires_at
    db.commit()
    return expires_at


def _record_event(
    db: Session,
    provider_event_id: str,
    event_type: str,
    payload: dict,
    user_id: int | None = None,
) -> None:
    event = PaymentEvent(
        user_id=user_id,
        provider="razorpay",
        event_type=event_type,
        provider_event_id=provider_event_id,
        payload=payload,
        processed_at=utcnow_naive(),
    )
    db.add(event)
    db.commit()


# ---------------------------------------------------------------------------
# Billing endpoints
# ---------------------------------------------------------------------------


@billing_router.post("/create-order", response_model=CreateOrderResponse)
def create_order(
    request: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        order = razorpay_service.create_razorpay_order(request.plan, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create Razorpay order. Check API credentials.",
        )

    return CreateOrderResponse(
        order_id=order["id"],
        amount=order["amount"],
        currency=order["currency"],
        plan=request.plan,
    )


@billing_router.post("/verify-payment", response_model=VerifyPaymentResponse)
def verify_payment(
    request: VerifyPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not razorpay_service.verify_payment_signature(
        request.order_id, request.payment_id, request.signature
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment signature verification failed",
        )

    try:
        order = razorpay_service.fetch_order(request.order_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to verify Razorpay order. Please try again.",
        )

    order_notes = order.get("notes", {})
    plan = order_notes.get("plan", "pro_monthly")
    order_user_id = order_notes.get("user_id")
    if order_user_id is None or str(order_user_id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This payment does not belong to the current user",
        )

    existing_event = (
        db.query(PaymentEvent)
        .filter(PaymentEvent.provider_event_id == request.payment_id)
        .first()
    )
    if existing_event:
        return VerifyPaymentResponse(
            status="success",
            subscription_status=current_user.subscription_status or "pro",
            plan=current_user.subscription_plan or plan,
            expires_at=(
                current_user.subscription_expires_at.isoformat()
                if current_user.subscription_expires_at
                else _utcnow_naive().isoformat()
            ),
        )

    expires_at = _activate_subscription(current_user, plan, db)
    _record_event(
        db,
        provider_event_id=request.payment_id,
        event_type="payment.verified",
        payload={
            "order_id": request.order_id,
            "payment_id": request.payment_id,
            "plan": plan,
        },
        user_id=current_user.id,
    )

    return VerifyPaymentResponse(
        status="success",
        subscription_status="pro",
        plan=plan,
        expires_at=expires_at.isoformat(),
    )


@billing_router.get("/status", response_model=BillingStatusResponse)
def billing_status(current_user: User = Depends(get_current_user)):
    return BillingStatusResponse(
        subscription_status=current_user.subscription_status,
        subscription_plan=current_user.subscription_plan,
        subscription_expires_at=current_user.subscription_expires_at,
        razorpay_subscription_id=current_user.razorpay_subscription_id,
    )


@billing_router.post("/cancel")
def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.subscription_status not in ("pro",):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active Pro subscription to cancel",
        )

    current_user.subscription_status = "pro_cancelled"
    db.commit()

    return {
        "status": "cancelled",
        "message": "Subscription cancelled. Pro access continues until expiry.",
        "expires_at": (
            current_user.subscription_expires_at.isoformat()
            if current_user.subscription_expires_at
            else None
        ),
    }


@billing_router.post("/apply-coupon", response_model=ApplyCouponResponse)
def apply_coupon(
    request: ApplyCouponRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    code = request.code.upper().strip()

    coupon = (
        db.query(Coupon).filter(Coupon.code == code, Coupon.is_active == True).first()
    )
    if not coupon:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or inactive coupon code",
        )

    if coupon.expires_at and coupon.expires_at < utcnow_naive():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Coupon has expired"
        )

    if (
        coupon.max_redemptions is not None
        and coupon.current_redemptions >= coupon.max_redemptions
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Coupon has reached its maximum number of redemptions",
        )

    if current_user.subscription_status == "pro":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have an active Pro subscription",
        )

    expires_at = utcnow_naive() + timedelta(days=90)
    current_user.subscription_status = "pro"
    current_user.subscription_plan = "pro_founding"
    current_user.subscription_expires_at = expires_at
    coupon.current_redemptions = (coupon.current_redemptions or 0) + 1
    db.commit()

    return ApplyCouponResponse(
        status="applied",
        message="3 months Pro access activated! Welcome, Founding Member.",
        expires_at=expires_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# Webhook endpoint (separate router, no auth)
# ---------------------------------------------------------------------------


@webhook_router.post("/razorpay")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    if not razorpay_service.verify_webhook_signature(body, signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    event_data: dict = json.loads(body)
    event_type: str = event_data.get("event", "unknown")
    now = utcnow_naive()

    # Build a stable idempotency key
    payment_entity = (
        event_data.get("payload", {}).get("payment", {}).get("entity", {})
    )
    subscription_entity = (
        event_data.get("payload", {}).get("subscription", {}).get("entity", {})
    )
    idempotency_key = (
        payment_entity.get("id")
        or subscription_entity.get("id")
        or f"{event_data.get('account_id', '')}_{event_type}_{now.timestamp()}"
    )

    existing = (
        db.query(PaymentEvent)
        .filter(PaymentEvent.provider_event_id == idempotency_key)
        .first()
    )
    if existing:
        return {"status": "already_processed"}

    user: User | None = None

    if event_type == "payment.captured":
        notes = payment_entity.get("notes", {})
        user_id_str = notes.get("user_id")
        plan = notes.get("plan", "pro_monthly")
        if user_id_str:
            user = db.query(User).filter(User.id == int(user_id_str)).first()
            if user:
                _activate_subscription(user, plan, db)

    elif event_type == "subscription.activated":
        sub_id = subscription_entity.get("id")
        customer_id = subscription_entity.get("customer_id")
        if sub_id:
            user = (
                db.query(User)
                .filter(User.razorpay_subscription_id == sub_id)
                .first()
            )
        if user is None and customer_id:
            user = (
                db.query(User)
                .filter(User.razorpay_customer_id == customer_id)
                .first()
            )
        if user:
            user.subscription_status = "pro"
            user.razorpay_subscription_id = subscription_entity.get("id")
            db.commit()

    elif event_type == "subscription.cancelled":
        sub_id = subscription_entity.get("id")
        if sub_id:
            user = (
                db.query(User)
                .filter(User.razorpay_subscription_id == sub_id)
                .first()
            )
            if user:
                user.subscription_status = "pro_cancelled"
                db.commit()

    elif event_type == "payment.failed":
        # Log only — no status change
        pass

    _record_event(
        db,
        provider_event_id=idempotency_key,
        event_type=event_type,
        payload=event_data,
        user_id=user.id if user else None,
    )

    return {"status": "processed"}
