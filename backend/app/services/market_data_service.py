"""Market data service — yfinance + DB cache.

TTL: 60 s during Indian market hours (9:15–15:30 IST Mon–Fri), 300 s otherwise.
On any yfinance failure the last cached payload is returned with is_stale=True.
"""
import logging
import math
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from datetime import date, datetime, timedelta, timezone

import yfinance as yf
from sqlalchemy.orm import Session

from app.models.market_data_cache import MarketDataCache
from app.models.trade import Trade
from app.models.user import User
from app.services.stock_master_service import get_quote_symbol_for_stock_input

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Timezone helpers (IST = UTC+5:30; India has no DST)
# ---------------------------------------------------------------------------
_IST = timezone(timedelta(hours=5, minutes=30))


def _now_ist() -> datetime:
    return datetime.now(_IST)


def _now_ist_str() -> str:
    return _now_ist().isoformat()


# ---------------------------------------------------------------------------
# Market hours
# ---------------------------------------------------------------------------
def _market_status() -> str:
    """Return 'open', 'pre_open', or 'closed'."""
    now = _now_ist()
    if now.weekday() >= 5:          # Saturday / Sunday
        return "closed"
    t = (now.hour, now.minute)
    if t < (9, 0):
        return "closed"
    if t < (9, 15):
        return "pre_open"
    if t <= (15, 30):
        return "open"
    return "closed"


def _cache_ttl() -> int:
    return 60 if _market_status() == "open" else 300


# ---------------------------------------------------------------------------
# Ticker / symbol constants
# ---------------------------------------------------------------------------
_INDICES_MAP: dict[str, str] = {
    "^NSEI":    "nifty_50",
    "^NSEBANK": "bank_nifty",
    "^CNXIT":   "nifty_it",
}
_VIX_SYMBOL = "^INDIAVIX"

_GLOBAL_MAP: dict[str, str] = {
    "ES=F":    "sp500_futures",
    "NQ=F":    "nasdaq_futures",
    "CL=F":    "crude_oil",
    "GC=F":    "gold",
    "USDINR=X": "usd_inr",
}

_SECTOR_INDEX_MAP: dict[str, tuple[str, str]] = {
    "Banking": ("^NSEBANK", "NIFTY BANK"),
    "IT": ("^CNXIT", "NIFTY IT"),
    "Pharma": ("^CNXPHARMA", "NIFTY PHARMA"),
    "Auto": ("^CNXAUTO", "NIFTY AUTO"),
    "Energy": ("^CNXENERGY", "NIFTY ENERGY"),
    "Metals": ("^CNXMETAL", "NIFTY METAL"),
    "Realty": ("^CNXREALTY", "NIFTY REALTY"),
    "FMCG": ("^CNXFMCG", "NIFTY FMCG"),
    "PSU Bank": ("^CNXPSUBANK", "NIFTY PSU BANK"),
}

_PREFERENCE_SECTOR_ALIASES = {
    "banking": "Banking",
    "it": "IT",
    "pharma": "Pharma",
    "auto": "Auto",
    "energy": "Energy",
    "fmcg": "FMCG",
    "metals": "Metals",
    "metal": "Metals",
    "realty": "Realty",
    "psu bank": "PSU Bank",
}

NIFTY_50_STOCKS: list[str] = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "HINDUNILVR.NS", "ITC.NS", "SBIN.NS", "BHARTIARTL.NS", "KOTAKBANK.NS",
    "LT.NS", "HCLTECH.NS", "AXISBANK.NS", "ASIANPAINT.NS", "MARUTI.NS",
    "SUNPHARMA.NS", "TITAN.NS", "BAJFINANCE.NS", "WIPRO.NS", "ULTRACEMCO.NS",
]

# ---------------------------------------------------------------------------
# Thread pools
# Two separate pools to avoid nested-submission deadlocks.
# _outer: one slot per concurrent API request (wraps _build_dashboard).
# _inner: parallel yfinance fast_info calls.
# ---------------------------------------------------------------------------
_FETCH_TIMEOUT = 9          # seconds for a full dashboard build
_QUOTE_TIMEOUT = 7

_outer_pool = ThreadPoolExecutor(max_workers=4,  thread_name_prefix="mkt_outer")
_inner_pool = ThreadPoolExecutor(max_workers=20, thread_name_prefix="mkt_inner")

# Serialize concurrent dashboard builds so we don't fire 10 yfinance batches at once.
_build_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------
def _safe_float(val) -> float | None:
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


def _classify_vix(value: float | None) -> str:
    if value is None:
        return "Unknown"
    if value < 15:
        return "Low"
    if value < 20:
        return "Moderate"
    if value < 25:
        return "Elevated"
    return "High"


# ---------------------------------------------------------------------------
# Database cache helpers
# ---------------------------------------------------------------------------
def _cache_get(db: Session, key: str) -> dict | None:
    """Return payload only if cache entry exists and has not expired."""
    entry = (
        db.query(MarketDataCache)
        .filter(
            MarketDataCache.cache_key == key,
            MarketDataCache.expires_at > datetime.utcnow(),
        )
        .first()
    )
    return entry.payload if entry else None


def _cache_get_stale(db: Session, key: str) -> dict | None:
    """Return payload regardless of expiry (stale fallback)."""
    entry = (
        db.query(MarketDataCache)
        .filter(MarketDataCache.cache_key == key)
        .first()
    )
    return entry.payload if entry else None


def _cache_set(db: Session, key: str, symbol: str, payload: dict) -> None:
    now = datetime.utcnow()
    expires = now + timedelta(seconds=_cache_ttl())
    entry = (
        db.query(MarketDataCache)
        .filter(MarketDataCache.cache_key == key)
        .first()
    )
    if entry:
        entry.payload = payload
        entry.fetched_at = now
        entry.expires_at = expires
    else:
        db.add(MarketDataCache(
            cache_key=key,
            symbol=symbol,
            provider="yfinance",
            payload=payload,
            fetched_at=now,
            expires_at=expires,
        ))
    db.commit()


# ---------------------------------------------------------------------------
# yfinance fetch helpers (all run inside _inner_pool threads)
# ---------------------------------------------------------------------------
def _fetch_ticker_info(symbol: str) -> dict | None:
    """Fetch price + change for one ticker via fast_info."""
    try:
        fi = yf.Ticker(symbol).fast_info
        last = _safe_float(getattr(fi, "last_price", None))
        prev = _safe_float(getattr(fi, "previous_close", None))
        if last is None:
            return None
        effective_prev = prev if (prev and prev != 0) else last
        change = last - effective_prev
        change_pct = (change / effective_prev * 100) if effective_prev else 0.0
        return {
            "value": round(last, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
        }
    except Exception as exc:
        logger.debug("fast_info failed for %s: %s", symbol, exc)
        return None


def _fetch_all_parallel(symbol_map: dict[str, str]) -> dict[str, dict | None]:
    """Run _fetch_ticker_info for every symbol concurrently via _inner_pool."""
    futures = {
        name: _inner_pool.submit(_fetch_ticker_info, sym)
        for sym, name in symbol_map.items()
    }
    result: dict[str, dict | None] = {}
    for name, fut in futures.items():
        try:
            result[name] = fut.result(timeout=8)
        except Exception as exc:
            logger.debug("Parallel fetch failed for %s: %s", name, exc)
            result[name] = None
    return result


def _fetch_nifty50_movers() -> tuple[list[dict], list[dict], dict[str, int]]:
    """Batch-download 20 Nifty50 stocks, return top-5 gainers/losers and breadth."""
    try:
        data = yf.download(
            tickers=NIFTY_50_STOCKS,
            period="5d",
            interval="1d",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
        if data.empty:
            return [], [], {"advancing": 0, "declining": 0, "pct_advancing": 0}

        close = data["Close"]   # DataFrame: index=date, columns=symbols

        stocks: list[dict] = []
        for sym in NIFTY_50_STOCKS:
            try:
                series = close[sym].dropna() if sym in close.columns else None
                if series is None or len(series) < 2:
                    continue
                curr = _safe_float(series.iloc[-1])
                prev = _safe_float(series.iloc[-2])
                if curr is None or prev is None or prev == 0:
                    continue
                stocks.append({
                    "symbol": sym.replace(".NS", ""),
                    "price": round(curr, 2),
                    "change_pct": round((curr - prev) / prev * 100, 2),
                })
            except Exception:
                continue

        stocks.sort(key=lambda x: x["change_pct"], reverse=True)
        gainers = stocks[:5]
        losers = list(reversed(stocks[-5:])) if len(stocks) >= 5 else []
        advancing = sum(1 for stock in stocks if stock["change_pct"] > 0)
        declining = sum(1 for stock in stocks if stock["change_pct"] < 0)
        total = advancing + declining
        breadth = {
            "advancing": advancing,
            "declining": declining,
            "pct_advancing": round((advancing / total) * 100) if total else 0,
        }
        return gainers, losers, breadth

    except Exception as exc:
        logger.warning("Nifty50 batch download failed: %s", exc)
        return [], [], {"advancing": 0, "declining": 0, "pct_advancing": 0}


def _fetch_nifty_vwap_status() -> str:
    try:
        data = yf.download(
            tickers="^NSEI",
            period="1d",
            interval="5m",
            auto_adjust=True,
            progress=False,
            threads=False,
        )
        if data.empty or "Close" not in data or "Volume" not in data:
            return "At VWAP"

        closes = data["Close"].dropna()
        volumes = data["Volume"].fillna(0)
        if closes.empty or volumes.sum() == 0:
            return "At VWAP"

        latest_close = _safe_float(closes.iloc[-1])
        vwap = _safe_float((closes * volumes).sum() / volumes.sum())
        if latest_close is None or vwap is None:
            return "At VWAP"

        if latest_close > vwap * 1.001:
            return "Above VWAP"
        if latest_close < vwap * 0.999:
            return "Below VWAP"
        return "At VWAP"
    except Exception as exc:
        logger.debug("VWAP fetch failed: %s", exc)
        return "At VWAP"


def _trend_from_change(change_pct: float | None) -> str:
    if change_pct is None:
        return "Sideways"
    if change_pct > 0.5:
        return "Bullish"
    if change_pct < -0.5:
        return "Bearish"
    return "Sideways"


def _build_regime(indices: dict, vix_context: str, breadth: dict[str, int], nifty_vs_vwap: str) -> dict:
    nifty_change = (indices.get("nifty_50") or {}).get("change_pct")
    trend = _trend_from_change(nifty_change)
    breadth_pct = breadth.get("pct_advancing", 0)

    if trend == "Bullish":
        base = "Market is moderately bullish."
    elif trend == "Bearish":
        base = "Market is under pressure."
    else:
        base = "Market is range-bound."

    if nifty_vs_vwap == "Above VWAP":
        level_line = "Nifty above key intraday levels."
    elif nifty_vs_vwap == "Below VWAP":
        level_line = "Nifty trading below intraday support."
    else:
        level_line = "Nifty is hovering near VWAP."

    if breadth_pct >= 55:
        breadth_line = f"Breadth positive with {breadth_pct}% stocks advancing."
    elif breadth_pct <= 45:
        breadth_line = f"Breadth weak with only {breadth_pct}% stocks advancing."
    else:
        breadth_line = f"Breadth balanced with {breadth_pct}% stocks advancing."

    vix_line = {
        "Low": "Volatility remains calm.",
        "Moderate": "Volatility is manageable.",
        "Elevated": "Volatility is elevated.",
        "High": "Volatility is high.",
    }.get(vix_context, "Volatility signal is mixed.")

    return {
        "nifty_trend": trend,
        "nifty_vs_vwap": nifty_vs_vwap,
        "breadth": breadth,
        "interpretation": f"{base} {level_line} {breadth_line} {vix_line}",
    }


def _normalize_preferred_sectors(user: User | None) -> list[str]:
    raw = ((user.preferences or {}).get("sectors") if user else None) or []
    normalized: list[str] = []
    seen: set[str] = set()
    for sector in raw:
        canonical = _PREFERENCE_SECTOR_ALIASES.get(str(sector).strip().lower())
        if canonical and canonical not in seen:
            normalized.append(canonical)
            seen.add(canonical)
    return normalized


def _fetch_sector_performance_payload() -> dict[str, dict]:
    symbol_map = {ticker: sector for sector, (ticker, _) in _SECTOR_INDEX_MAP.items()}
    ticker_data = _fetch_all_parallel(symbol_map)
    payload: dict[str, dict] = {}
    for sector, (_, index_name) in _SECTOR_INDEX_MAP.items():
        sector_data = ticker_data.get(sector)
        if not sector_data:
            continue
        payload[sector] = {
            "index": index_name,
            "value": sector_data.get("value"),
            "change_pct": sector_data.get("change_pct"),
        }
    return payload


def get_sector_performance(db: Session) -> dict[str, dict]:
    cache_key = "sector_performance_v1"
    fresh = _cache_get(db, cache_key)
    if fresh is not None:
        return fresh

    try:
        future = _inner_pool.submit(_fetch_sector_performance_payload)
        payload = future.result(timeout=8)
    except Exception as exc:
        logger.warning("Sector performance fetch failed: %s", exc)
        stale = _cache_get_stale(db, cache_key)
        return stale or {}

    _cache_set(db, cache_key, "sector_performance", payload)
    return payload


def _recent_unique_symbols(user_id: int, db: Session, limit: int = 10) -> list[str]:
    trades = (
        db.query(Trade)
        .filter(Trade.user_id == user_id)
        .order_by(Trade.trade_date.desc(), Trade.created_at.desc(), Trade.id.desc())
        .all()
    )
    symbols: list[str] = []
    seen: set[str] = set()
    for trade in trades:
        symbol = (trade.stock_symbol or "").upper().strip()
        if not symbol or symbol in seen:
            continue
        symbols.append(symbol)
        seen.add(symbol)
        if len(symbols) >= limit:
            break
    return symbols


def _open_positions_context(user_id: int, db: Session) -> list[dict]:
    trades = (
        db.query(Trade)
        .filter(Trade.user_id == user_id)
        .order_by(Trade.trade_date.desc(), Trade.created_at.desc(), Trade.id.desc())
        .all()
    )
    positions: dict[str, dict] = {}
    for trade in reversed(trades):
        symbol = (trade.stock_symbol or "").upper().strip()
        if not symbol:
            continue
        current = positions.setdefault(
            symbol,
            {
                "symbol": symbol,
                "net_quantity": 0,
                "last_trade_date": None,
            },
        )
        qty = int(trade.quantity or 0)
        current["net_quantity"] += qty if (trade.trade_type or "").upper() == "BUY" else -qty
        current["last_trade_date"] = trade.trade_date.isoformat() if isinstance(trade.trade_date, date) else None

    return [
        position
        for position in sorted(
            positions.values(),
            key=lambda item: item.get("last_trade_date") or "",
            reverse=True,
        )
        if int(position.get("net_quantity") or 0) > 0
    ][:10]


def _recent_stock_quotes(symbols: list[str], db: Session) -> list[dict]:
    quotes: list[dict] = []
    for symbol in symbols[:10]:
        try:
            quotes.append(get_ticker_quote(symbol, db))
        except Exception as exc:
            logger.debug("Recent quote fetch failed for %s: %s", symbol, exc)
    return quotes


def _build_personalized_section(user: User, db: Session, sector_performance: dict[str, dict]) -> dict:
    preferred_sectors = _normalize_preferred_sectors(user)
    recent_symbols = _recent_unique_symbols(user.id, db)
    open_positions = _open_positions_context(user.id, db)
    return {
        "preferred_sectors": [
            sector_performance[sector]
            for sector in preferred_sectors
            if sector in sector_performance
        ],
        "recent_symbols": recent_symbols,
        "open_positions": open_positions,
    }


# ---------------------------------------------------------------------------
# Dashboard builder (runs in _outer_pool; spawns inner tasks)
# ---------------------------------------------------------------------------
def _build_dashboard() -> dict:
    status = _market_status()
    sector_performance = _fetch_sector_performance_payload()

    # Kick off indices+global (parallel fast_info) and movers (batch) together
    all_sym_map = {**_INDICES_MAP, _VIX_SYMBOL: "vix", **_GLOBAL_MAP}
    ticker_fut = _inner_pool.submit(_fetch_all_parallel, all_sym_map)
    movers_fut = _inner_pool.submit(_fetch_nifty50_movers)
    vwap_fut = _inner_pool.submit(_fetch_nifty_vwap_status)

    try:
        ticker_data: dict = ticker_fut.result(timeout=8)
    except Exception as exc:
        logger.warning("Ticker fetch block failed: %s", exc)
        ticker_data = {}

    try:
        gainers, losers, breadth = movers_fut.result(timeout=8)
    except Exception as exc:
        logger.warning("Movers fetch block failed: %s", exc)
        gainers, losers, breadth = [], [], {"advancing": 0, "declining": 0, "pct_advancing": 0}

    try:
        nifty_vs_vwap = vwap_fut.result(timeout=8)
    except Exception as exc:
        logger.warning("VWAP fetch block failed: %s", exc)
        nifty_vs_vwap = "At VWAP"

    vix_raw = ticker_data.get("vix") or {}
    vix_val = vix_raw.get("value")
    vix_context = _classify_vix(vix_val)

    def _idx(key: str) -> dict:
        d = ticker_data.get(key) or {}
        return {"value": d.get("value"), "change": d.get("change"), "change_pct": d.get("change_pct")}

    def _gcue(key: str) -> dict:
        d = ticker_data.get(key) or {}
        return {"value": d.get("value"), "change_pct": d.get("change_pct")}

    return {
        "indices": {
            "nifty_50":   _idx("nifty_50"),
            "bank_nifty": _idx("bank_nifty"),
            "nifty_it":   _idx("nifty_it"),
        },
        "vix": {
            "value":   vix_val,
            "change":  vix_raw.get("change"),
            "context": vix_context,
        },
        "fii_dii": None,
        "top_gainers": gainers,
        "top_losers":  losers,
        "global_cues": {
            "sp500_futures":  _gcue("sp500_futures"),
            "nasdaq_futures": _gcue("nasdaq_futures"),
            "crude_oil":      _gcue("crude_oil"),
            "gold":           _gcue("gold"),
            "usd_inr":        _gcue("usd_inr"),
        },
        "sector_performance": sector_performance,
        "regime": _build_regime(
            {
                "nifty_50": _idx("nifty_50"),
            },
            vix_context,
            breadth,
            nifty_vs_vwap,
        ),
        "personalized": None,
        "market_status": status,
        "last_updated":  _now_ist_str(),
        "is_stale":      False,
    }


def _empty_dashboard() -> dict:
    """Returned when both fresh fetch and stale cache are unavailable."""
    empty_idx  = {"value": None, "change": None, "change_pct": None}
    empty_gcue = {"value": None, "change_pct": None}
    return {
        "indices": {k: empty_idx for k in ("nifty_50", "bank_nifty", "nifty_it")},
        "vix": {"value": None, "change": None, "context": "Unknown"},
        "fii_dii": None,
        "top_gainers": [],
        "top_losers":  [],
        "global_cues": {k: empty_gcue for k in ("sp500_futures", "nasdaq_futures", "crude_oil", "gold", "usd_inr")},
        "sector_performance": {},
        "regime": {
            "nifty_trend": "Sideways",
            "nifty_vs_vwap": "At VWAP",
            "breadth": {"advancing": 0, "declining": 0, "pct_advancing": 0},
            "interpretation": "Market data is limited right now.",
        },
        "personalized": None,
        "market_status": _market_status(),
        "last_updated":  _now_ist_str(),
        "is_stale":      True,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def get_market_dashboard(db: Session, user: User | None = None) -> dict:
    cache_key = "market_dashboard_v2"

    fresh = _cache_get(db, cache_key)
    if fresh is not None:
        payload = dict(fresh)
        if user is not None:
            payload["personalized"] = _build_personalized_section(
                user,
                db,
                payload.get("sector_performance") or {},
            )
        return payload

    # Serialize concurrent builds; second waiter re-checks cache after lock.
    acquired = _build_lock.acquire(timeout=_FETCH_TIMEOUT + 2)
    if not acquired:
        stale = _cache_get_stale(db, cache_key)
        if stale is not None:
            payload = {**stale, "is_stale": True}
        else:
            payload = _empty_dashboard()
        if user is not None:
            payload["personalized"] = _build_personalized_section(
                user,
                db,
                payload.get("sector_performance") or {},
            )
        return payload

    try:
        # Re-check: a previous waiter may have just populated the cache.
        fresh = _cache_get(db, cache_key)
        if fresh is not None:
            payload = dict(fresh)
            if user is not None:
                payload["personalized"] = _build_personalized_section(
                    user,
                    db,
                    payload.get("sector_performance") or {},
                )
            return payload

        future = _outer_pool.submit(_build_dashboard)
        payload = future.result(timeout=_FETCH_TIMEOUT)
    except FuturesTimeoutError:
        logger.warning("Dashboard build timed out after %ds", _FETCH_TIMEOUT)
        stale = _cache_get_stale(db, cache_key)
        payload = ({**stale, "is_stale": True} if stale else _empty_dashboard())
        if user is not None:
            payload["personalized"] = _build_personalized_section(
                user,
                db,
                payload.get("sector_performance") or {},
            )
        return payload
    except Exception as exc:
        logger.warning("Dashboard build failed: %s", exc)
        stale = _cache_get_stale(db, cache_key)
        payload = ({**stale, "is_stale": True} if stale else _empty_dashboard())
        if user is not None:
            payload["personalized"] = _build_personalized_section(
                user,
                db,
                payload.get("sector_performance") or {},
            )
        return payload
    finally:
        _build_lock.release()

    _cache_set(db, cache_key, "market_dashboard", payload)
    result = dict(payload)
    if user is not None:
        result["personalized"] = _build_personalized_section(
            user,
            db,
            result.get("sector_performance") or {},
        )
    return result


def get_watchlist_data(user: User, db: Session) -> dict:
    preferred_sectors = _normalize_preferred_sectors(user)
    recent_symbols = _recent_unique_symbols(user.id, db)
    sector_performance = get_sector_performance(db)
    recent_stock_quotes = _recent_stock_quotes(recent_symbols, db)
    return {
        "recent_symbols": recent_symbols,
        "preferred_sectors": preferred_sectors,
        "sector_performance": sector_performance,
        "recent_stock_quotes": recent_stock_quotes,
    }


# ---------------------------------------------------------------------------
# Single-stock quote
# ---------------------------------------------------------------------------
def _fetch_quote_data(symbol: str) -> dict:
    fi = yf.Ticker(symbol).fast_info
    last    = _safe_float(getattr(fi, "last_price",         None))
    prev    = _safe_float(getattr(fi, "previous_close",     None))
    high52  = _safe_float(getattr(fi, "fifty_two_week_high", None))
    low52   = _safe_float(getattr(fi, "fifty_two_week_low",  None))
    vol     = _safe_float(getattr(fi, "last_volume",         None))

    if last is not None and prev and prev != 0:
        change     = last - prev
        change_pct = change / prev * 100
    else:
        change = change_pct = None

    display = symbol.replace(".NS", "").replace(".BO", "")
    return {
        "symbol":     display,
        "price":      round(last, 2)       if last      is not None else None,
        "change":     round(change, 2)     if change    is not None else None,
        "change_pct": round(change_pct, 2) if change_pct is not None else None,
        "high_52w":   round(high52, 2)     if high52    is not None else None,
        "low_52w":    round(low52, 2)      if low52     is not None else None,
        "volume":     int(vol)             if vol       is not None else None,
        "market_status": _market_status(),
        "last_updated":  _now_ist_str(),
        "is_stale":      False,
    }


def get_ticker_quote(symbol: str, db: Session, skip_cache: bool = False) -> dict:
    norm, stock = get_quote_symbol_for_stock_input(symbol, db)

    cache_key = f"quote_{norm}"

    if not skip_cache:
        fresh = _cache_get(db, cache_key)
        if fresh is not None:
            return fresh

    try:
        future = _inner_pool.submit(_fetch_quote_data, norm)
        payload = future.result(timeout=_QUOTE_TIMEOUT)
        if stock:
            payload["symbol"] = stock.nse_symbol or (f"BSE:{stock.bse_code}" if stock.bse_code else payload["symbol"])
    except FuturesTimeoutError:
        logger.warning("Quote fetch timed out for %s", norm)
        stale = _cache_get_stale(db, cache_key)
        if stale is not None:
            return {**stale, "is_stale": True}
        return {
            "symbol": (stock.nse_symbol if stock and stock.nse_symbol else symbol.upper()), "price": None, "change": None,
            "change_pct": None, "high_52w": None, "low_52w": None,
            "volume": None, "market_status": _market_status(),
            "last_updated": _now_ist_str(), "is_stale": True,
        }
    except Exception as exc:
        logger.warning("Quote fetch failed for %s: %s", norm, exc)
        stale = _cache_get_stale(db, cache_key)
        if stale is not None:
            return {**stale, "is_stale": True}
        return {
            "symbol": (stock.nse_symbol if stock and stock.nse_symbol else symbol.upper()), "price": None, "change": None,
            "change_pct": None, "high_52w": None, "low_52w": None,
            "volume": None, "market_status": _market_status(),
            "last_updated": _now_ist_str(), "is_stale": True,
        }

    _cache_set(db, cache_key, norm, payload)
    return payload
