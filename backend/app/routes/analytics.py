from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from statistics import mean

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.behavioral_pattern import BehavioralPattern
from app.models.completed_trade import CompletedTrade
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsSummaryResponse,
    AnalyzePatternsResponse,
    MonthlyPnlPoint,
    PatternResponse,
    PatternsEnvelope,
    TradeExtremes,
)
from app.services.behavioral_engine import MIN_PATTERN_TRADE_COUNT, run_behavioral_analysis
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _empty_summary() -> AnalyticsSummaryResponse:
    return AnalyticsSummaryResponse(
        total_trades=0,
        win_rate=0.0,
        total_pnl=0.0,
        avg_pnl_per_trade=0.0,
        best_trade=TradeExtremes(),
        worst_trade=TradeExtremes(),
        avg_holding_days=0.0,
        most_traded_symbol=None,
        monthly_pnl=[],
    )


def _is_pro_active(user: User) -> bool:
    status = user.subscription_status or ""
    plan = user.subscription_plan or ""
    expires = user.subscription_expires_at

    if plan == "pro_founding":
        return True

    if status not in {"pro", "pro_cancelled"}:
        return False

    if expires is None:
        return False

    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    return expires > datetime.now(timezone.utc)


def _completed_trade_count(user_id: int, db: Session) -> int:
    return (
        db.query(CompletedTrade)
        .filter(CompletedTrade.user_id == user_id)
        .count()
    )


def _serialize_pattern(pattern: BehavioralPattern, *, locked: bool) -> PatternResponse:
    return PatternResponse(
        pattern_type=pattern.pattern_type,
        title=pattern.title,
        description=pattern.description,
        severity=pattern.severity,
        data=pattern.pattern_data or {},
        locked=locked,
    )


def _sorted_patterns(patterns: list[BehavioralPattern]) -> list[BehavioralPattern]:
    return sorted(
        patterns,
        key=lambda pattern: (
            SEVERITY_ORDER.get(pattern.severity, 99),
            pattern.updated_at or pattern.created_at,
        ),
    )


def _should_auto_reanalyze(
    user_id: int,
    db: Session,
    total_completed_trades: int,
    patterns: list[BehavioralPattern],
) -> bool:
    if total_completed_trades < MIN_PATTERN_TRADE_COUNT:
        return False
    if not patterns:
        return True
    latest_snapshot = max((pattern.trade_count_snapshot or 0) for pattern in patterns)
    return total_completed_trades - latest_snapshot >= 5


def _upsert_patterns(user_id: int, db: Session, patterns: list[dict], trade_count_snapshot: int) -> None:
    existing = {
        pattern.pattern_type: pattern
        for pattern in db.query(BehavioralPattern).filter(BehavioralPattern.user_id == user_id).all()
    }
    active_pattern_types = {pattern["pattern_type"] for pattern in patterns}

    for pattern in patterns:
        record = existing.get(pattern["pattern_type"])
        if record is None:
            record = BehavioralPattern(
                user_id=user_id,
                pattern_type=pattern["pattern_type"],
                title=pattern["title"],
                description=pattern["description"],
                severity=pattern["severity"],
                pattern_data=pattern["data"],
                trade_count_snapshot=trade_count_snapshot,
                is_active=True,
            )
            db.add(record)
            continue

        record.title = pattern["title"]
        record.description = pattern["description"]
        record.severity = pattern["severity"]
        record.pattern_data = pattern["data"]
        record.trade_count_snapshot = trade_count_snapshot
        record.is_active = True

    for pattern_type, record in existing.items():
        if pattern_type not in active_pattern_types:
            record.is_active = False

    db.commit()


def _run_and_store_analysis(user_id: int, db: Session) -> tuple[list[dict], int]:
    total_completed_trades = _completed_trade_count(user_id, db)
    if total_completed_trades < MIN_PATTERN_TRADE_COUNT:
        return [], total_completed_trades

    patterns = run_behavioral_analysis(user_id, db)
    _upsert_patterns(user_id, db, patterns, total_completed_trades)
    return patterns, total_completed_trades


@router.post("/analyze-patterns", response_model=AnalyzePatternsResponse)
def analyze_patterns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalyzePatternsResponse:
    patterns, total_completed_trades = _run_and_store_analysis(current_user.id, db)
    return AnalyzePatternsResponse(
        patterns=[
            PatternResponse(
                pattern_type=pattern["pattern_type"],
                title=pattern["title"],
                description=pattern["description"],
                severity=pattern["severity"],
                data=pattern["data"],
                locked=False,
            )
            for pattern in sorted(patterns, key=lambda item: SEVERITY_ORDER.get(item["severity"], 99))
        ],
        total_completed_trades=total_completed_trades,
        threshold=MIN_PATTERN_TRADE_COUNT,
        unlocked=total_completed_trades >= MIN_PATTERN_TRADE_COUNT,
    )


@router.get("/patterns", response_model=PatternsEnvelope)
def get_patterns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PatternsEnvelope:
    total_completed_trades = _completed_trade_count(current_user.id, db)
    stored_patterns = (
        db.query(BehavioralPattern)
        .filter(
            BehavioralPattern.user_id == current_user.id,
            BehavioralPattern.is_active.is_(True),
        )
        .all()
    )

    try:
        should_auto_reanalyze = _should_auto_reanalyze(
            current_user.id,
            db,
            total_completed_trades,
            stored_patterns,
        )
    except Exception:
        db.rollback()
        should_auto_reanalyze = False

    if should_auto_reanalyze:
        try:
            _run_and_store_analysis(current_user.id, db)
        except Exception:
            db.rollback()
        else:
            stored_patterns = (
                db.query(BehavioralPattern)
                .filter(
                    BehavioralPattern.user_id == current_user.id,
                    BehavioralPattern.is_active.is_(True),
                )
                .all()
            )

    if total_completed_trades < MIN_PATTERN_TRADE_COUNT:
        return PatternsEnvelope(
            patterns=[],
            total_completed_trades=total_completed_trades,
            threshold=MIN_PATTERN_TRADE_COUNT,
            unlocked=False,
        )

    sorted_patterns = _sorted_patterns(stored_patterns)
    visible_count = len(sorted_patterns) if _is_pro_active(current_user) else 2
    response_patterns = [
        _serialize_pattern(pattern, locked=index >= visible_count)
        for index, pattern in enumerate(sorted_patterns)
    ]

    return PatternsEnvelope(
        patterns=response_patterns,
        total_completed_trades=total_completed_trades,
        threshold=MIN_PATTERN_TRADE_COUNT,
        unlocked=True,
    )


@router.get("/summary", response_model=AnalyticsSummaryResponse)
def get_analytics_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalyticsSummaryResponse:
    try:
        trades = (
            db.query(CompletedTrade)
            .filter(CompletedTrade.user_id == current_user.id)
            .order_by(CompletedTrade.exit_date.asc(), CompletedTrade.id.asc())
            .all()
        )

        total_trades = len(trades)
        if not trades:
            return _empty_summary()

        pnl_values = [Decimal(str(trade.net_pnl or 0)) for trade in trades]
        win_rate = sum(1 for trade in trades if Decimal(str(trade.net_pnl or 0)) > 0) / total_trades
        total_pnl = sum(pnl_values, start=Decimal("0.00"))
        avg_pnl_per_trade = total_pnl / Decimal(total_trades)
        avg_holding_days = mean(int(trade.holding_days) for trade in trades)
        best_trade = max(trades, key=lambda trade: Decimal(str(trade.net_pnl or 0)))
        worst_trade = min(trades, key=lambda trade: Decimal(str(trade.net_pnl or 0)))
        most_traded_symbol = Counter(trade.stock_symbol for trade in trades).most_common(1)[0][0]

        monthly_totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
        for trade in trades:
            monthly_totals[trade.exit_date.strftime("%Y-%m")] += Decimal(str(trade.net_pnl or 0))

        monthly_pnl = [
            MonthlyPnlPoint(month=month, pnl=round(float(monthly_totals[month]), 2))
            for month in sorted(monthly_totals)
        ]

        return AnalyticsSummaryResponse(
            total_trades=total_trades,
            win_rate=round(win_rate, 4),
            total_pnl=round(float(total_pnl), 2),
            avg_pnl_per_trade=round(float(avg_pnl_per_trade), 2),
            best_trade=TradeExtremes(
                symbol=best_trade.stock_symbol,
                pnl=round(float(Decimal(str(best_trade.net_pnl or 0))), 2),
                exit_date=best_trade.exit_date,
            ),
            worst_trade=TradeExtremes(
                symbol=worst_trade.stock_symbol,
                pnl=round(float(Decimal(str(worst_trade.net_pnl or 0))), 2),
                exit_date=worst_trade.exit_date,
            ),
            avg_holding_days=round(avg_holding_days, 2),
            most_traded_symbol=most_traded_symbol,
            monthly_pnl=monthly_pnl,
        )
    except Exception:
        db.rollback()
        return _empty_summary()
