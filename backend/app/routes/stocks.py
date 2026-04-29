from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.stocks import StockDebugResponse, StockDictionaryResponse
from app.services.stock_master_service import build_stock_dictionary, get_stock_master_debug

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


@router.get("/dictionary", response_model=StockDictionaryResponse)
def stock_dictionary(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    payload, etag = build_stock_dictionary(db)
    cache_headers = {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "ETag": etag,
    }

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=cache_headers)

    response.headers.update(cache_headers)

    return payload


@router.get("/debug", response_model=StockDebugResponse)
def stock_debug(db: Session = Depends(get_db)):
    return get_stock_master_debug(db)
