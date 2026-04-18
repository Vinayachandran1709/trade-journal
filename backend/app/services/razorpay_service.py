import hashlib
import hmac
from datetime import datetime

import razorpay

from app.config import settings

PLAN_AMOUNTS = {
    "pro_monthly": 59900,
    "pro_annual": 499900,
}

PLAN_LABELS = {
    "pro_monthly": "Pro Monthly — ₹599/month",
    "pro_annual": "Pro Annual — ₹4,999/year",
}


def _client() -> razorpay.Client:
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


def create_razorpay_order(plan: str, user_id: int) -> dict:
    if plan not in PLAN_AMOUNTS:
        raise ValueError(f"Unknown plan '{plan}'. Valid: {list(PLAN_AMOUNTS)}")

    receipt = f"rcpt_{user_id}_{plan}_{int(datetime.utcnow().timestamp())}"
    order = _client().order.create({
        "amount": PLAN_AMOUNTS[plan],
        "currency": "INR",
        "receipt": receipt,
        "notes": {
            "user_id": str(user_id),
            "plan": plan,
        },
    })
    return order


def fetch_order(order_id: str) -> dict:
    return _client().order.fetch(order_id)


def verify_payment_signature(order_id: str, payment_id: str, signature: str) -> bool:
    try:
        _client().utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })
        return True
    except Exception:
        return False


def verify_webhook_signature(body: bytes, signature_header: str) -> bool:
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        return False
    expected = hmac.new(
        settings.RAZORPAY_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)
