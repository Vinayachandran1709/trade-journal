from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.completed_trade import CompletedTrade
from app.models.trade import Trade
from app.models.trade_checklist import TradeChecklist
from app.models.trade_setup import TradeSetup
from app.models.user import User

DEFAULT_CHECKLIST_ITEMS = [
    "Checked higher timeframe trend",
    "No major event in next 24 hours",
    "Position size within my risk limit",
    "Not trading after 3+ losses today",
    "R:R ratio is at least 1:2",
]

PROHIBITED_TERMS = [
    "buy",
    "sell",
    "recommended",
    "should",
    "good trade",
    "bad trade",
    "take this",
    "avoid this",
]


def compliance_check(value: Any) -> Any:
    if isinstance(value, str):
        cleaned = value
        replacements = {
            "buy": "entry",
            "sell": "exit",
            "recommended": "flagged",
            "should": "could",
            "good trade": "lower-risk profile",
            "bad trade": "higher-risk profile",
            "take this": "log this setup",
            "avoid this": "review this risk",
        }
        for term in PROHIBITED_TERMS:
            cleaned = re.sub(
                re.escape(term),
                replacements[term],
                cleaned,
                flags=re.IGNORECASE,
            )
        return cleaned
    if isinstance(value, list):
        return [compliance_check(item) for item in value]
    if isinstance(value, dict):
        return {key: compliance_check(item) for key, item in value.items()}
    return value


def is_pro_active(user: User) -> bool:
    if user.subscription_status not in ("pro", "pro_founding", "pro_cancelled"):
        return False
    if user.subscription_status == "pro_founding":
        return True
    expires = user.subscription_expires_at
    if expires is None:
        return False
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return expires > datetime.now(timezone.utc)


def get_or_create_default_template(user_id: int, db: Session) -> TradeChecklist:
    existing = (
        db.query(TradeChecklist)
        .filter(TradeChecklist.user_id == user_id, TradeChecklist.is_active.is_(True))
        .order_by(TradeChecklist.created_at.asc())
        .first()
    )
    if existing:
        return existing
    return create_checklist_template(
        user_id,
        "Default Pre-Trade Checklist",
        DEFAULT_CHECKLIST_ITEMS,
        db,
        enforce_free_limit=False,
    )


def create_checklist_template(
    user_id: int,
    name: str,
    items: list[str] | None,
    db: Session,
    enforce_free_limit: bool = True,
) -> TradeChecklist:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise ValueError("User not found")

    if enforce_free_limit and not is_pro_active(user):
        existing_count = (
            db.query(TradeChecklist)
            .filter(TradeChecklist.user_id == user_id, TradeChecklist.is_active.is_(True))
            .count()
        )
        if existing_count >= 1:
            raise PermissionError("Free tier supports 1 checklist template")

    template = TradeChecklist(
        user_id=user_id,
        name=compliance_check(name),
        checklist_items=compliance_check(items or DEFAULT_CHECKLIST_ITEMS),
        is_active=True,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def create_trade_setup(user_id: int, data: dict[str, Any], db: Session) -> TradeSetup:
    symbol = str(data["symbol"]).strip().upper()
    entry_price = Decimal(str(data["entry_price"]))
    stop_loss_price = Decimal(str(data["stop_loss_price"]))
    position_size = int(data["position_size"])
    risk_amount = data.get("risk_amount")
    if risk_amount is None:
        risk_amount = abs(entry_price - stop_loss_price) * position_size

    setup = TradeSetup(
        user_id=user_id,
        name=f"{symbol} risk setup",
        description=compliance_check(data.get("thesis")),
        setup_config={},
        is_active=True,
        symbol=symbol,
        thesis=compliance_check(data.get("thesis")),
        entry_price=entry_price,
        stop_loss_price=stop_loss_price,
        target_price=Decimal(str(data["target_price"])),
        target2_price=Decimal(str(data["target2_price"])) if data.get("target2_price") is not None else None,
        conviction_score=int(data["conviction_score"]),
        checklist_responses=compliance_check(data.get("checklist_responses") or {}),
        position_size=position_size,
        risk_amount=Decimal(str(risk_amount)),
    )
    db.add(setup)
    db.commit()
    db.refresh(setup)
    return setup


def _risk_level(score: int) -> str:
    if score <= 3:
        return "LOW"
    if score <= 6:
        return "MODERATE"
    return "HIGH"


def _factor(factor: str, detail: str, impact: str) -> dict[str, str]:
    return compliance_check({"factor": factor, "detail": detail, "impact": impact})


def _completed_trades(user_id: int, db: Session) -> list[CompletedTrade]:
    return (
        db.query(CompletedTrade)
        .filter(CompletedTrade.user_id == user_id)
        .order_by(CompletedTrade.exit_date.desc())
        .all()
    )


def score_trade_setup(user_id: int, setup: TradeSetup, db: Session) -> dict[str, Any]:
    completed = _completed_trades(user_id, db)
    if len(completed) < 30:
        raise ValueError("At least 30 completed trades are required for risk assessment")

    risk_score = 5
    factors: list[dict[str, str]] = []

    conviction = setup.conviction_score or 5
    similar_by_symbol = [t for t in completed if t.stock_symbol.upper() == (setup.symbol or "").upper()]
    similar_by_return = [
        t
        for t in completed
        if (t.return_pct >= 0 and conviction >= 6) or (t.return_pct < 0 and conviction <= 5)
    ]
    similar = similar_by_symbol or similar_by_return[:12]
    wins = [t for t in similar if Decimal(t.pnl) > 0]
    win_rate = len(wins) / len(similar) if similar else 0.0
    avg_pnl = float(sum((Decimal(t.pnl) for t in similar), Decimal("0")) / len(similar)) if similar else 0.0
    impact = "negative" if similar and win_rate < 0.4 else "positive" if similar and win_rate >= 0.55 else "neutral"
    risk_score += 1 if impact == "negative" else -1 if impact == "positive" else 0
    factors.append(
        _factor(
            "conviction_match",
            f"Historically, your conviction-{conviction} setup profile has a {round(win_rate * 100)}% win rate.",
            impact,
        )
    )

    now = datetime.now()
    current_hour = now.hour
    hourly = []
    for trade in db.query(Trade).filter(Trade.user_id == user_id, Trade.trade_time.isnot(None)).all():
        if trade.trade_time.hour == current_hour:
            match = next((t for t in completed if t.stock_symbol == trade.stock_symbol and t.entry_date == trade.trade_date), None)
            if match:
                hourly.append(match)
    if len(hourly) >= 3:
        hourly_wr = sum(1 for t in hourly if Decimal(t.pnl) > 0) / len(hourly)
        impact = "negative" if hourly_wr < 0.35 else "positive" if hourly_wr > 0.55 else "neutral"
        risk_score += 1 if impact == "negative" else -1 if impact == "positive" else 0
        factors.append(
            _factor(
                "time_of_day",
                f"Your data shows a {round(hourly_wr * 100)}% win rate around {current_hour}:00. Current time: {now.strftime('%H:%M')}.",
                impact,
            )
        )

    avg_qty = db.query(func.avg(Trade.quantity)).filter(Trade.user_id == user_id).scalar() or 0
    if avg_qty:
        multiple = float(setup.position_size or 0) / float(avg_qty)
        impact = "negative" if multiple > 2 else "positive" if multiple < 0.75 else "neutral"
        risk_score += 1 if impact == "negative" else -1 if impact == "positive" else 0
        factors.append(
            _factor(
                "position_size",
                f"Based on your trading patterns, this position is {multiple:.1f}x your average size.",
                impact,
            )
        )

    today = datetime.now().date()
    losses_today = [
        t
        for t in completed
        if t.exit_date == today and Decimal(t.pnl) < 0
    ]
    if losses_today:
        impact = "negative" if len(losses_today) >= 2 else "neutral"
        risk_score += 1 if impact == "negative" else 0
        factors.append(
            _factor(
                "streak_status",
                f"Your data shows {len(losses_today)} loss outcomes today.",
                impact,
            )
        )

    today_count = db.query(Trade).filter(Trade.user_id == user_id, Trade.trade_date == today).count()
    avg_daily = (
        db.query(Trade.trade_date, func.count(Trade.id))
        .filter(Trade.user_id == user_id)
        .group_by(Trade.trade_date)
        .all()
    )
    avg_count = sum(row[1] for row in avg_daily) / len(avg_daily) if avg_daily else 0
    if avg_count and today_count >= max(5, avg_count * 2):
        risk_score += 1
        factors.append(
            _factor(
                "overtrading",
                f"Your data shows {today_count} trades today versus your {avg_count:.1f} daily average.",
                "negative",
            )
        )

    holding_buckets = {
        "intraday": [t for t in completed if t.holding_days == 0],
        "1-2 days": [t for t in completed if 1 <= t.holding_days <= 2],
        "3-7 days": [t for t in completed if 3 <= t.holding_days <= 7],
        "8+ days": [t for t in completed if t.holding_days >= 8],
    }
    best_bucket = max(
        holding_buckets.items(),
        key=lambda item: sum((Decimal(t.pnl) for t in item[1]), Decimal("0")) / len(item[1]) if item[1] else Decimal("-999999"),
    )[0]
    factors.append(
        _factor(
            "holding_period",
            f"Historically, your strongest holding-period bucket is {best_bucket}. This setup is logged before execution.",
            "neutral",
        )
    )

    if setup.entry_price and setup.stop_loss_price and setup.target_price:
        risk = abs(Decimal(setup.entry_price) - Decimal(setup.stop_loss_price))
        reward = abs(Decimal(setup.target_price) - Decimal(setup.entry_price))
        rr_ratio = float(reward / risk) if risk else 0
        impact = "positive" if rr_ratio >= 2 else "negative" if rr_ratio < 1 else "neutral"
        risk_score += 1 if impact == "negative" else -1 if impact == "positive" else 0
        factors.append(
            _factor(
                "rr_ratio",
                f"Risk score: reward-to-risk is 1:{rr_ratio:.1f} based on your entered levels.",
                impact,
            )
        )

    risk_score = max(1, min(10, risk_score))
    setup.risk_score = risk_score
    setup.risk_level = _risk_level(risk_score)
    db.commit()
    db.refresh(setup)

    result = {
        "risk_score": risk_score,
        "risk_level": setup.risk_level,
        "factors": factors,
        "historical_similar_setups": {
            "count": len(similar),
            "win_rate": round(win_rate, 2),
            "avg_pnl": round(avg_pnl, 2),
        },
        "warning": "Your data shows elevated risk for this setup profile" if risk_score >= 7 else None,
    }
    return compliance_check(result)


def link_setup_to_trade(user_id: int, trade_id: int, db: Session) -> bool:
    completed = (
        db.query(CompletedTrade)
        .filter(CompletedTrade.id == trade_id, CompletedTrade.user_id == user_id)
        .first()
    )
    symbol = completed.stock_symbol if completed else None
    created_at = completed.created_at if completed else None
    if not symbol or not created_at:
        return False

    setup = (
        db.query(TradeSetup)
        .filter(
            TradeSetup.user_id == user_id,
            TradeSetup.symbol == symbol.upper(),
            TradeSetup.linked_trade_id.is_(None),
            TradeSetup.created_at >= created_at - timedelta(hours=4),
            TradeSetup.created_at <= created_at + timedelta(minutes=5),
        )
        .order_by(TradeSetup.created_at.desc())
        .first()
    )
    if not setup:
        return False
    setup.linked_trade_id = trade_id
    setup.linked_at = datetime.utcnow()
    db.commit()
    return True


def get_setup_report_card(setup_id: int, user_id: int, db: Session) -> dict[str, Any]:
    setup = (
        db.query(TradeSetup)
        .filter(TradeSetup.id == setup_id, TradeSetup.user_id == user_id)
        .first()
    )
    if setup is None or setup.linked_trade_id is None:
        raise ValueError("Linked completed trade required for report card")
    completed = (
        db.query(CompletedTrade)
        .filter(CompletedTrade.id == setup.linked_trade_id, CompletedTrade.user_id == user_id)
        .first()
    )
    if completed is None:
        raise ValueError("Linked completed trade not found")

    exit_price = Decimal(completed.exit_price)
    target = Decimal(setup.target_price) if setup.target_price is not None else None
    stop = Decimal(setup.stop_loss_price) if setup.stop_loss_price is not None else None
    followed_plan = bool(
        (target and abs(exit_price - target) / target <= Decimal("0.02"))
        or (stop and abs(exit_price - stop) / stop <= Decimal("0.02"))
    )
    if followed_plan:
        deviation = "Exit aligned with the logged target or risk level."
    elif stop and exit_price > stop:
        deviation = "Exited above the logged risk level before the planned outcome was reached."
    else:
        deviation = "Exit moved away from the logged plan."

    planned_like = [t for t in _completed_trades(user_id, db) if Decimal(t.pnl) > 0]
    other = [t for t in _completed_trades(user_id, db) if Decimal(t.pnl) <= 0]
    delta = 0
    if planned_like and other:
        planned_avg = sum((Decimal(t.pnl) for t in planned_like), Decimal("0")) / len(planned_like)
        other_avg = sum((Decimal(t.pnl) for t in other), Decimal("0")) / len(other)
        if other_avg:
            delta = int(abs((planned_avg - other_avg) / other_avg) * 100)

    return compliance_check(
        {
            "setup": {
                "thesis": setup.thesis,
                "entry_price": float(setup.entry_price or 0),
                "stop_loss": float(setup.stop_loss_price or 0),
                "target": float(setup.target_price or 0),
                "conviction": setup.conviction_score,
            },
            "outcome": {
                "actual_entry": float(completed.entry_price),
                "actual_exit": float(completed.exit_price),
                "pnl": float(completed.pnl),
                "holding_days": completed.holding_days,
            },
            "followed_plan": followed_plan,
            "plan_deviation": deviation,
            "lesson": f"Your data shows planned exits differ from unplanned exits by {delta}% in average P&L.",
        }
    )
