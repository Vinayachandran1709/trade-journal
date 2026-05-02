from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.stock import Stock
from app.schemas.stocks import StockDebugResponse, StockDictionaryResponse
from app.services.stock_master_service import (
    build_stock_dictionary,
    get_stock_master_debug,
    sync_stock_master,
)

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


@router.get("/dictionary", response_model=StockDictionaryResponse)
def stock_dictionary(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    stock_count = db.query(func.count(Stock.id)).scalar() or 0
    if stock_count == 0:
        sync_stock_master(db)

    payload, etag = build_stock_dictionary(db)
    cache_headers = {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "ETag": etag,
    }

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=cache_headers)

    response.headers.update(cache_headers)

    return payload


@router.post("/sync")
def sync_stocks(
    force: bool = Query(default=False, description="Force a full remote sync even if data is already fresh."),
    db: Session = Depends(get_db),
):
    """Populate or refresh the stocks table from NSE and BSE sources."""
    stock_count = db.query(func.count(Stock.id)).scalar() or 0
    last_sync_time = db.query(func.max(Stock.last_updated)).scalar()

    if (
        not force
        and stock_count >= 100
        and last_sync_time is not None
        and last_sync_time.date() == datetime.now(UTC).date()
    ):
        debug = get_stock_master_debug(db)
        return {
            "skipped": True,
            "message": "Stock master is already populated and was synced today. Use force=true to run a full sync.",
            "nse_records_seen": debug["nse_records_seen"],
            "bse_records_seen": debug["bse_records_seen"],
            "merged_records": debug["total_stocks"],
            "inserted": 0,
            "updated": 0,
            "total_stocks": debug["total_stocks"],
            "total_unique_isins": debug["total_unique_isins"],
            "total_aliases": debug["total_aliases"],
            "last_sync_time": debug["last_sync_time"],
            "source_failures": [],
        }

    return sync_stock_master(db)


@router.get("/debug", response_model=StockDebugResponse)
def stock_debug(db: Session = Depends(get_db)):
    return get_stock_master_debug(db)
