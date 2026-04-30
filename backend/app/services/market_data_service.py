"""Market data service — yfinance + DB cache.

TTL: 60 s during Indian market hours (9:15–15:30 IST Mon–Fri), 300 s otherwise.
On any yfinance failure the last cached payload is returned with is_stale=True.
"""
import logging
import math
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from datetime import datetime, timedelta, timezone

import yfinance as yf
from sqlalchemy.orm import Session

from app.models.market_data_cache import MarketDataCache
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


def _fetch_nifty50_movers() -> tuple[list[dict], list[dict]]:
    """Batch-download 20 Nifty50 stocks, return top-5 gainers and losers."""
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
            return [], []

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
        return gainers, losers

    except Exception as exc:
        logger.warning("Nifty50 batch download failed: %s", exc)
        return [], []


# ---------------------------------------------------------------------------
# Dashboard builder (runs in _outer_pool; spawns inner tasks)
# ---------------------------------------------------------------------------
def _build_dashboard() -> dict:
    status = _market_status()

    # Kick off indices+global (parallel fast_info) and movers (batch) together
    all_sym_map = {**_INDICES_MAP, _VIX_SYMBOL: "vix", **_GLOBAL_MAP}
    ticker_fut = _inner_pool.submit(_fetch_all_parallel, all_sym_map)
    movers_fut = _inner_pool.submit(_fetch_nifty50_movers)

    try:
        ticker_data: dict = ticker_fut.result(timeout=8)
    except Exception as exc:
        logger.warning("Ticker fetch block failed: %s", exc)
        ticker_data = {}

    try:
        gainers, losers = movers_fut.result(timeout=8)
    except Exception as exc:
        logger.warning("Movers fetch block failed: %s", exc)
        gainers, losers = [], []

    vix_raw = ticker_data.get("vix") or {}
    vix_val = vix_raw.get("value")

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
            "context": _classify_vix(vix_val),
        },
        "fii_dii": {
            "fii_net": None,
            "dii_net": None,
            "date":    None,
            "source":  "unavailable",
        },
        "top_gainers": gainers,
        "top_losers":  losers,
        "global_cues": {
            "sp500_futures":  _gcue("sp500_futures"),
            "nasdaq_futures": _gcue("nasdaq_futures"),
            "crude_oil":      _gcue("crude_oil"),
            "gold":           _gcue("gold"),
            "usd_inr":        _gcue("usd_inr"),
        },
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
        "fii_dii": {"fii_net": None, "dii_net": None, "date": None, "source": "unavailable"},
        "top_gainers": [],
        "top_losers":  [],
        "global_cues": {k: empty_gcue for k in ("sp500_futures", "nasdaq_futures", "crude_oil", "gold", "usd_inr")},
        "market_status": _market_status(),
        "last_updated":  _now_ist_str(),
        "is_stale":      True,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def get_market_dashboard(db: Session) -> dict:
    cache_key = "market_dashboard_v1"

    fresh = _cache_get(db, cache_key)
    if fresh is not None:
        return fresh

    # Serialize concurrent builds; second waiter re-checks cache after lock.
    acquired = _build_lock.acquire(timeout=_FETCH_TIMEOUT + 2)
    if not acquired:
        stale = _cache_get_stale(db, cache_key)
        if stale is not None:
            return {**stale, "is_stale": True}
        return _empty_dashboard()

    try:
        # Re-check: a previous waiter may have just populated the cache.
        fresh = _cache_get(db, cache_key)
        if fresh is not None:
            return fresh

        future = _outer_pool.submit(_build_dashboard)
        payload = future.result(timeout=_FETCH_TIMEOUT)
    except FuturesTimeoutError:
        logger.warning("Dashboard build timed out after %ds", _FETCH_TIMEOUT)
        stale = _cache_get_stale(db, cache_key)
        return ({**stale, "is_stale": True} if stale else _empty_dashboard())
    except Exception as exc:
        logger.warning("Dashboard build failed: %s", exc)
        stale = _cache_get_stale(db, cache_key)
        return ({**stale, "is_stale": True} if stale else _empty_dashboard())
    finally:
        _build_lock.release()

    _cache_set(db, cache_key, "market_dashboard", payload)
    return payload


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
