from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.completed_trade import CompletedTrade
from app.models.trade import Trade
from app.models.trade_setup import TradeSetup
from app.models.user import User
from app.services.checklist_service import compliance_check, is_pro_active
from app.utils.datetime import utcnow_naive


def _alert(alert_type: str, severity: str, title: str, message: str) -> dict:
    return compliance_check(
        {
            "alert_type": alert_type,
            "severity": severity,
            "title": title,
            "message": message,
            "timestamp": utcnow_naive().isoformat(),
            "locked": False,
        }
    )


def _sector_for_symbol(symbol: str) -> str:
    upper = symbol.upper()
    if any(token in upper for token in ("BANK", "HDFC", "ICICI", "SBIN", "AXIS", "KOTAK", "INDUS")):
        return "Banking"
    if any(token in upper for token in ("INFY", "TCS", "WIPRO", "TECHM", "HCL")):
        return "IT"
    if any(token in upper for token in ("RELIANCE", "ONGC", "OIL")):
        return "Energy"
    return "Other"


def generate_risk_alerts(user_id: int, db: Session) -> list[dict]:
    try:
        user = db.query(User).filter(User.id == user_id).first()
        today = datetime.now().date()
        alerts: list[dict] = []

        today_trades = db.query(Trade).filter(Trade.user_id == user_id, Trade.trade_date == today).all()
        daily_counts = (
            db.query(Trade.trade_date, func.count(Trade.id))
            .filter(Trade.user_id == user_id)
            .group_by(Trade.trade_date)
            .all()
        )
        avg_daily = sum(row[1] for row in daily_counts) / len(daily_counts) if daily_counts else 0
        if avg_daily and len(today_trades) >= max(5, avg_daily * 2):
            losing_days = (
                db.query(CompletedTrade.exit_date, func.count(CompletedTrade.id))
                .filter(CompletedTrade.user_id == user_id, CompletedTrade.pnl < 0)
                .group_by(CompletedTrade.exit_date)
                .all()
            )
            loss_heavy_days = {row[0] for row in losing_days if row[1] >= 3}
            total_days = max(1, len(daily_counts))
            historical_rate = len(loss_heavy_days) / total_days
            alerts.append(
                _alert(
                    "overtrading",
                    "high",
                    "Trading frequency elevated",
                    f"You have {len(today_trades)} trades today. Your average is {avg_daily:.1f}. Your data shows high-loss days occur {round(historical_rate * 100)}% of the time when frequency expands.",
                )
            )

        completed_today = (
            db.query(CompletedTrade)
            .filter(CompletedTrade.user_id == user_id, CompletedTrade.exit_date == today)
            .order_by(CompletedTrade.created_at.desc())
            .all()
        )
        consecutive_losses = 0
        for trade in completed_today:
            if Decimal(trade.pnl) < 0:
                consecutive_losses += 1
            else:
                break
        if consecutive_losses >= 3:
            alerts.append(
                _alert(
                    "losing_streak",
                    "high",
                    "Loss sequence elevated",
                    f"Your data shows {consecutive_losses} consecutive loss outcomes today.",
                )
            )

        latest_loss = next((trade for trade in completed_today if Decimal(trade.pnl) < 0), None)
        latest_trade = max(today_trades, key=lambda trade: trade.created_at, default=None)
        if latest_loss and latest_trade and latest_trade.created_at - latest_loss.created_at <= timedelta(minutes=15):
            alerts.append(
                _alert(
                    "revenge_risk",
                    "medium",
                    "Short interval after loss",
                    "Your data shows a new entry logged within 15 minutes of a loss outcome.",
                )
            )

        exposure_by_sector: dict[str, Decimal] = {}
        total_exposure = Decimal("0")
        for trade in today_trades:
            exposure = Decimal(trade.price) * trade.quantity
            sector = _sector_for_symbol(trade.stock_symbol)
            exposure_by_sector[sector] = exposure_by_sector.get(sector, Decimal("0")) + exposure
            total_exposure += exposure
        if total_exposure:
            sector, exposure = max(exposure_by_sector.items(), key=lambda item: item[1])
            concentration = exposure / total_exposure
            if concentration > Decimal("0.60"):
                alerts.append(
                    _alert(
                        "sector_concentration",
                        "medium",
                        "Sector exposure concentrated",
                        f"Based on today's logged exposure, {round(float(concentration) * 100)}% is in {sector}.",
                    )
                )

        current_hour = datetime.now().hour
        hourly_completed = []
        historical_trades = db.query(Trade).filter(Trade.user_id == user_id, Trade.trade_time.isnot(None)).all()
        for trade in historical_trades:
            if trade.trade_time.hour == current_hour:
                match = next(
                    (
                        item
                        for item in db.query(CompletedTrade)
                        .filter(CompletedTrade.user_id == user_id, CompletedTrade.stock_symbol == trade.stock_symbol)
                        .all()
                        if item.entry_date == trade.trade_date
                    ),
                    None,
                )
                if match:
                    hourly_completed.append(match)
        if len(hourly_completed) >= 3:
            win_rate = sum(1 for trade in hourly_completed if Decimal(trade.pnl) > 0) / len(hourly_completed)
            if win_rate < 0.35:
                alerts.append(
                    _alert(
                        "time_warning",
                        "medium",
                        "Current hour has weaker history",
                        f"Your data shows a {round(win_rate * 100)}% win rate near {current_hour}:00.",
                    )
                )

        latest_setup = (
            db.query(TradeSetup)
            .filter(TradeSetup.user_id == user_id, TradeSetup.linked_trade_id.is_(None))
            .order_by(TradeSetup.created_at.desc())
            .first()
        )
        avg_qty = db.query(func.avg(Trade.quantity)).filter(Trade.user_id == user_id).scalar() or 0
        if latest_setup and avg_qty and latest_setup.position_size and latest_setup.position_size > avg_qty * 2:
            alerts.append(
                _alert(
                    "position_size_warning",
                    "high",
                    "Position size elevated",
                    f"Based on your trading patterns, the latest setup size is {float(latest_setup.position_size) / float(avg_qty):.1f}x your average.",
                )
            )

        if user and not is_pro_active(user) and len(alerts) > 1:
            visible = alerts[:1]
            visible.append(
                _alert(
                    "locked",
                    "info",
                    "More risk alerts available on Pro",
                    "Upgrade to Pro for the full risk alert stream.",
                )
            )
            visible[-1]["locked"] = True
            return visible

        return alerts
    except Exception:
        db.rollback()
        return []
