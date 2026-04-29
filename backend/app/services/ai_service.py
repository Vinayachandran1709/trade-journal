import asyncio
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from statistics import mean

import httpx
import yfinance as yf
from openai import APITimeoutError, AsyncOpenAI, RateLimitError
from openai import APIConnectionError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.ai_query_log import AIQueryLog
from app.models.market_data_cache import MarketDataCache
from app.models.user import User
from app.services.market_data_service import get_ticker_quote
from app.services.stock_master_service import get_quote_symbol_for_stock_input, resolve_stock_lookup

DISCLAIMER_TEXT = (
    "This is data analysis, not investment advice. "
    "IndiaCircle is not a SEBI-registered advisor."
)
IST = timezone(timedelta(hours=5, minutes=30))
WHY_MOVING_CACHE_TTL = timedelta(minutes=15)
TICKER_INTEL_CACHE_TTL = timedelta(minutes=5)
SIMILAR_PRICE_THRESHOLD = 0.01


class AIQuotaExceededError(Exception):
    def __init__(self, message: str, queries_used: int, queries_limit: int):
        super().__init__(message)
        self.message = message
        self.queries_used = queries_used
        self.queries_limit = queries_limit


class AIServiceNotConfiguredError(Exception):
    pass


class AIServiceBusyError(Exception):
    pass


class AIServiceTimeoutError(Exception):
    pass


def _now_utc() -> datetime:
    return datetime.utcnow()


def _today_ist() -> str:
    return datetime.now(IST).date().isoformat()


def _normalize_symbol(symbol: str) -> str:
    cleaned = symbol.strip().upper()
    if not cleaned:
        return cleaned
    if any(cleaned.endswith(suffix) for suffix in (".NS", ".BO", "=F", "=X")):
        return cleaned
    if cleaned.startswith("^"):
        return cleaned
    return f"{cleaned}.NS"


def _display_symbol(symbol: str) -> str:
    return symbol.replace(".NS", "").replace(".BO", "")


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


def _why_moving_limit_for_user(user: User) -> int:
    if not _is_pro_active(user):
        return 3
    if user.subscription_plan == "pro_annual":
        return 100
    return 50


def _ticker_intel_limit_for_user(user: User | None) -> int | None:
    if user is None:
        return None
    if _is_pro_active(user):
        return None
    return 10


def _why_moving_model_for_user(user: User) -> str:
    return "gpt-4o-mini" if _is_pro_active(user) else "gpt-3.5-turbo"


def _market_cap_bucket(market_cap: int | float | None) -> str | None:
    if market_cap is None:
        return None
    if market_cap >= 200_000_000_000:
        return "Large Cap"
    if market_cap >= 50_000_000_000:
        return "Mid Cap"
    return "Small Cap"


def _volume_vs_average(volume: int | None, avg_volume: int | None) -> str:
    if volume is None or avg_volume in (None, 0):
        return "Volume trend unavailable"

    delta_pct = ((volume - avg_volume) / avg_volume) * 100
    rounded = round(abs(delta_pct))

    if rounded == 0:
        return "At average volume"

    direction = "above" if delta_pct > 0 else "below"
    return f"{rounded}% {direction} average"


def _sentiment_line(change_pct: float | None, volume: int | None, avg_volume: int | None) -> str:
    if change_pct is None or volume is None or avg_volume in (None, 0):
        return "Trading data is limited for this session"

    if change_pct > 2 and volume > avg_volume * 1.5:
        return "Strong buying with above-average volume"
    if change_pct > 2 and volume <= avg_volume:
        return "Price rising on low volume - may lack conviction"
    if change_pct > 2:
        return "Price rising with moderate volume participation"
    if change_pct < -2 and volume > avg_volume * 1.5:
        return "Heavy selling pressure"
    if change_pct < -2 and volume <= avg_volume:
        return "Declining on thin volume"
    if change_pct < -2:
        return "Declining with moderate selling volume"
    return "Trading in a narrow range"


def _get_cache_entry(db: Session, cache_key: str) -> MarketDataCache | None:
    return (
        db.query(MarketDataCache)
        .filter(
            MarketDataCache.cache_key == cache_key,
            MarketDataCache.expires_at > _now_utc(),
        )
        .first()
    )


def _set_cache(
    db: Session,
    *,
    cache_key: str,
    symbol: str,
    payload: dict,
    expires_in: timedelta,
    provider: str,
) -> None:
    now = _now_utc()
    expires_at = now + expires_in
    entry = (
        db.query(MarketDataCache)
        .filter(MarketDataCache.cache_key == cache_key)
        .first()
    )
    if entry:
        entry.payload = payload
        entry.provider = provider
        entry.fetched_at = now
        entry.expires_at = expires_at
    else:
        db.add(
            MarketDataCache(
                cache_key=cache_key,
                symbol=symbol,
                provider=provider,
                payload=payload,
                fetched_at=now,
                expires_at=expires_at,
            )
        )
    db.commit()


def _count_queries_today(db: Session, user_id: int, query_type: str) -> int:
    now_ist = datetime.now(IST)
    day_start_ist = datetime.combine(
        now_ist.date(),
        datetime.min.time(),
        tzinfo=IST,
    )
    day_end_ist = day_start_ist + timedelta(days=1)

    day_start_utc = day_start_ist.astimezone(timezone.utc).replace(tzinfo=None)
    day_end_utc = day_end_ist.astimezone(timezone.utc).replace(tzinfo=None)

    return (
        db.query(AIQueryLog)
        .filter(
            AIQueryLog.user_id == user_id,
            AIQueryLog.query_type == query_type,
            AIQueryLog.created_at >= day_start_utc,
            AIQueryLog.created_at < day_end_utc,
        )
        .count()
    )


def _log_query(db: Session, *, user_id: int, query_type: str, symbol: str) -> None:
    db.add(
        AIQueryLog(
            user_id=user_id,
            query_type=query_type,
            symbol=symbol,
        )
    )
    db.commit()


def _clean_explanation(text: str, symbol: str, change_pct: float | None, sources: list[str]) -> str:
    cleaned = (text or "").strip()
    cleaned = cleaned.replace(DISCLAIMER_TEXT, "").replace(
        "This is data analysis, not investment advice.",
        "",
    ).strip()

    lowered = cleaned.lower()
    banned_phrases = [
        "you should buy",
        "you should sell",
        "good investment",
        "we recommend",
        "i recommend",
    ]
    if not cleaned or any(phrase in lowered for phrase in banned_phrases):
        move_text = (
            f"{abs(change_pct):.2f}%"
            if change_pct is not None
            else "notably"
        )
        direction = "up" if (change_pct or 0) > 0 else "down" if (change_pct or 0) < 0 else "flat"
        catalyst = (
            f"Recent headlines include {sources[0]}."
            if sources
            else "No specific catalyst identified from the latest sampled headlines."
        )
        cleaned = (
            f"Market data shows {symbol} moved {move_text} {direction} today. "
            f"{catalyst} Public price and volume data indicate traders were reacting "
            f"to available market updates rather than a confirmed recommendation."
        )

    return f"{cleaned}\n\n{DISCLAIMER_TEXT}"


def _is_similar_price(current_price: float | None, cached_price: float | None) -> bool:
    if current_price is None or cached_price is None:
        return True
    if cached_price == 0:
        return False
    return abs(current_price - cached_price) / cached_price <= SIMILAR_PRICE_THRESHOLD


async def _fetch_price_history(symbol: str) -> list[dict]:
    def load_history() -> list[dict]:
        try:
            history = yf.Ticker(symbol).history(period="5d", interval="1d", auto_adjust=True)
        except Exception:
            return []

        if history.empty:
            return []

        rows: list[dict] = []
        for timestamp, row in history.tail(5).iterrows():
            rows.append(
                {
                    "date": timestamp.strftime("%Y-%m-%d"),
                    "close": round(float(row.get("Close", 0.0)), 2),
                    "volume": int(row.get("Volume", 0) or 0),
                }
            )
        return rows

    return await asyncio.to_thread(load_history)


async def _fetch_news_headlines(symbol: str) -> list[str]:
    url = (
        "https://news.google.com/rss/search"
        f"?q={_display_symbol(symbol)}+NSE+stock&hl=en-IN&gl=IN&ceid=IN:en"
    )

    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
    except Exception:
        return []

    try:
        root = ET.fromstring(response.content)
    except ET.ParseError:
        return []

    items = root.findall(".//item")
    headlines: list[str] = []

    for item in items[:3]:
        title = (item.findtext("title") or "").strip()
        source = (item.findtext("source") or "").strip()

        if not source and " - " in title:
            headline, guessed_source = title.rsplit(" - ", 1)
            title = headline.strip()
            source = guessed_source.strip()

        if title:
            headlines.append(f"{source}: {title}" if source else title)

    return headlines


async def _call_openai(
    *,
    symbol: str,
    change_pct: float | None,
    price: float | None,
    volume: int | None,
    history: list[dict],
    headlines: list[str],
    model: str,
) -> str:
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=10.0)
    move_text = f"{change_pct:.2f}" if change_pct is not None else "unknown"

    system_prompt = f"""
You are a stock market analyst explaining price movements for Indian NSE/BSE stocks.
Given the market data and news context below, explain in 2-3 concise sentences why
{_display_symbol(symbol)} moved {move_text}% today.

Rules:
- Be specific and factual. Cite the news or data that caused the move.
- If no clear catalyst, say "No specific catalyst identified" and mention the sector or market trend.
- NEVER recommend buying or selling.
- NEVER say "you should" or "I recommend" or "good investment" or "we recommend".
- Use only neutral phrasing such as "data shows", "market data indicates", or "public filings state".
- Keep it under 100 words.
- End every response with exactly this line on a new paragraph:
"{DISCLAIMER_TEXT}"
""".strip()

    user_message = (
        f"Symbol: {_display_symbol(symbol)}\n"
        f"Current price: {price}\n"
        f"Today's change %: {change_pct}\n"
        f"Volume: {volume}\n"
        f"Last 5 sessions: {history}\n"
        f"Recent news headlines: {headlines or ['No recent headlines fetched']}"
    )

    try:
        response = await client.chat.completions.create(
            model=model,
            temperature=0.3,
            max_tokens=500,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        )
    except APITimeoutError as exc:
        raise AIServiceTimeoutError("AI service timeout") from exc
    except RateLimitError as exc:
        raise AIServiceBusyError("AI service temporarily busy, try again in a moment") from exc
    except APIConnectionError as exc:
        raise AIServiceBusyError("AI service temporarily busy, try again in a moment") from exc
    except Exception as exc:
        raise AIServiceBusyError("AI service temporarily busy, try again in a moment") from exc

    return response.choices[0].message.content or ""


async def why_is_it_moving(symbol: str, user: User, db: Session) -> dict:
    quote_symbol, resolved_stock = get_quote_symbol_for_stock_input(symbol, db)
    normalized_symbol = _normalize_symbol(quote_symbol)
    display_symbol = resolved_stock.nse_symbol if resolved_stock and resolved_stock.nse_symbol else _display_symbol(normalized_symbol)
    model = _why_moving_model_for_user(user)
    queries_limit = _why_moving_limit_for_user(user)
    queries_used = _count_queries_today(db, user.id, "why_moving")
    quote = get_ticker_quote(normalized_symbol, db)
    cache_key = f"why_moving:{display_symbol}:{_today_ist()}"
    cache_entry = _get_cache_entry(db, cache_key)

    if cache_entry:
        payload = cache_entry.payload or {}
        if _is_similar_price(quote.get("price"), payload.get("reference_price")):
            response_price = quote.get("price")
            response_change_pct = quote.get("change_pct")
            return {
                "symbol": display_symbol,
                "explanation": payload.get("explanation", f"{DISCLAIMER_TEXT}"),
                "price": response_price if response_price is not None else payload.get("price"),
                "change_pct": (
                    response_change_pct
                    if response_change_pct is not None
                    else payload.get("change_pct")
                ),
                "sources": payload.get("sources", []),
                "model_used": payload.get("model_used", model),
                "queries_remaining": max(queries_limit - queries_used, 0),
                "queries_limit": queries_limit,
                "cached": True,
                "disclaimer": DISCLAIMER_TEXT,
            }

    if queries_used >= queries_limit:
        raise AIQuotaExceededError(
            "Daily limit reached for Why Is It Moving?",
            queries_used=queries_used,
            queries_limit=queries_limit,
        )

    if not settings.OPENAI_API_KEY:
        raise AIServiceNotConfiguredError("AI service not configured")

    history, headlines = await asyncio.gather(
        _fetch_price_history(normalized_symbol),
        _fetch_news_headlines(normalized_symbol),
    )

    explanation = await _call_openai(
        symbol=normalized_symbol,
        change_pct=quote.get("change_pct"),
        price=quote.get("price"),
        volume=quote.get("volume"),
        history=history,
        headlines=headlines,
        model=model,
    )
    cleaned_explanation = _clean_explanation(
        explanation,
        display_symbol,
        quote.get("change_pct"),
        headlines,
    )

    payload = {
        "symbol": display_symbol,
        "explanation": cleaned_explanation,
        "price": quote.get("price"),
        "change_pct": quote.get("change_pct"),
        "sources": headlines,
        "model_used": model,
        "reference_price": quote.get("price"),
        "disclaimer": DISCLAIMER_TEXT,
    }

    _set_cache(
        db,
        cache_key=cache_key,
        symbol=display_symbol,
        payload=payload,
        expires_in=WHY_MOVING_CACHE_TTL,
        provider="openai",
    )
    _log_query(db, user_id=user.id, query_type="why_moving", symbol=display_symbol)

    return {
        "symbol": display_symbol,
        "explanation": cleaned_explanation,
        "price": quote.get("price"),
        "change_pct": quote.get("change_pct"),
        "sources": headlines,
        "model_used": model,
        "queries_remaining": max(queries_limit - (queries_used + 1), 0),
        "queries_limit": queries_limit,
        "cached": False,
        "disclaimer": DISCLAIMER_TEXT,
    }


def get_ticker_intelligence(symbol: str, db: Session, user: User | None = None) -> dict:
    quote_symbol, resolved_stock = get_quote_symbol_for_stock_input(symbol, db)
    normalized_symbol = _normalize_symbol(quote_symbol)
    if resolved_stock and resolved_stock.nse_symbol:
        display_symbol = resolved_stock.nse_symbol
    elif resolved_stock and resolved_stock.bse_code:
        display_symbol = f"BSE:{resolved_stock.bse_code}"
    else:
        display_symbol = _display_symbol(normalized_symbol)
    cache_key = f"ticker_intel:{display_symbol}"
    cache_entry = _get_cache_entry(db, cache_key)

    if cache_entry:
        return cache_entry.payload

    queries_limit = _ticker_intel_limit_for_user(user)
    queries_used = (
        _count_queries_today(db, user.id, "ticker_intel")
        if user is not None and queries_limit is not None
        else 0
    )

    if queries_limit is not None and queries_used >= queries_limit:
        raise AIQuotaExceededError(
            "Daily limit reached for ticker intelligence.",
            queries_used=queries_used,
            queries_limit=queries_limit,
        )

    ticker = yf.Ticker(normalized_symbol)
    try:
        info = ticker.info or {}
    except Exception:
        info = {}

    try:
        history = ticker.history(period="1mo", interval="1d", auto_adjust=True)
    except Exception:
        history = None

    quote = get_ticker_quote(normalized_symbol, db)

    volume = quote.get("volume")
    if volume is None and history is not None and not history.empty:
        latest_volume = history["Volume"].dropna()
        if not latest_volume.empty:
            volume = int(latest_volume.iloc[-1])

    avg_volume: int | None = None
    if history is not None and not history.empty and "Volume" in history:
        volumes = [int(v) for v in history["Volume"].dropna().tail(20).tolist() if v is not None]
        if volumes:
            avg_volume = int(round(mean(volumes)))

    payload = {
        "symbol": display_symbol,
        "company_name": resolved_stock.display_name if resolved_stock else None,
        "exchange": (
            "NSE"
            if resolved_stock and resolved_stock.nse_symbol
            else "BSE"
            if resolved_stock and resolved_stock.bse_code
            else ("BSE" if normalized_symbol.endswith(".BO") else "NSE")
        ),
        "price": quote.get("price"),
        "change": quote.get("change"),
        "change_pct": quote.get("change_pct"),
        "high_52w": quote.get("high_52w") or info.get("fiftyTwoWeekHigh"),
        "low_52w": quote.get("low_52w") or info.get("fiftyTwoWeekLow"),
        "volume": volume,
        "avg_volume": avg_volume,
        "volume_vs_avg": _volume_vs_average(volume, avg_volume),
        "sector": info.get("sector"),
        "market_cap": _market_cap_bucket(info.get("marketCap")),
        "next_event": None,
        "sentiment_line": _sentiment_line(quote.get("change_pct"), volume, avg_volume),
        "disclaimer": DISCLAIMER_TEXT,
    }

    _set_cache(
        db,
        cache_key=cache_key,
        symbol=display_symbol,
        payload=payload,
        expires_in=TICKER_INTEL_CACHE_TTL,
        provider="yfinance",
    )

    if user is not None and queries_limit is not None:
        _log_query(db, user_id=user.id, query_type="ticker_intel", symbol=display_symbol)

    return payload
