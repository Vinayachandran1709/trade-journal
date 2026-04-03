from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.completed_trade import CompletedTrade
from app.models.trade import Trade
from app.models.user import User
from app.schemas.trade import (
    CompletedTradeResponse,
    TradeCreate,
    TradeImportRequest,
    TradeImportResponse,
    TradeResponse,
    TradesSummary,
)
from app.services.csv_parser import parse_groww_csv
from app.services.email_parser import parse_zerodha_contract_note
from app.services.trade_processor import calculate_completed_trades, clean_stock_symbol
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/trades", tags=["trades"])


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

    imported_trades: list[Trade] = []

    for trade in parsed_trades:
        duplicate = (
            db.query(Trade)
            .filter(
                Trade.user_id == current_user.id,
                Trade.stock_symbol == trade["stock_symbol"],
                Trade.trade_type == trade["trade_type"],
                Trade.quantity == trade["quantity"],
                Trade.price == Decimal(str(trade["price"])),
                Trade.trade_date == trade["trade_date"],
            )
            .first()
        )

        if duplicate:
            continue

        new_trade = Trade(
            user_id=current_user.id,
            stock_symbol=trade["stock_symbol"],
            trade_type=trade["trade_type"],
            quantity=trade["quantity"],
            price=Decimal(str(trade["price"])),
            trade_date=trade["trade_date"],
            broker="zerodha",
            import_source="email",
        )
        db.add(new_trade)
        imported_trades.append(new_trade)

    db.commit()

    for trade in imported_trades:
        db.refresh(trade)

    return TradeImportResponse(imported=len(imported_trades), trades=imported_trades)


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

    imported_trades: list[Trade] = []

    for trade in parsed_trades:
        duplicate = (
            db.query(Trade)
            .filter(
                Trade.user_id == current_user.id,
                Trade.stock_symbol == trade["stock_symbol"],
                Trade.trade_type == trade["trade_type"],
                Trade.quantity == trade["quantity"],
                Trade.price == Decimal(str(trade["price"])),
                Trade.trade_date == trade["trade_date"],
            )
            .first()
        )

        if duplicate:
            continue

        new_trade = Trade(
            user_id=current_user.id,
            stock_symbol=trade["stock_symbol"],
            trade_type=trade["trade_type"],
            quantity=trade["quantity"],
            price=Decimal(str(trade["price"])),
            trade_date=trade["trade_date"],
            broker="groww",
            import_source="csv",
        )
        db.add(new_trade)
        imported_trades.append(new_trade)

    db.commit()

    for trade in imported_trades:
        db.refresh(trade)

    return TradeImportResponse(imported=len(imported_trades), trades=imported_trades)


@router.get("/summary", response_model=TradesSummary)
def get_trades_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TradesSummary:
    trades = db.query(Trade).filter(Trade.user_id == current_user.id).all()

    total_trades = len(trades)
    total_invested = sum(
        trade.price * trade.quantity
        for trade in trades
        if trade.trade_type == "BUY"
    )
    unique_symbols = len({trade.stock_symbol for trade in trades})

    return TradesSummary(
        total_trades=total_trades,
        total_invested=Decimal(str(total_invested)),
        unique_symbols=unique_symbols,
    )


@router.get("/", response_model=list[TradeResponse])
def get_trades(
    symbol: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TradeResponse]:
    query = db.query(Trade).filter(Trade.user_id == current_user.id)

    if symbol:
        query = query.filter(Trade.stock_symbol == symbol.upper())
    if start_date:
        query = query.filter(Trade.trade_date >= start_date)
    if end_date:
        query = query.filter(Trade.trade_date <= end_date)

    query = query.order_by(Trade.trade_date.desc())
    trades = query.limit(limit).offset(offset).all()

    return trades


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

    return {
        "processed": len(completed),
        "completed_trades": len(completed),
        "message": "Trades processed successfully",
    }


@router.get("/completed", response_model=list[CompletedTradeResponse])
def get_completed_trades(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CompletedTradeResponse]:
    trades = (
        db.query(CompletedTrade)
        .filter(CompletedTrade.user_id == current_user.id)
        .order_by(CompletedTrade.exit_date.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return trades
