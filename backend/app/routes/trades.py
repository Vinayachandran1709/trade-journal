from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.completed_trade import CompletedTrade
from app.models.trade import Trade
from app.models.user import User
from app.schemas.trade import (
    AutoCaptureRequest,
    CompletedTradeResponse,
    TradeImportRequest,
    TradeImportResponse,
    TradeAnnotationUpdateRequest,
    TradeResponse,
    TradesSummary,
    PaginatedTradesResponse,
    PaginatedCompletedTradesResponse,
)
from app.services.csv_parser import parse_groww_csv
from app.services.email_parser import parse_zerodha_contract_note
from app.services.trade_import_service import import_trades
from app.services.trade_processor import calculate_completed_trades, clean_stock_symbol
from app.services.checklist_service import link_setup_to_trade
from app.services.universal_csv_parser import parse_universal_csv
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/trades", tags=["trades"])
IST = ZoneInfo("Asia/Kolkata")


@router.post("/import/zerodha-email", response_model=TradeImportResponse)
def import_zerodha_email(
    request: TradeImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TradeImportResponse:
    parsed_trades = parse_zerodha_contract_note(request.email_content)

    if not parsed_trades:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No trades found in email",
        )

    result = import_trades(
        db,
        user_id=current_user.id,
        trades=parsed_trades,
        default_broker="zerodha",
        import_source="email",
    )

    return TradeImportResponse(
        imported=len(result.imported_trades),
        imported_count=len(result.imported_trades),
        duplicate_count=result.duplicate_count,
        imported_trade_ids=[trade.id for trade in result.imported_trades],
        trades=result.imported_trades,
    )


@router.post("/import/groww-csv", response_model=TradeImportResponse)
async def import_groww_csv_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TradeImportResponse:
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are allowed",
        )

    content = await file.read()
    parsed_trades = parse_groww_csv(content)

    if not parsed_trades:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No trades found in CSV",
        )

    result = import_trades(
        db,
        user_id=current_user.id,
        trades=parsed_trades,
        default_broker="groww",
        import_source="csv",
    )

    return TradeImportResponse(
        imported=len(result.imported_trades),
        imported_count=len(result.imported_trades),
        duplicate_count=result.duplicate_count,
        imported_trade_ids=[trade.id for trade in result.imported_trades],
        trades=result.imported_trades,
        detected_broker="groww",
    )


@router.post("/import/universal-csv", response_model=TradeImportResponse)
async def import_universal_csv_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TradeImportResponse:
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are allowed",
        )

    content = await file.read()
    parsed = parse_universal_csv(content)

    if parsed.manual_mapping_required:
        return TradeImportResponse(
            imported=0,
            imported_count=0,
            duplicate_count=0,
            trades=[],
            imported_trade_ids=[],
            detected_broker=parsed.detected_broker,
            mode="manual_mapping_required",
            preview_headers=parsed.preview_headers,
            preview_rows=parsed.preview_rows,
            message=parsed.message,
        )

    result = import_trades(
        db,
        user_id=current_user.id,
        trades=parsed.trades,
        default_broker=parsed.detected_broker,
        import_source="csv",
    )

    return TradeImportResponse(
        imported=len(result.imported_trades),
        imported_count=len(result.imported_trades),
        duplicate_count=result.duplicate_count,
        imported_trade_ids=[trade.id for trade in result.imported_trades],
        trades=result.imported_trades,
        detected_broker=parsed.detected_broker,
    )


@router.post("/auto-capture", response_model=TradeImportResponse)
def auto_capture_trades(
    request: AutoCaptureRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TradeImportResponse:
    if not request.trades:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No trades received for auto-capture",
        )

    result = import_trades(
        db,
        user_id=current_user.id,
        trades=[trade.model_dump() for trade in request.trades],
        default_broker=request.broker,
        import_source="extension",
        default_entry_method=request.capture_method,
    )
    for trade in result.imported_trades:
        link_setup_to_trade(current_user.id, trade.id, db)

    return TradeImportResponse(
        imported=len(result.imported_trades),
        imported_count=len(result.imported_trades),
        duplicate_count=result.duplicate_count,
        imported_trade_ids=[trade.id for trade in result.imported_trades],
        trades=result.imported_trades,
        detected_broker=request.broker,
    )


@router.get("/summary", response_model=TradesSummary)
def get_trades_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TradesSummary:
    trades = db.query(Trade).filter(Trade.user_id == current_user.id).all()
    today_ist = datetime.now(IST).date()
    completed_trades = (
        db.query(CompletedTrade)
        .filter(
            CompletedTrade.user_id == current_user.id,
            CompletedTrade.exit_date == today_ist,
        )
        .all()
    )
    preferences = current_user.preferences or {}
    daily_loss_limit = preferences.get("daily_loss_limit")

    total_trades = len(trades)
    total_invested = sum(
        trade.price * trade.quantity
        for trade in trades
        if trade.trade_type == "BUY"
    )
    unique_symbols = len({trade.stock_symbol for trade in trades})
    net_pnl_today = sum(Decimal(str(trade.net_pnl or 0)) for trade in completed_trades)

    return TradesSummary(
        total_trades=total_trades,
        total_invested=Decimal(str(total_invested)),
        unique_symbols=unique_symbols,
        net_pnl_today=Decimal(str(net_pnl_today)),
        max_loss_threshold=Decimal(str(daily_loss_limit or 0)),
    )


def _is_pro_active(user: User) -> bool:
    status_ = user.subscription_status
    if status_ not in ("pro", "pro_founding"):
        return False
    if status_ == "pro_founding":
        return True
    expires = user.subscription_expires_at
    if expires is None:
        return False
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return expires > datetime.now(timezone.utc)


@router.get("/", response_model=PaginatedTradesResponse)
def get_trades(
    symbol: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    response: Response = None,
) -> PaginatedTradesResponse:
    query = db.query(Trade).filter(Trade.user_id == current_user.id)

    if symbol:
        query = query.filter(Trade.stock_symbol == symbol.upper())
    if start_date:
        query = query.filter(Trade.trade_date >= start_date)
    if end_date:
        query = query.filter(Trade.trade_date <= end_date)

    total = query.count()
    hidden_count = 0
    is_limited = False

    if not _is_pro_active(current_user):
        free_cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).date()
        effective_cutoff = max(start_date, free_cutoff) if start_date else free_cutoff

        hidden_count = (
            db.query(Trade)
            .filter(
                Trade.user_id == current_user.id,
                Trade.trade_date < effective_cutoff,
            )
            .count()
        )
        if symbol:
            hidden_count = (
                db.query(Trade)
                .filter(
                    Trade.user_id == current_user.id,
                    Trade.stock_symbol == symbol.upper(),
                    Trade.trade_date < effective_cutoff,
                )
                .count()
            )

        query = query.filter(Trade.trade_date >= effective_cutoff)
        is_limited = True

        if response is not None:
            response.headers["X-Hidden-Trade-Count"] = str(hidden_count)

    query = query.order_by(Trade.trade_date.desc())
    trades = query.limit(limit).offset(offset).all()

    return PaginatedTradesResponse(
        trades=trades,
        total=total,
        hidden_trade_count=hidden_count,
        is_limited=is_limited,
    )


@router.post("/process")
def process_trades(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    completed = calculate_completed_trades(db, current_user.id)

    # Delete existing completed trades for user
    db.query(CompletedTrade).filter(
        CompletedTrade.user_id == current_user.id
    ).delete()

    # Add all new completed trades
    for trade in completed:
        db.add(trade)

    db.commit()
    for trade in completed:
        link_setup_to_trade(current_user.id, trade.id, db)

    return {
        "processed": len(completed),
        "completed_trades": len(completed),
        "message": "Trades processed successfully",
    }


@router.get("/completed", response_model=PaginatedCompletedTradesResponse)
def get_completed_trades(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedCompletedTradesResponse:
    query = db.query(CompletedTrade).filter(CompletedTrade.user_id == current_user.id)
    
    total = query.count()
    hidden_count = 0
    is_limited = False
    
    if not _is_pro_active(current_user):
        free_cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).date()
        
        hidden_count = (
            db.query(CompletedTrade)
            .filter(
                CompletedTrade.user_id == current_user.id,
                CompletedTrade.exit_date < free_cutoff,
            )
            .count()
        )
        
        query = query.filter(CompletedTrade.exit_date >= free_cutoff)
        is_limited = True

    trades = (
        query
        .order_by(CompletedTrade.exit_date.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    
    return PaginatedCompletedTradesResponse(
        trades=trades,
        total=total,
        hidden_trade_count=hidden_count,
        is_limited=is_limited,
    )


@router.patch("/{trade_id}", response_model=TradeResponse)
def update_trade_annotations(
    trade_id: int,
    request: TradeAnnotationUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TradeResponse:
    trade = (
        db.query(Trade)
        .filter(Trade.id == trade_id, Trade.user_id == current_user.id)
        .first()
    )
    if trade is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trade not found",
        )

    trade.emotion_tag = request.emotion_tag
    trade.notes = request.note
    db.commit()
    db.refresh(trade)
    return trade
