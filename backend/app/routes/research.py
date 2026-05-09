import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.market_data_service import get_market_dashboard
from app.services.research_agent import (
    QuotaExceededError,
    _get_cache_entry,
    _get_user_patterns,
    _get_user_summary,
    _set_cache,
    _today_ist,
    _ensure_compliant_response,
    ask_research_agent,
    call_openai,
)
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/research", tags=["research"])


class AskRequest(BaseModel):
    query: str


class AskResponse(BaseModel):
    category: str
    query: str
    response: str
    context_used: list[str]
    queries_remaining: int
    queries_limit: int
    cached: bool
    model_used: str


@router.post("/ask", response_model=AskResponse)
async def ask(
    request: AskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = await ask_research_agent(request.query, current_user, db)
        return AskResponse(**result)
    except QuotaExceededError as exc:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "quota_exceeded",
                "message": str(exc),
                "queries_used": exc.queries_used,
                "queries_limit": exc.queries_limit,
            },
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Research agent error: {str(exc)}") from exc


@router.get("/suggestions")
def get_suggestions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.completed_trade import CompletedTrade

    rows = (
        db.query(CompletedTrade.stock_symbol)
        .filter(CompletedTrade.user_id == current_user.id)
        .distinct()
        .limit(5)
        .all()
    )
    symbols = [row[0] for row in rows]

    return {
        "my_trades": [
            "How did I do this week?",
            "What's my biggest mistake pattern?",
            "Am I improving as a trader?",
            "What's my win rate this month?",
        ],
        "stock_research": [f"Why is {symbol} moving?" for symbol in symbols[:3]]
        if symbols
        else [
            "Why is TCS moving?",
            "What are the key levels for HDFCBANK?",
        ],
        "market_context": [
            "Should I be aggressive today?",
            "What sectors are showing strength?",
            "Is the market trending or choppy?",
        ],
        "strategy_check": [
            f"How do my {symbols[0]} trades perform?" if symbols else "What's my best setup type?",
            "Am I overtrading compared to last month?",
            "Which sector gives me the best returns?",
        ],
    }


@router.get("/daily-brief")
async def daily_brief(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cache_key = f"daily_brief:{current_user.id}:{_today_ist()}"
    cached = _get_cache_entry(db, cache_key)
    if cached:
        return {**cached, "cached": True}

    summary = _get_user_summary(current_user.id, db)
    patterns = _get_user_patterns(current_user.id, db)
    market = get_market_dashboard(db, current_user)
    brief_context = f"""
User Trading Summary: {json.dumps(summary, default=str)}
Behavioral Patterns: {json.dumps(patterns, default=str)}
Current Market: Nifty {market.get('indices', {}).get('nifty_50', {}).get('change_pct', 0)}%,
VIX {market.get('vix', {}).get('value', 'N/A')},
Market Status: {market.get('market_status', 'unknown')},
Confidence: {market.get('confidence', {})}
""".strip()

    system_prompt = """
Generate a personalized 4-sentence morning trading brief for an Indian stock trader.

Structure:
Line 1: Market conditions today using trend, breadth, and key sectors when available.
Line 2: How this connects to the trader's historical performance patterns.
Line 3: Risk factor to watch today based on their behavioral patterns.
Line 4: One actionable focus area for the day.

Keep it under 100 words. Be specific. Use the trader's actual data.
Do not use the words "buy", "sell", or "recommended".
End with "This is data analysis, not investment advice."
""".strip()

    response = await call_openai(system_prompt, brief_context, "gpt-4o-mini", max_tokens=200)
    response = _ensure_compliant_response(response)
    result = {
        "brief": response,
        "date": _today_ist(),
        "market_status": market.get("market_status", "unknown"),
        "confidence_score": market.get("confidence", {}).get("score"),
        "cached": False,
    }
    _set_cache(db, cache_key, "DAILY_BRIEF", result, ttl_minutes=120)
    return result
