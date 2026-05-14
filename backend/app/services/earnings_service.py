import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from app.models.market_data_cache import MarketDataCache
from app.utils.datetime import utcnow_naive


def _get_cache_entry(db: Session, cache_key: str) -> dict | None:
    entry = (
        db.query(MarketDataCache)
        .filter(
            MarketDataCache.cache_key == cache_key,
            MarketDataCache.expires_at > utcnow_naive(),
        )
        .first()
    )
    return entry.payload if entry else None


def _set_cache(db: Session, cache_key: str, symbol: str, payload: dict, ttl_minutes: int) -> None:
    now = utcnow_naive()
    expires_at = now + timedelta(minutes=ttl_minutes)
    entry = db.query(MarketDataCache).filter(MarketDataCache.cache_key == cache_key).first()
    if entry:
        entry.symbol = symbol
        entry.provider = "news"
        entry.payload = payload
        entry.fetched_at = now
        entry.expires_at = expires_at
    else:
        db.add(
            MarketDataCache(
                cache_key=cache_key,
                symbol=symbol,
                provider="news",
                payload=payload,
                fetched_at=now,
                expires_at=expires_at,
            )
        )
    db.commit()


async def get_upcoming_earnings(db: Session, user_id: int | None = None) -> dict:
    """Get upcoming earnings and mark events relevant to the user's history."""
    cache_key = f"earnings_calendar:{utcnow_naive().strftime('%Y-%m-%d')}"
    cached = _get_cache_entry(db, cache_key)
    if cached:
        earnings = cached
    else:
        earnings = await _fetch_earnings_calendar()
        _set_cache(db, cache_key, "EARNINGS", earnings, ttl_minutes=360)

    result = {
        **earnings,
        "upcoming": [dict(item) for item in earnings.get("upcoming", [])],
    }

    if user_id:
        from app.models.completed_trade import CompletedTrade

        rows = (
            db.query(CompletedTrade.stock_symbol)
            .filter(CompletedTrade.user_id == user_id)
            .distinct()
            .all()
        )
        user_symbols = {row[0] for row in rows}

        for event in result.get("upcoming", []):
            symbol = event.get("symbol")
            event["relevant_to_user"] = symbol in user_symbols
            event["user_traded"] = symbol in user_symbols

        result["upcoming"].sort(
            key=lambda item: (
                not item.get("relevant_to_user", False),
                item.get("date", ""),
            )
        )

    return result


async def _fetch_earnings_calendar() -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(
                "https://news.google.com/rss/search",
                params={
                    "q": "quarterly results board meeting NSE BSE 2026",
                    "hl": "en-IN",
                    "gl": "IN",
                    "ceid": "IN:en",
                },
            )
            response.raise_for_status()

        root = ET.fromstring(response.content)
        upcoming: list[dict] = []
        for item in root.findall(".//item")[:20]:
            title = item.findtext("title", "")
            pub_date = item.findtext("pubDate", "")
            link = item.findtext("link", "")
            if any(
                keyword in title.lower()
                for keyword in ["result", "earnings", "q4", "q3", "q2", "q1", "board meeting"]
            ):
                upcoming.append(
                    {
                        "title": title[:120],
                        "date": pub_date,
                        "link": link,
                        "symbol": _extract_symbol_from_title(title),
                        "event_type": "earnings",
                    }
                )
        return {
            "upcoming": upcoming,
            "source": "news",
            "fetched_at": utcnow_naive().isoformat(),
        }
    except Exception:
        return {
            "upcoming": [],
            "source": "unavailable",
            "fetched_at": utcnow_naive().isoformat(),
        }


def _extract_symbol_from_title(title: str) -> str | None:
    import re

    name_to_symbol = {
        "reliance": "RELIANCE",
        "tcs": "TCS",
        "infosys": "INFY",
        "hdfc bank": "HDFCBANK",
        "icici bank": "ICICIBANK",
        "sbi": "SBIN",
        "wipro": "WIPRO",
        "hcl tech": "HCLTECH",
        "axis bank": "AXISBANK",
        "bajaj finance": "BAJFINANCE",
        "titan": "TITAN",
        "sun pharma": "SUNPHARMA",
        "maruti": "MARUTI",
        "tata motors": "TATAMOTORS",
        "adani": "ADANIENT",
        "kotak": "KOTAKBANK",
        "bharti airtel": "BHARTIARTL",
        "itc": "ITC",
        "hindustan unilever": "HINDUNILVR",
        "nestle": "NESTLEIND",
    }
    lower_title = title.lower()
    for name, symbol in name_to_symbol.items():
        if name in lower_title:
            return symbol

    caps = re.findall(r"\b([A-Z]{2,15})\b", title)
    common = {"THE", "AND", "FOR", "ARE", "PAT", "YOY", "QOQ", "FY26", "FY25", "Q4", "Q3", "Q2", "Q1"}
    for symbol in caps:
        if symbol not in common:
            return symbol
    return None
