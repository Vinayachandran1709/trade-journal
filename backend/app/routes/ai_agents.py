from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.ai_agents import (
    QuotaExceededResponse,
    TickerIntelligenceResponse,
    WhyMovingRequest,
    WhyMovingResponse,
)
from app.services.ai_service import (
    AIQuotaExceededError,
    AIServiceBusyError,
    AIServiceNotConfiguredError,
    AIServiceTimeoutError,
    get_ticker_intelligence,
    why_is_it_moving,
)
from app.utils.dependencies import get_current_user, get_optional_current_user

router = APIRouter(tags=["ai_agents"])


@router.post(
    "/api/ai/why-moving",
    response_model=WhyMovingResponse,
    responses={429: {"model": QuotaExceededResponse}},
)
async def why_moving(
    request: WhyMovingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return await why_is_it_moving(request.symbol, current_user, db)
    except AIQuotaExceededError as exc:
        return JSONResponse(
            status_code=429,
            content={
                "error": "quota_exceeded",
                "message": exc.message,
                "queries_used": exc.queries_used,
                "queries_limit": exc.queries_limit,
                "upgrade_url": "/pricing",
            },
        )
    except AIServiceNotConfiguredError:
        return JSONResponse(status_code=503, content={"message": "AI service not configured"})
    except AIServiceBusyError:
        return JSONResponse(
            status_code=503,
            content={"message": "AI service temporarily busy, try again in a moment"},
        )
    except AIServiceTimeoutError:
        return JSONResponse(status_code=504, content={"message": "AI service timeout"})


@router.get(
    "/api/market/ticker-intel/{symbol}",
    response_model=TickerIntelligenceResponse,
    responses={429: {"model": QuotaExceededResponse}},
)
def ticker_intelligence(
    symbol: str,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    try:
        return get_ticker_intelligence(symbol, db, current_user)
    except AIQuotaExceededError as exc:
        return JSONResponse(
            status_code=429,
            content={
                "error": "quota_exceeded",
                "message": exc.message,
                "queries_used": exc.queries_used,
                "queries_limit": exc.queries_limit,
                "upgrade_url": "/pricing",
            },
        )
