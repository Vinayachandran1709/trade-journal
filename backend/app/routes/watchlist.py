from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.watchlist import WatchlistItem
from app.services.market_data_service import get_ticker_quote
from app.services.research_agent import _get_user_stock_history
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class AddWatchlistRequest(BaseModel):
    symbol: str
    notes: str | None = None
    alert_price_above: str | None = None
    alert_price_below: str | None = None


class AlertRequest(BaseModel):
    alert_price_above: str | None = None
    alert_price_below: str | None = None


def _normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper().replace(".NS", "").replace(".BO", "")


def _threshold(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _alert_status(item: WatchlistItem, price: float | None) -> dict:
    above = _threshold(item.alert_price_above)
    below = _threshold(item.alert_price_below)
    return {
        "above_triggered": price is not None and above is not None and price >= above,
        "below_triggered": price is not None and below is not None and price <= below,
        "alert_price_above": item.alert_price_above,
        "alert_price_below": item.alert_price_below,
    }


@router.get("/")
def list_watchlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.user_id == current_user.id)
        .order_by(WatchlistItem.added_at.desc(), WatchlistItem.id.desc())
        .all()
    )
    enriched = []
    for item in items:
        quote = get_ticker_quote(item.symbol, db)
        price = quote.get("price")
        enriched.append(
            {
                "id": item.id,
                "symbol": item.symbol,
                "added_at": item.added_at,
                "notes": item.notes,
                "quote": quote,
                "alerts": _alert_status(item, price),
                "trading_history": _get_user_stock_history(current_user.id, item.symbol, db),
            }
        )
    return {"items": enriched, "count": len(enriched)}


@router.post("/add")
def add_to_watchlist(
    request: AddWatchlistRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    symbol = _normalize_symbol(request.symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    existing = (
        db.query(WatchlistItem)
        .filter(
            WatchlistItem.user_id == current_user.id,
            func.upper(WatchlistItem.symbol) == symbol,
        )
        .first()
    )
    if existing:
        return {"item_id": existing.id, "symbol": existing.symbol, "already_exists": True}

    item = WatchlistItem(
        user_id=current_user.id,
        symbol=symbol,
        notes=request.notes,
        alert_price_above=request.alert_price_above,
        alert_price_below=request.alert_price_below,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"item_id": item.id, "symbol": item.symbol, "already_exists": False}


@router.delete("/{item_id}")
def remove_from_watchlist(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.id == item_id, WatchlistItem.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    db.delete(item)
    db.commit()
    return {"deleted": True, "item_id": item_id}


@router.patch("/{item_id}/alerts")
def set_price_alerts(
    item_id: int,
    request: AlertRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.id == item_id, WatchlistItem.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")

    item.alert_price_above = request.alert_price_above
    item.alert_price_below = request.alert_price_below
    db.commit()
    db.refresh(item)
    return {
        "item_id": item.id,
        "symbol": item.symbol,
        "alerts": _alert_status(item, None),
    }
