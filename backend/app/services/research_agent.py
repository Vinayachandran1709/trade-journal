import asyncio
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections import defaultdict, deque
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import quote_plus

import httpx
from openai import AsyncOpenAI
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.ai_query_log import AIQueryLog
from app.models.market_data_cache import MarketDataCache
from app.models.user import User
from app.services.trade_processor import clean_stock_symbol
from app.utils.datetime import utcnow_naive

IST = timezone(timedelta(hours=5, minutes=30))
DISCLAIMER = "This is data analysis, not investment advice."

NAME_TO_SYMBOL = {
    "reliance": "RELIANCE",
    "tcs": "TCS",
    "infosys": "INFY",
    "infy": "INFY",
    "hdfc bank": "HDFCBANK",
    "icici bank": "ICICIBANK",
    "sbi": "SBIN",
    "wipro": "WIPRO",
    "hcl tech": "HCLTECH",
    "axis bank": "AXISBANK",
    "kotak": "KOTAKBANK",
    "kotak bank": "KOTAKBANK",
    "bajaj finance": "BAJFINANCE",
    "bajaj finserv": "BAJAJFINSV",
    "titan": "TITAN",
    "sun pharma": "SUNPHARMA",
    "maruti": "MARUTI",
    "vedl": "VEDL",
    "vedanta": "VEDL",
    "tata motors": "TATAMOTORS",
    "tata steel": "TATASTEEL",
    "adani": "ADANIENT",
    "eternal": "ETERNAL",
    "zomato": "ZOMATO",
}

COMMON_SYMBOL_WORDS = {
    "THE",
    "AND",
    "FOR",
    "ARE",
    "NOT",
    "YOU",
    "ALL",
    "CAN",
    "HOW",
    "WHY",
    "WHAT",
    "P",
    "L",
    "PNL",
    "NSE",
    "BSE",
    "IST",
}

COMPARISON_HINTS = ("between", "compare", "stronger", "weaker", "vs", "versus")
PORTFOLIO_HINTS = [
    "my portfolio",
    "still holding",
    "currently holding",
    "what am i holding",
    "my holdings",
    "open position",
    "open positions",
    "open trades",
    "current position",
    "my exposure",
    "portfolio positioned",
]


class QuotaExceededError(Exception):
    def __init__(self, message: str, queries_used: int, queries_limit: int):
        super().__init__(message)
        self.queries_used = queries_used
        self.queries_limit = queries_limit


def _today_ist() -> str:
    return datetime.now(IST).date().isoformat()


def _now_utc() -> datetime:
    return utcnow_naive()


def _today_local_date() -> date:
    return datetime.now(IST).date()


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


def _get_cache_entry(db: Session, cache_key: str) -> dict | None:
    entry = (
        db.query(MarketDataCache)
        .filter(
            MarketDataCache.cache_key == cache_key,
            MarketDataCache.expires_at > _now_utc(),
        )
        .first()
    )
    return entry.payload if entry else None


def _set_cache(
    db: Session,
    cache_key: str,
    symbol: str,
    payload: dict,
    ttl_minutes: int,
) -> None:
    now = _now_utc()
    expires_at = now + timedelta(minutes=ttl_minutes)
    entry = db.query(MarketDataCache).filter(MarketDataCache.cache_key == cache_key).first()
    if entry:
        entry.symbol = symbol
        entry.provider = "openai"
        entry.payload = payload
        entry.fetched_at = now
        entry.expires_at = expires_at
    else:
        db.add(
            MarketDataCache(
                cache_key=cache_key,
                symbol=symbol,
                provider="openai",
                payload=payload,
                fetched_at=now,
                expires_at=expires_at,
            )
        )
    db.commit()


def _count_queries_today(db: Session, user_id: int, query_type: str) -> int:
    now_ist = datetime.now(IST)
    start_ist = datetime.combine(now_ist.date(), datetime.min.time(), tzinfo=IST)
    end_ist = start_ist + timedelta(days=1)
    start_utc = start_ist.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_ist.astimezone(timezone.utc).replace(tzinfo=None)

    return (
        db.query(AIQueryLog)
        .filter(
            AIQueryLog.user_id == user_id,
            AIQueryLog.query_type == query_type,
            AIQueryLog.created_at >= start_utc,
            AIQueryLog.created_at < end_utc,
        )
        .count()
    )


def _log_query(db: Session, *, user_id: int, query_type: str, symbol: str) -> None:
    db.add(AIQueryLog(user_id=user_id, query_type=query_type, symbol=symbol))
    db.commit()


def _json(data) -> str:
    return json.dumps(data, indent=2, default=str)


def _normalize_symbol_token(token: str) -> str:
    return clean_stock_symbol(token.replace("&", "").replace("-", "").replace(" ", ""))


def classify_query(query: str) -> str:
    q = query.lower()

    if any(kw in q for kw in PORTFOLIO_HINTS):
        return "portfolio"

    if any(
        kw in q
        for kw in [
            "my trade",
            "my performance",
            "how did i",
            "my win rate",
            "my mistake",
            "am i improving",
            "my p&l",
            "my loss",
            "my profit",
            "my pattern",
            "my week",
            "my month",
            "how am i doing",
            "my best",
            "my worst",
            "my discipline",
            "my emotion",
        ]
    ):
        return "my_trades"

    if any(
        kw in q
        for kw in [
            "my banking trade",
            "my setup",
            "my conviction",
            "how do my",
            "best setup",
            "am i overtrading",
            "my sector",
            "compare my",
            "my strategy",
            "my edge",
        ]
    ):
        return "strategy_check"

    if any(
        kw in q
        for kw in [
            "market today",
            "should i be aggressive",
            "sector strength",
            "trending or choppy",
            "regime",
            "breadth",
            "vix",
            "fii",
            "dii",
            "market condition",
            "what sector",
            "market sentiment",
        ]
    ):
        return "market_context"

    return "stock_research"


def extract_symbols(query: str) -> list[str]:
    symbols: list[str] = []
    seen: set[str] = set()
    candidates: list[tuple[int, str]] = []

    def push(symbol: str | None):
        if not symbol:
            return
        normalized = _normalize_symbol_token(symbol)
        if (
            not normalized
            or normalized in COMMON_SYMBOL_WORDS
            or len(normalized) < 2
            or normalized in seen
            or len(symbols) >= 3
        ):
            return
        symbols.append(normalized)
        seen.add(normalized)

    for match in re.finditer(r"\b([A-Z][A-Z0-9&.-]{1,19})\b", query):
        candidates.append((match.start(1), match.group(1)))

    q = query.lower()
    for name, symbol in NAME_TO_SYMBOL.items():
        start = q.find(name)
        if start >= 0:
            candidates.append((start, symbol))

    for _, symbol in sorted(candidates, key=lambda item: item[0]):
        push(symbol)

    return symbols


def extract_symbol(query: str) -> str | None:
    return extract_symbols(query)[0] if extract_symbols(query) else None


def _query_has_comparison_language(query: str) -> bool:
    q = query.lower()
    return any(hint in q for hint in COMPARISON_HINTS)


async def ask_research_agent(query: str, user: User, db: Session) -> dict:
    cleaned_query = query.strip()
    if not cleaned_query:
        raise ValueError("Query cannot be empty")

    category = classify_query(cleaned_query)
    context, context_sources = await gather_context(category, cleaned_query, user, db)

    cache_key = (
        f"research:{user.id}:"
        f"{hashlib.md5(cleaned_query.lower().encode()).hexdigest()[:12]}:{_today_ist()}"
    )
    cached = _get_cache_entry(db, cache_key)
    if cached:
        return {**cached, "cached": True}

    queries_used = _count_queries_today(db, user.id, "research")
    limit = 50 if _is_pro_active(user) else 5
    if queries_used >= limit:
        raise QuotaExceededError("Daily research limit reached", queries_used, limit)

    model = "gpt-4o" if _is_pro_active(user) else "gpt-4o-mini"
    system_prompt = (
        "You are IndiaCircle's SEBI-safe behavioral trading research assistant. "
        "Keep responses under 200 words. Structure every answer as: 1. Direct answer 2. Your numbers "
        "3. Pattern / risk note 4. What to review 5. Disclaimer. Use actual user data for personal questions. "
        "List open positions directly for portfolio questions. Compare both stocks side-by-side for comparison questions. "
        "Use phrases like 'Your data shows...' and 'Use this as context, not a trade call.' "
        f"Never give trade calls or advice. End with exactly: {DISCLAIMER}"
    )
    user_message = f"Question: {cleaned_query}\n\nContext:\n{context}"

    response = await call_openai(system_prompt, user_message, model, max_tokens=400)
    response = _ensure_compliant_response(response)
    symbol = extract_symbol(cleaned_query) or "GENERAL"
    _log_query(db, user_id=user.id, query_type="research", symbol=symbol)

    result = {
        "category": category,
        "query": cleaned_query,
        "response": response,
        "context_used": context_sources,
        "queries_remaining": limit - queries_used - 1,
        "queries_limit": limit,
        "cached": False,
        "model_used": model,
    }
    _set_cache(db, cache_key, "RESEARCH", result, ttl_minutes=30)
    return result


async def gather_context(category: str, query: str, user: User, db: Session) -> tuple[str, list[str]]:
    parts: list[str] = []
    sources: list[str] = []

    if category == "portfolio":
        summary = _get_user_summary(user.id, db)
        parts.append(f"Closed Trade Summary:\n{_json(summary)}")
        sources.append("trading_summary")

        open_positions = _get_open_positions(user.id, db)
        if open_positions:
            parts.append(f"Current Open Positions:\n{_json(open_positions)}")
        else:
            parts.append("Current Open Positions:\nNone - all matched trades are closed.")
        sources.append("open_positions")

        recent_trades = _get_recent_completed_trades(user.id, db, limit=10)
        if recent_trades:
            parts.append(f"Recent Completed Trades:\n{_json(recent_trades)}")
            sources.append("recent_completed_trades")

    elif category == "my_trades":
        summary = _get_user_summary(user.id, db)
        parts.append(f"User's Trading Summary:\n{_json(summary)}")
        sources.append("trading_summary")

        patterns = _get_user_patterns(user.id, db)
        if patterns:
            parts.append(f"Detected Behavioral Patterns:\n{_json(patterns)}")
            sources.append("behavioral_patterns")

        recent_trades = _get_recent_completed_trades(user.id, db, limit=20)
        parts.append(f"Recent Completed Trades:\n{_json(recent_trades)}")
        sources.append("recent_completed_trades")

    elif category == "strategy_check":
        summary = _get_user_summary(user.id, db)
        parts.append(f"User's Trading Summary:\n{_json(summary)}")
        sources.append("trading_summary")

        patterns = _get_user_patterns(user.id, db)
        if patterns:
            parts.append(f"Behavioral Patterns:\n{_json(patterns)}")
            sources.append("behavioral_patterns")

        symbol_stats = _get_symbol_level_stats(user.id, db)
        parts.append(f"Performance by Stock:\n{_json(symbol_stats)}")
        sources.append("symbol_level_stats")

    elif category == "market_context":
        from app.services.market_data_service import get_market_dashboard

        market = get_market_dashboard(db, user)
        parts.append(f"Current Market Data:\n{_json(market)}")
        sources.append("market_dashboard")

        patterns = _get_user_patterns(user.id, db)
        if patterns:
            parts.append(f"User's Behavioral Patterns:\n{_json(patterns)}")
            sources.append("behavioral_patterns")

    elif category == "stock_research":
        from app.services.market_data_service import get_market_dashboard, get_ticker_quote

        symbols = extract_symbols(query)
        is_comparison = _query_has_comparison_language(query) and len(symbols) >= 2

        if is_comparison:
            comparison_payload: list[dict] = []
            for symbol in symbols[:3]:
                quote = get_ticker_quote(symbol, db)
                history = _get_user_stock_history(user.id, symbol, db)
                comparison_payload.append(
                    {
                        "symbol": symbol,
                        "quote": quote,
                        "your_history": history or {"message": "No completed trade history"},
                    }
                )
            parts.append(f"Stock Comparison Context:\n{_json(comparison_payload)}")
            sources.extend(["ticker_quote", "user_stock_history"])

            try:
                market = get_market_dashboard(db, user)
                parts.append(f"Current Market Context:\n{_json(market)}")
                sources.append("market_dashboard")
            except Exception:
                pass
        elif symbols:
            symbol = symbols[0]
            quote = get_ticker_quote(symbol, db)
            if quote.get("price") is not None and quote.get("high_52w") is not None and quote.get("low_52w") is not None:
                price = float(quote["price"])
                high = float(quote["high_52w"])
                low = float(quote["low_52w"])
                quote["distance_to_52w_high_pct"] = round(((high - price) / high) * 100, 2) if high else None
                quote["distance_to_52w_low_pct"] = round(((price - low) / low) * 100, 2) if low else None
            else:
                quote["range_note"] = "52-week range was not available from the current quote source."

            parts.append(f"Current Data for {symbol}:\n{_json(quote)}")
            sources.append("ticker_quote")

            news = await _fetch_news_headlines(symbol)
            if news:
                parts.append("Recent News:\n" + "\n".join(f"- {item}" for item in news[:5]))
                sources.append("recent_news")

            user_history = _get_user_stock_history(user.id, symbol, db)
            if user_history:
                parts.append(f"Your Trading History with {symbol}:\n{_json(user_history)}")
                sources.append("user_stock_history")
        else:
            parts.append("No specific stock symbol detected in query.")
            sources.append("symbol_detection")

    return "\n\n---\n\n".join(parts), sources


def _get_user_summary(user_id: int, db: Session) -> dict:
    from app.models.completed_trade import CompletedTrade

    trades = db.query(CompletedTrade).filter(CompletedTrade.user_id == user_id).all()
    if not trades:
        return {"total_trades": 0, "message": "No completed trades yet"}

    total = len(trades)
    wins = sum(1 for trade in trades if float(trade.pnl or 0) > 0)
    total_pnl = sum(float(trade.pnl or 0) for trade in trades)
    avg_pnl = total_pnl / total if total else 0
    best = max(trades, key=lambda trade: float(trade.pnl or 0))
    worst = min(trades, key=lambda trade: float(trade.pnl or 0))

    return {
        "total_trades": total,
        "win_rate": round(wins / total, 2) if total else 0,
        "total_pnl": round(total_pnl, 2),
        "avg_pnl": round(avg_pnl, 2),
        "best_trade": {"symbol": best.stock_symbol, "pnl": float(best.pnl)},
        "worst_trade": {"symbol": worst.stock_symbol, "pnl": float(worst.pnl)},
        "avg_holding_days": round(sum(trade.holding_days or 0 for trade in trades) / total, 1),
    }


def _get_user_patterns(user_id: int, db: Session) -> list[dict]:
    from app.models.behavioral_pattern import BehavioralPattern

    patterns = db.query(BehavioralPattern).filter(BehavioralPattern.user_id == user_id).all()
    return [
        {
            "type": pattern.pattern_type,
            "title": pattern.title,
            "description": pattern.description,
            "severity": pattern.severity,
        }
        for pattern in patterns
    ]


def _get_recent_completed_trades(user_id: int, db: Session, limit: int = 20) -> list[dict]:
    from app.models.completed_trade import CompletedTrade

    trades = (
        db.query(CompletedTrade)
        .filter(CompletedTrade.user_id == user_id)
        .order_by(CompletedTrade.exit_date.desc(), CompletedTrade.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "symbol": trade.stock_symbol,
            "entry_date": str(trade.entry_date),
            "exit_date": str(trade.exit_date),
            "entry_price": float(trade.entry_price),
            "exit_price": float(trade.exit_price),
            "pnl": float(trade.pnl),
            "holding_days": trade.holding_days,
        }
        for trade in trades
    ]


def _get_symbol_level_stats(user_id: int, db: Session) -> list[dict]:
    from app.models.completed_trade import CompletedTrade

    rows = (
        db.query(
            CompletedTrade.stock_symbol,
            func.count(CompletedTrade.id).label("count"),
            func.sum(CompletedTrade.pnl).label("total_pnl"),
        )
        .filter(CompletedTrade.user_id == user_id)
        .group_by(CompletedTrade.stock_symbol)
        .all()
    )
    return [
        {
            "symbol": row.stock_symbol,
            "trades": row.count,
            "total_pnl": float(row.total_pnl or 0),
        }
        for row in rows
    ]


def _get_user_stock_history(user_id: int, symbol: str, db: Session) -> dict | None:
    from app.models.completed_trade import CompletedTrade

    normalized_symbol = clean_stock_symbol(symbol)
    trades = (
        db.query(CompletedTrade)
        .filter(
            CompletedTrade.user_id == user_id,
            func.upper(CompletedTrade.stock_symbol) == normalized_symbol,
        )
        .order_by(CompletedTrade.exit_date.desc(), CompletedTrade.id.desc())
        .all()
    )
    if not trades:
        return None

    wins = sum(1 for trade in trades if float(trade.pnl or 0) > 0)
    total_pnl = sum(float(trade.pnl or 0) for trade in trades)
    entry_prices = [float(trade.entry_price or 0) for trade in trades if trade.entry_price is not None]
    return {
        "total_trades": len(trades),
        "win_rate": round(wins / len(trades), 2),
        "total_pnl": round(total_pnl, 2),
        "last_trade_date": str(trades[0].exit_date),
        "last_pnl": float(trades[0].pnl),
        "avg_holding_days": round(sum(trade.holding_days or 0 for trade in trades) / len(trades), 1),
        "avg_entry_price": round(sum(entry_prices) / len(entry_prices), 2) if entry_prices else None,
        "lowest_entry_price": round(min(entry_prices), 2) if entry_prices else None,
        "highest_entry_price": round(max(entry_prices), 2) if entry_prices else None,
    }


def _get_open_positions(user_id: int, db: Session) -> list[dict]:
    from app.models.trade import Trade

    trades = (
        db.query(Trade)
        .filter(Trade.user_id == user_id)
        .order_by(Trade.trade_date.asc(), Trade.id.asc())
        .all()
    )

    positions: dict[str, deque[dict]] = defaultdict(deque)

    for trade in trades:
        symbol = clean_stock_symbol(trade.stock_symbol)
        qty = int(trade.quantity or 0)
        if qty <= 0:
            continue
        price = Decimal(str(trade.price))

        if trade.trade_type == "BUY":
            positions[symbol].append(
                {
                    "quantity": qty,
                    "price": price,
                    "trade_date": trade.trade_date,
                }
            )
            continue

        if trade.trade_type != "SELL":
            continue

        remaining_sell_qty = qty
        lots = positions[symbol]

        while remaining_sell_qty > 0 and lots:
            lot = lots[0]
            matched_qty = min(lot["quantity"], remaining_sell_qty)
            lot["quantity"] -= matched_qty
            remaining_sell_qty -= matched_qty
            if lot["quantity"] <= 0:
                lots.popleft()

    today = _today_local_date()
    open_positions: list[dict] = []
    for symbol, lots in positions.items():
        if not lots:
            continue
        total_qty = sum(int(lot["quantity"]) for lot in lots)
        if total_qty <= 0:
            continue
        total_cost = sum(Decimal(str(lot["price"])) * int(lot["quantity"]) for lot in lots)
        earliest_date = min(lot["trade_date"] for lot in lots)
        avg_entry_price = total_cost / total_qty if total_qty else Decimal("0")
        holding_days = max((today - earliest_date).days, 0)
        open_positions.append(
            {
                "symbol": symbol,
                "quantity": total_qty,
                "avg_entry_price": round(float(avg_entry_price), 2),
                "entry_date": str(earliest_date),
                "holding_days": holding_days,
            }
        )

    return sorted(open_positions, key=lambda item: (item["entry_date"], item["symbol"]))


async def _fetch_news_headlines(symbol: str) -> list[str]:
    query = quote_plus(f"{symbol} NSE stock when:3d")
    url = f"https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en"
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
        root = ET.fromstring(response.content)
    except Exception:
        return []

    headlines: list[str] = []
    for item in root.findall(".//item")[:10]:
        title = (item.findtext("title") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()
        if title:
            headlines.append(f"{title} ({pub_date})" if pub_date else title)
    return headlines


async def call_openai(system_prompt: str, user_message: str, model: str, max_tokens: int = 400) -> str:
    if not settings.OPENAI_API_KEY:
        return f"AI service is not configured. {DISCLAIMER}"

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=12.0)
    try:
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                max_tokens=max_tokens,
                temperature=0.3,
            ),
            timeout=14.0,
        )
        return response.choices[0].message.content or ""
    except Exception as exc:
        return f"Unable to generate response at this time. Error: {type(exc).__name__}. {DISCLAIMER}"


def _rewrite_for_compliance(text: str) -> str:
    replacements: list[tuple[str, str]] = [
        (r"\byou should\b", "it is worth reviewing"),
        (r"\byou must\b", "it is important to review"),
        (r"\byou need to\b", "it is worth reviewing"),
        (r"\bI recommend\b", "The data suggests"),
        (r"\bwe recommend\b", "The data suggests"),
        (r"\brecommendation\b", "context"),
        (r"\brecommend\b", "highlight"),
        (r"\bguaranteed\b", "not assured"),
        (r"\bsure trade\b", "high-conviction setup"),
        (r"\btarget call\b", "price context"),
        (r"\bsignal\b", "context"),
        (r"\bprediction\b", "scenario"),
    ]

    cleaned = text
    for pattern, replacement in replacements:
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"\bshould enter\b", "may want to review entry conditions", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bshould exit\b", "may want to review exit discipline", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bConsider reviewing reviewing\b", "Reviewing", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bworth reviewing reviewing\b", "worth reviewing", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bit is worth reviewing reviewing\b", "it is worth reviewing", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned.strip()


def _ensure_compliant_response(text: str) -> str:
    cleaned = (text or "").strip()
    cleaned = cleaned.replace(DISCLAIMER, "").strip()
    cleaned = _rewrite_for_compliance(cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

    if not cleaned:
        cleaned = "1. Direct answer: Your data shows limited context for this question.\n2. Your numbers: Not enough current data was available.\n3. Pattern / risk note: This is worth reviewing after more trades are logged.\n4. What to review: Check recent trades and market context together."

    return f"{cleaned}\n\n{DISCLAIMER}"
