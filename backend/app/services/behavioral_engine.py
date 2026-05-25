from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal
from statistics import mean

from sqlalchemy.orm import Session

from app.models.completed_trade import CompletedTrade
from app.models.trade import Trade
from app.services.trade_processor import INDEX_EXPIRY_WEEKDAY, parse_trade_instrument

MIN_PATTERN_TRADE_COUNT = 20
EXPIRY_TILT_MIN_SAMPLE = 10
EXPIRY_TILT_MIN_WIN_RATE_DELTA = 0.08
EXPIRY_TILT_MIN_LOSS_DELTA = Decimal("1000.00")

SECTOR_MAP = {
    "TCS": "IT",
    "INFY": "IT",
    "WIPRO": "IT",
    "HCLTECH": "IT",
    "TECHM": "IT",
    "LTIM": "IT",
    "HDFCBANK": "Banking",
    "ICICIBANK": "Banking",
    "SBIN": "Banking",
    "KOTAKBANK": "Banking",
    "AXISBANK": "Banking",
    "INDUSINDBK": "Banking",
    "BANDHANBNK": "Banking",
    "FEDERALBNK": "Banking",
    "BAJFINANCE": "NBFC",
    "BAJAJFINSV": "NBFC",
    "CHOLAFIN": "NBFC",
    "MUTHOOTFIN": "NBFC",
    "RELIANCE": "Energy",
    "ONGC": "Energy",
    "BPCL": "Energy",
    "IOC": "Energy",
    "GAIL": "Energy",
    "SUNPHARMA": "Pharma",
    "DRREDDY": "Pharma",
    "CIPLA": "Pharma",
    "DIVISLAB": "Pharma",
    "LUPIN": "Pharma",
    "TATAMOTORS": "Auto",
    "MARUTI": "Auto",
    "BAJAJ-AUTO": "Auto",
    "HEROMOTOCO": "Auto",
    "EICHERMOT": "Auto",
    "TATASTEEL": "Metals",
    "JSWSTEEL": "Metals",
    "HINDALCO": "Metals",
    "VEDL": "Metals",
    "SAIL": "Metals",
    "HINDUNILVR": "FMCG",
    "ITC": "FMCG",
    "BRITANNIA": "FMCG",
    "DABUR": "FMCG",
    "MARICO": "FMCG",
    "ASIANPAINT": "Consumer",
    "TITAN": "Consumer",
    "PIDILITIND": "Consumer",
    "TRENT": "Consumer",
}

WEEKDAY_LABELS = {
    0: "Monday",
    1: "Tuesday",
    2: "Wednesday",
    3: "Thursday",
    4: "Friday",
}


def _format_hour_bucket(hour: int) -> str:
    def _label(value: int) -> str:
        if value == 12:
            return "12 PM"
        if value == 0:
            return "12 AM"
        suffix = "AM" if value < 12 else "PM"
        display_hour = value if value <= 12 else value - 12
        return f"{display_hour} {suffix}"

    return f"{_label(hour)}-{_label(hour + 1)}"


def _safe_float(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    return float(value)


def _severity_from_gap(gap: float) -> str:
    if gap >= 0.30:
        return "high"
    if gap >= 0.20:
        return "medium"
    return "low"


def _load_completed_trades(user_id: int, db: Session) -> list[CompletedTrade]:
    return (
        db.query(CompletedTrade)
        .filter(CompletedTrade.user_id == user_id)
        .order_by(CompletedTrade.exit_date.asc(), CompletedTrade.id.asc())
        .all()
    )


def _load_entry_hour_map(user_id: int, db: Session) -> dict[tuple[str, date], list[int]]:
    trades = (
        db.query(Trade)
        .filter(
            Trade.user_id == user_id,
            Trade.trade_type == "BUY",
        )
        .order_by(Trade.trade_date.asc(), Trade.id.asc())
        .all()
    )
    buckets: dict[tuple[str, date], list[int]] = defaultdict(list)
    for trade in trades:
        if trade.trade_time is None:
            continue
        buckets[(trade.stock_symbol.upper(), trade.trade_date)].append(trade.trade_time.hour)
    return buckets


def _overall_win_rate(trades: list[CompletedTrade]) -> float:
    if not trades:
        return 0.0
    wins = sum(1 for trade in trades if _safe_float(trade.pnl) > 0)
    return wins / len(trades)


def _safe_trade_net_pnl(trade: CompletedTrade) -> float:
    return _safe_float(getattr(trade, "net_pnl", None))


def _safe_decimal(value: Decimal | float | int | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _format_currency(value: float) -> str:
    sign = "-" if value < 0 else ""
    return f"{sign}₹{abs(value):,.0f}"


def _bucket_holding_period(days: int) -> str:
    if days <= 1:
        return "intraday"
    if days <= 3:
        return "short"
    if days <= 7:
        return "medium"
    if days <= 30:
        return "swing"
    return "positional"


def detect_time_of_day(user_id: int, db: Session) -> dict | None:
    try:
        completed_trades = _load_completed_trades(user_id, db)
        if len(completed_trades) < MIN_PATTERN_TRADE_COUNT:
            return None

        entry_hour_map = _load_entry_hour_map(user_id, db)
        bucket_stats: dict[str, list[int]] = defaultdict(list)
        bucket_offsets: dict[tuple[str, date], int] = defaultdict(int)
        sample_size = 0

        for trade in completed_trades:
            key = (trade.stock_symbol.upper(), trade.entry_date)
            hours = entry_hour_map.get(key)
            if not hours:
                continue
            hour_index = min(bucket_offsets[key], len(hours) - 1)
            hour = hours[hour_index]
            bucket_offsets[key] += 1
            label = _format_hour_bucket(hour)
            bucket_stats[label].append(1 if _safe_float(trade.pnl) > 0 else 0)
            sample_size += 1

        if sample_size < 5:
            return None

        overall_win_rate = _overall_win_rate(completed_trades)
        win_rates = {
            bucket: sum(outcomes) / len(outcomes)
            for bucket, outcomes in bucket_stats.items()
            if outcomes
        }
        if not win_rates:
            return None

        best_bucket, best_win_rate = max(win_rates.items(), key=lambda item: item[1])
        worst_bucket, worst_win_rate = min(win_rates.items(), key=lambda item: item[1])
        best_gap = best_win_rate - overall_win_rate
        worst_gap = overall_win_rate - worst_win_rate

        if best_gap <= 0.15 and worst_gap <= 0.15:
            return None

        focus_bucket = worst_bucket if worst_gap >= best_gap else best_bucket
        focus_gap = max(best_gap, worst_gap)
        focus_side = "worst" if worst_gap >= best_gap else "best"
        focus_word = "costing" if focus_side == "worst" else "earning"

        return {
            "pattern_type": "time_of_day",
            "title": f"Your {focus_bucket} trading is {focus_word} you",
            "description": (
                "Your data shows time-of-day performance shifts, with "
                f"{best_bucket} at {best_win_rate:.0%} win rate and "
                f"{worst_bucket} at {worst_win_rate:.0%}."
            ),
            "severity": _severity_from_gap(focus_gap),
            "data": {
                "overall_win_rate": round(overall_win_rate, 4),
                "best_bucket": best_bucket,
                "best_win_rate": round(best_win_rate, 4),
                "worst_bucket": worst_bucket,
                "worst_win_rate": round(worst_win_rate, 4),
                "sample_size": sample_size,
            },
        }
    except Exception:
        return None


def detect_day_of_week(user_id: int, db: Session) -> dict | None:
    try:
        trades = _load_completed_trades(user_id, db)
        if len(trades) < MIN_PATTERN_TRADE_COUNT:
            return None

        weekday_stats: dict[str, list[int]] = defaultdict(list)
        for trade in trades:
            label = WEEKDAY_LABELS.get(trade.entry_date.weekday())
            if label is None:
                continue
            weekday_stats[label].append(1 if _safe_float(trade.pnl) > 0 else 0)

        if len(weekday_stats) < 2:
            return None

        overall_win_rate = _overall_win_rate(trades)
        win_rates = {
            day: sum(outcomes) / len(outcomes)
            for day, outcomes in weekday_stats.items()
            if outcomes
        }
        best_day, best_win_rate = max(win_rates.items(), key=lambda item: item[1])
        worst_day, worst_win_rate = min(win_rates.items(), key=lambda item: item[1])
        best_gap = best_win_rate - overall_win_rate
        worst_gap = overall_win_rate - worst_win_rate

        if best_gap <= 0.15 and worst_gap <= 0.15:
            return None

        focus_gap = max(best_gap, worst_gap)
        return {
            "pattern_type": "day_of_week",
            "title": f"Your {worst_day if worst_gap >= best_gap else best_day} trades stand out",
            "description": (
                "Your data shows weekday differences, with "
                f"{best_day} at {best_win_rate:.0%} win rate and "
                f"{worst_day} at {worst_win_rate:.0%}."
            ),
            "severity": _severity_from_gap(focus_gap),
            "data": {
                "overall_win_rate": round(overall_win_rate, 4),
                "best_bucket": best_day,
                "best_win_rate": round(best_win_rate, 4),
                "worst_bucket": worst_day,
                "worst_win_rate": round(worst_win_rate, 4),
                "sample_size": len(trades),
            },
        }
    except Exception:
        return None


def detect_holding_period(user_id: int, db: Session) -> dict | None:
    try:
        trades = _load_completed_trades(user_id, db)
        if len(trades) < MIN_PATTERN_TRADE_COUNT:
            return None

        bucket_pnls: dict[str, list[float]] = defaultdict(list)
        for trade in trades:
            bucket_pnls[_bucket_holding_period(int(trade.holding_days))].append(_safe_float(trade.pnl))

        if len(bucket_pnls) < 2:
            return None

        avg_by_bucket = {
            bucket: mean(values)
            for bucket, values in bucket_pnls.items()
            if values
        }
        if not avg_by_bucket:
            return None

        best_bucket, best_avg_pnl = max(avg_by_bucket.items(), key=lambda item: item[1])
        worst_bucket, worst_avg_pnl = min(avg_by_bucket.items(), key=lambda item: item[1])
        overall_avg_pnl = mean(_safe_float(trade.pnl) for trade in trades)

        if best_avg_pnl <= overall_avg_pnl and worst_avg_pnl >= overall_avg_pnl:
            return None

        return {
            "pattern_type": "holding_period",
            "title": f"Your sweet spot is {best_bucket} trades",
            "description": (
                "Your data shows holding period matters, with "
                f"{best_bucket} trades averaging {_format_currency(best_avg_pnl)} per trade."
            ),
            "severity": _severity_from_gap(abs(best_avg_pnl - overall_avg_pnl) / max(abs(overall_avg_pnl), 1)),
            "data": {
                "overall_avg_pnl": round(overall_avg_pnl, 2),
                "best_bucket": best_bucket,
                "best_avg_pnl": round(best_avg_pnl, 2),
                "worst_bucket": worst_bucket,
                "worst_avg_pnl": round(worst_avg_pnl, 2),
                "sample_size": len(trades),
            },
        }
    except Exception:
        return None


def detect_revenge_trading(user_id: int, db: Session) -> dict | None:
    try:
        trades = _load_completed_trades(user_id, db)
        if len(trades) < MIN_PATTERN_TRADE_COUNT:
            return None

        revenge_trades: list[CompletedTrade] = []
        for index in range(1, len(trades)):
            previous = trades[index - 1]
            current = trades[index]
            if current.entry_date != previous.exit_date:
                continue
            if _safe_float(previous.pnl) >= 0:
                continue
            revenge_trades.append(current)

        revenge_count = len(revenge_trades)
        if revenge_count <= 5:
            return None

        overall_win_rate = _overall_win_rate(trades)
        revenge_win_rate = _overall_win_rate(revenge_trades)
        revenge_pnl = sum(_safe_float(trade.pnl) for trade in revenge_trades)

        if revenge_win_rate >= overall_win_rate:
            return None

        return {
            "pattern_type": "revenge_trading",
            "title": f"Revenge trading cost you {_format_currency(-abs(revenge_pnl))} this month",
            "description": (
                "Your data shows same-day follow-up trades after losses underperform "
                f"your overall win rate ({revenge_win_rate:.0%} vs {overall_win_rate:.0%})."
            ),
            "severity": _severity_from_gap(overall_win_rate - revenge_win_rate),
            "data": {
                "overall_win_rate": round(overall_win_rate, 4),
                "revenge_trade_count": revenge_count,
                "revenge_trade_pnl": round(revenge_pnl, 2),
                "revenge_trade_win_rate": round(revenge_win_rate, 4),
                "sample_size": len(trades),
            },
        }
    except Exception:
        return None


def detect_overtrading(user_id: int, db: Session) -> dict | None:
    try:
        trades = _load_completed_trades(user_id, db)
        if len(trades) < MIN_PATTERN_TRADE_COUNT:
            return None

        by_day: dict[date, list[CompletedTrade]] = defaultdict(list)
        for trade in trades:
            by_day[trade.exit_date].append(trade)

        if len(by_day) < 2:
            return None

        avg_trades_per_day = mean(len(day_trades) for day_trades in by_day.values())
        high_volume_days = [
            day for day, day_trades in by_day.items()
            if len(day_trades) > avg_trades_per_day * 2
        ]
        if not high_volume_days:
            return None

        high_volume_trades = [trade for day in high_volume_days for trade in by_day[day]]
        normal_trades = [trade for day, day_trades in by_day.items() if day not in high_volume_days for trade in day_trades]
        if not normal_trades:
            return None

        high_volume_win_rate = _overall_win_rate(high_volume_trades)
        normal_win_rate = _overall_win_rate(normal_trades)

        if normal_win_rate - high_volume_win_rate <= 0.10:
            return None

        return {
            "pattern_type": "overtrading",
            "title": f"You overtrade on {len(high_volume_days)} days - it's costing you",
            "description": (
                "Your data shows high-volume trading days have a lower win rate "
                f"than normal days ({high_volume_win_rate:.0%} vs {normal_win_rate:.0%})."
            ),
            "severity": _severity_from_gap(normal_win_rate - high_volume_win_rate),
            "data": {
                "average_trades_per_day": round(avg_trades_per_day, 2),
                "high_volume_day_count": len(high_volume_days),
                "high_volume_day_win_rate": round(high_volume_win_rate, 4),
                "normal_day_win_rate": round(normal_win_rate, 4),
                "sample_size": len(trades),
            },
        }
    except Exception:
        return None


def detect_sector_concentration(user_id: int, db: Session) -> dict | None:
    try:
        trades = _load_completed_trades(user_id, db)
        if len(trades) < MIN_PATTERN_TRADE_COUNT:
            return None

        sector_counts: Counter[str] = Counter()
        sector_pnls: dict[str, list[float]] = defaultdict(list)

        for trade in trades:
            sector = SECTOR_MAP.get(trade.stock_symbol.upper(), "Other")
            sector_counts[sector] += 1
            sector_pnls[sector].append(_safe_float(trade.pnl))

        sector, count = sector_counts.most_common(1)[0]
        share = count / len(trades)
        if share <= 0.5:
            return None

        sector_avg = mean(sector_pnls[sector]) if sector_pnls[sector] else 0.0
        overall_avg = mean(_safe_float(trade.pnl) for trade in trades)
        direction = "helping" if sector_avg >= overall_avg else "hurting"

        return {
            "pattern_type": "sector_concentration",
            "title": f"{share:.0%} of your trades are in {sector} - and it's {direction}",
            "description": (
                "Your data shows one sector dominates your book, with "
                f"{sector} trades averaging {_format_currency(sector_avg)} versus "
                f"{_format_currency(overall_avg)} overall."
            ),
            "severity": _severity_from_gap(abs(sector_avg - overall_avg) / max(abs(overall_avg), 1)),
            "data": {
                "sector": sector,
                "sector_share": round(share, 4),
                "sector_avg_pnl": round(sector_avg, 2),
                "overall_avg_pnl": round(overall_avg, 2),
                "sample_size": len(trades),
            },
        }
    except Exception:
        return None


def detect_winning_streak_tilt(user_id: int, db: Session) -> dict | None:
    try:
        trades = _load_completed_trades(user_id, db)
        if len(trades) < MIN_PATTERN_TRADE_COUNT:
            return None

        post_streak_trades: list[CompletedTrade] = []
        streak_length = 0
        for index, trade in enumerate(trades):
            if _safe_float(trade.pnl) > 0:
                streak_length += 1
            else:
                if streak_length >= 3 and index < len(trades):
                    post_streak_trades.append(trades[index])
                streak_length = 0

        if len(post_streak_trades) < 2:
            return None

        overall_win_rate = _overall_win_rate(trades)
        post_streak_win_rate = _overall_win_rate(post_streak_trades)
        avg_position_size = mean(int(trade.quantity) for trade in trades)
        post_streak_position_size = mean(int(trade.quantity) for trade in post_streak_trades)

        if overall_win_rate - post_streak_win_rate <= 0.15:
            return None

        return {
            "pattern_type": "winning_streak_tilt",
            "title": "After winning streaks, your discipline drops",
            "description": (
                "Your data shows trades placed right after 3+ win streaks have a lower "
                f"win rate ({post_streak_win_rate:.0%} vs {overall_win_rate:.0%})."
            ),
            "severity": _severity_from_gap(overall_win_rate - post_streak_win_rate),
            "data": {
                "overall_win_rate": round(overall_win_rate, 4),
                "post_streak_win_rate": round(post_streak_win_rate, 4),
                "overall_avg_position_size": round(avg_position_size, 2),
                "post_streak_avg_position_size": round(post_streak_position_size, 2),
                "sample_size": len(post_streak_trades),
            },
        }
    except Exception:
        return None


def detect_losing_streak_tilt(user_id: int, db: Session) -> dict | None:
    try:
        trades = _load_completed_trades(user_id, db)
        if len(trades) < MIN_PATTERN_TRADE_COUNT:
            return None

        post_streak_trades: list[CompletedTrade] = []
        streak_length = 0
        for index, trade in enumerate(trades):
            if _safe_float(trade.pnl) < 0:
                streak_length += 1
            else:
                if streak_length >= 3 and index < len(trades):
                    post_streak_trades.append(trades[index])
                streak_length = 0

        if len(post_streak_trades) < 2:
            return None

        overall_avg_pnl = mean(_safe_float(trade.pnl) for trade in trades)
        post_streak_avg_pnl = mean(_safe_float(trade.pnl) for trade in post_streak_trades)
        post_streak_win_rate = _overall_win_rate(post_streak_trades)
        overall_win_rate = _overall_win_rate(trades)

        if post_streak_avg_pnl >= overall_avg_pnl:
            return None

        return {
            "pattern_type": "losing_streak_tilt",
            "title": "Losing streaks trigger bigger losses for you",
            "description": (
                "Your data shows the trade after a 3+ loss streak averages "
                f"{_format_currency(post_streak_avg_pnl)} versus {_format_currency(overall_avg_pnl)} overall."
            ),
            "severity": _severity_from_gap(abs(post_streak_avg_pnl - overall_avg_pnl) / max(abs(overall_avg_pnl), 1)),
            "data": {
                "overall_avg_pnl": round(overall_avg_pnl, 2),
                "post_streak_avg_pnl": round(post_streak_avg_pnl, 2),
                "overall_win_rate": round(overall_win_rate, 4),
                "post_streak_win_rate": round(post_streak_win_rate, 4),
                "sample_size": len(post_streak_trades),
            },
        }
    except Exception:
        return None


def detect_expiry_day_tilt(user_id: int, db: Session) -> dict | None:
    try:
        trades = _load_completed_trades(user_id, db)
        if not trades:
            return None

        expiry_wins = 0
        expiry_total = 0
        normal_wins = 0
        normal_total = 0
        expiry_pnl_total = Decimal("0.00")
        normal_pnl_total = Decimal("0.00")

        for trade in trades:
            if trade.exit_date is None:
                continue
            parsed = parse_trade_instrument(trade.stock_symbol)
            if parsed.instrument_type != "OPT" or parsed.underlying_asset not in INDEX_EXPIRY_WEEKDAY:
                continue

            trade_net_pnl = _safe_decimal(getattr(trade, "net_pnl", None))
            is_expiry = is_expiry_session(parsed.underlying_asset, trade.exit_date)

            if is_expiry:
                expiry_total += 1
                expiry_pnl_total += trade_net_pnl
                if trade_net_pnl > 0:
                    expiry_wins += 1
            else:
                normal_total += 1
                normal_pnl_total += trade_net_pnl
                if trade_net_pnl > 0:
                    normal_wins += 1

        if expiry_total < EXPIRY_TILT_MIN_SAMPLE or normal_total < EXPIRY_TILT_MIN_SAMPLE:
            return None

        expiry_win_rate_ratio = expiry_wins / expiry_total
        normal_win_rate_ratio = normal_wins / normal_total
        win_rate_delta = normal_win_rate_ratio - expiry_win_rate_ratio
        estimated_loss = abs(expiry_pnl_total - normal_pnl_total)

        if win_rate_delta < EXPIRY_TILT_MIN_WIN_RATE_DELTA:
            return None
        if estimated_loss < EXPIRY_TILT_MIN_LOSS_DELTA and expiry_pnl_total >= normal_pnl_total:
            return None

        severity = "low"
        if (
            win_rate_delta >= 0.20
            or estimated_loss >= Decimal("10000.00")
            or expiry_total >= 25
        ):
            severity = "high"
        elif win_rate_delta >= 0.12 or estimated_loss >= Decimal("5000.00"):
            severity = "medium"

        return {
            "pattern_type": "expiry_day_tilt",
            "title": "Expiry-day trades are hurting your edge",
            "description": (
                "Your option trades perform worse on expiry sessions than on non-expiry days "
                f"({expiry_win_rate_ratio:.0%} vs {normal_win_rate_ratio:.0%} win rate)."
            ),
            "severity": severity,
            "data": {
                "expiry_win_rate": round(expiry_win_rate_ratio * 100, 2),
                "normal_win_rate": round(normal_win_rate_ratio * 100, 2),
                "expiry_trade_count": expiry_total,
                "normal_trade_count": normal_total,
                "estimated_loss": round(float(abs(expiry_pnl_total - normal_pnl_total)), 2),
            },
        }
    except Exception:
        return None


def is_expiry_session(underlying_asset: str | None, exit_date: date | None) -> bool:
    if not underlying_asset or exit_date is None:
        return False
    return INDEX_EXPIRY_WEEKDAY.get(underlying_asset) == exit_date.weekday()


DETECTORS = [
    detect_time_of_day,
    detect_day_of_week,
    detect_holding_period,
    detect_revenge_trading,
    detect_overtrading,
    detect_sector_concentration,
    detect_winning_streak_tilt,
    detect_losing_streak_tilt,
    detect_expiry_day_tilt,
]


def run_behavioral_analysis(user_id: int, db: Session) -> list[dict]:
    patterns: list[dict] = []
    for detector in DETECTORS:
        result = detector(user_id, db)
        if result is not None:
            patterns.append(result)
    return patterns
