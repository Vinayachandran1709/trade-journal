import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchMarketDashboard,
  fetchWatchlist,
  type MarketDashboardData,
  type WatchlistResponse,
} from "../shared/api";
import { getAuthToken } from "../shared/auth";
import { storageGet, storageSet } from "../shared/chrome";

const FAST_REFRESH_MS = 15_000;
const SLOW_REFRESH_MS = 60_000;
const LAST_MARKET_DATA_KEY = "lastMarketData";
const LAST_MARKET_WATCHLIST_KEY = "lastMarketWatchlist";
const MARKET_TIMEZONE = "Asia/Kolkata";
const SECTOR_ORDER = [
  "IT",
  "Banking",
  "Pharma",
  "Auto",
  "Energy",
  "Metals",
  "Realty",
  "FMCG",
  "PSU Bank",
] as const;
const SECTOR_SHORT_LABELS: Record<string, string> = {
  IT: "IT",
  Banking: "Bank",
  Pharma: "Pharma",
  Auto: "Auto",
  Energy: "Energy",
  Metals: "Metal",
  Realty: "Realty",
  FMCG: "FMCG",
  "PSU Bank": "PSU",
};

const numFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const fmtN = (n: number | null | undefined) => (n == null ? "—" : numFmt.format(n));
const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${numFmt.format(n)}%`;
const pctColor = (n: number | null | undefined) =>
  n == null ? "#64748b" : n > 0 ? "#16a34a" : n < 0 ? "#dc2626" : "#64748b";

const INDEX_LABELS: Record<string, string> = {
  nifty_50: "Nifty 50",
  bank_nifty: "Bank Nifty",
  nifty_it: "Nifty IT",
};

const GLOBAL_LABELS: Record<string, string> = {
  sp500_futures: "S&P 500 Fut",
  nasdaq_futures: "Nasdaq Fut",
  crude_oil: "Crude Oil",
  gold: "Gold",
  usd_inr: "USD/INR",
};

function getIstClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return { weekday, minutesFromMidnight: hour * 60 + minute };
}

function isMarketHours(now: Date): boolean {
  const { weekday, minutesFromMidnight } = getIstClock(now);
  const isWeekend = weekday === "Sat" || weekday === "Sun";

  if (isWeekend) {
    return false;
  }

  return minutesFromMidnight >= 9 * 60 + 15 && minutesFromMidnight <= 15 * 60 + 30;
}

function getRefreshIntervalMs(now = new Date()): number {
  return isMarketHours(now) ? FAST_REFRESH_MS : SLOW_REFRESH_MS;
}

function getFetchedTimeLabel(valueMs: number | null): string {
  if (!valueMs) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(valueMs));
}

function globalCueInterpretation(data: MarketDashboardData["global_cues"]): string {
  const spx = data.sp500_futures?.change_pct;
  if (spx != null && spx < -0.5) {
    return "US futures weak → cautious opening likely";
  }
  if (spx != null && spx > 0.5) {
    return "US futures positive → supportive for opening";
  }
  return "US futures flat → neutral cue";
}

function regimeTone(trend: MarketDashboardData["regime"]["nifty_trend"]) {
  if (trend === "Bullish") return "bullish";
  if (trend === "Bearish") return "bearish";
  return "sideways";
}

function regimeSummary(data: MarketDashboardData["regime"]): string {
  const trend = data.nifty_trend;
  const breadth = `${data.breadth.pct_advancing}% advancing`;
  if (trend === "Bullish") {
    return `🟢 Bullish · ${data.nifty_vs_vwap} · ${breadth}`;
  }
  if (trend === "Bearish") {
    return `🔴 Bearish · ${data.nifty_vs_vwap === "Below VWAP" ? "Nifty weak" : data.nifty_vs_vwap} · ${breadth}`;
  }
  return `🟡 Sideways · Range-bound · ${breadth}`;
}

function SectorBox({
  sector,
  data,
  isPreferred,
}: {
  sector: string;
  data?: { index: string; value: number | null; change_pct: number | null };
  isPreferred: boolean;
}) {
  const change = data?.change_pct ?? null;
  const tone =
    change == null
      ? "rgba(148, 163, 184, 0.10)"
      : change > 0
        ? `rgba(22, 163, 74, ${Math.min(0.24, 0.08 + Math.abs(change) / 10)})`
        : `rgba(220, 38, 38, ${Math.min(0.24, 0.08 + Math.abs(change) / 10)})`;

  return (
    <div className="mkt-sector-box" style={{ background: tone }}>
      <div className="mkt-sector-box-top">
        <span className="mkt-sector-name">{SECTOR_SHORT_LABELS[sector] ?? sector}</span>
        {isPreferred ? <span className="mkt-sector-star">★</span> : null}
      </div>
      <div className="mkt-sector-change" style={{ color: pctColor(change) }}>
        {fmtPct(change)}
      </div>
    </div>
  );
}

function IndexCard({
  label,
  data,
  isVix = false,
}: {
  label: string;
  data:
    | MarketDashboardData["indices"][string]
    | { value: number | null; change?: number | null; change_pct?: number | null; context?: string };
  isVix?: boolean;
}) {
  return (
    <div className="mkt-index-card compact">
      <div className="mkt-index-name">{label}</div>
      <div className="mkt-index-value">{fmtN(data?.value ?? null)}</div>
      <div
        className="mkt-index-change"
        style={{ color: isVix ? "#475569" : pctColor((data as { change_pct?: number | null }).change_pct) }}
      >
        {isVix
          ? (data as { context?: string }).context ?? "Unknown"
          : fmtPct((data as { change_pct?: number | null }).change_pct)}
      </div>
    </div>
  );
}

function MoverRow({
  item,
  isGainer,
}: {
  item: { symbol: string; price: number; change_pct: number };
  isGainer: boolean;
}) {
  return (
    <div className="mkt-mover-row">
      <span className="mkt-mover-sym">{item.symbol}</span>
      <span className="mkt-mover-price">₹{fmtN(item.price)}</span>
      <span className="mkt-mover-pct" style={{ color: isGainer ? "#16a34a" : "#dc2626" }}>
        {fmtPct(item.change_pct)}
      </span>
    </div>
  );
}

function GlobalCueRow({
  label,
  data,
}: {
  label: string;
  data: { value: number | null; change_pct: number | null };
}) {
  return (
    <div className="mkt-global-row">
      <span className="mkt-global-label">{label}</span>
      <span className="mkt-global-val">{fmtN(data.value)}</span>
      <span className="mkt-global-pct" style={{ color: pctColor(data.change_pct) }}>
        {fmtPct(data.change_pct)}
      </span>
    </div>
  );
}

function FiiDiiSection({
  data,
}: {
  data: MarketDashboardData["fii_dii"];
}) {
  if (!data) {
    return null;
  }

  const fii = data.fii_net ?? 0;
  const dii = data.dii_net ?? 0;

  return (
    <div className="mkt-section">
      <div className="mkt-section-heading-row">
        <div>
          <h3 className="mkt-section-title">FII / DII</h3>
          {data.date ? <p className="mkt-section-subcopy">As of {data.date}</p> : null}
        </div>
      </div>
      <div className="mkt-fiidii-bar-row">
        <span className="mkt-fiidii-lbl">FII</span>
        <div className="mkt-fiidii-bar-wrap">
          <div
            className="mkt-fiidii-bar"
            style={{
              width: `${Math.min(100, (Math.abs(fii) / 5000) * 100)}%`,
              background: fii >= 0 ? "#16a34a" : "#dc2626",
            }}
          />
        </div>
        <span className="mkt-fiidii-value" style={{ color: fii >= 0 ? "#16a34a" : "#dc2626" }}>
          {fii >= 0 ? "+" : ""}₹{numFmt.format(Math.abs(fii))} Cr
        </span>
      </div>
      <div className="mkt-fiidii-bar-row">
        <span className="mkt-fiidii-lbl">DII</span>
        <div className="mkt-fiidii-bar-wrap">
          <div
            className="mkt-fiidii-bar"
            style={{
              width: `${Math.min(100, (Math.abs(dii) / 5000) * 100)}%`,
              background: dii >= 0 ? "#16a34a" : "#dc2626",
            }}
          />
        </div>
        <span className="mkt-fiidii-value" style={{ color: dii >= 0 ? "#16a34a" : "#dc2626" }}>
          {dii >= 0 ? "+" : ""}₹{numFmt.format(Math.abs(dii))} Cr
        </span>
      </div>
    </div>
  );
}

function SkeletonBar({ className }: { className?: string }) {
  return <span className={`mkt-skeleton-bar${className ? ` ${className}` : ""}`} />;
}

function MarketSkeleton() {
  return (
    <div className="mkt-root" aria-hidden="true">
      <div className="mkt-section">
        <SkeletonBar className="mkt-skeleton-regime" />
      </div>
      <div className="mkt-section">
        <SkeletonBar className="mkt-skeleton-title" />
        <div className="mkt-sector-grid">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="mkt-sector-box">
              <SkeletonBar className="mkt-skeleton-label" />
              <SkeletonBar className="mkt-skeleton-change" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MarketTab({ isSignedIn }: { isSignedIn: boolean }) {
  const [data, setData] = useState<MarketDashboardData | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAtMs, setLastFetchedAtMs] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const hasDataRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const fetchInFlightRef = useRef(false);

  useEffect(() => {
    hasDataRef.current = Boolean(data);
  }, [data]);

  async function load(nextToken?: string | null) {
    if (fetchInFlightRef.current) {
      return;
    }

    fetchInFlightRef.current = true;

    if (mountedRef.current) {
      if (hasDataRef.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
    }

    try {
      const token = typeof nextToken !== "undefined" ? nextToken : await getAuthToken();
      const [dashboardResult, watchlistResult] = await Promise.all([
        fetchMarketDashboard(token),
        token ? fetchWatchlist(token).catch(() => null) : Promise.resolve(null),
      ]);

      if (mountedRef.current) {
        setData(dashboardResult);
        setWatchlist(watchlistResult);
        setError(null);
        setLastFetchedAtMs(Date.now());
      }

      void storageSet(LAST_MARKET_DATA_KEY, dashboardResult).catch(() => undefined);
      if (watchlistResult) {
        void storageSet(LAST_MARKET_WATCHLIST_KEY, watchlistResult).catch(() => undefined);
      }
    } catch (nextError) {
      if (mountedRef.current) {
        setError(nextError instanceof Error ? nextError.message : "Failed to load market data");
      }
    } finally {
      fetchInFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  function scheduleNextRefresh() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      void load().finally(() => {
        if (mountedRef.current) {
          scheduleNextRefresh();
        }
      });
    }, getRefreshIntervalMs());
  }

  useEffect(() => {
    mountedRef.current = true;

    async function hydrate() {
      const [cachedDashboard, cachedWatchlist] = await Promise.all([
        storageGet<MarketDashboardData>(LAST_MARKET_DATA_KEY).catch(() => null),
        storageGet<WatchlistResponse>(LAST_MARKET_WATCHLIST_KEY).catch(() => null),
      ]);

      if (!mountedRef.current) {
        return;
      }

      if (cachedDashboard) {
        setData(cachedDashboard);
        setLastFetchedAtMs(new Date(cachedDashboard.last_updated).getTime() || Date.now());
        setLoading(false);
      }

      if (cachedWatchlist) {
        setWatchlist(cachedWatchlist);
      }

      const token = await getAuthToken().catch(() => null);
      await load(token);

      if (mountedRef.current) {
        scheduleNextRefresh();
      }
    }

    void hydrate();

    return () => {
      mountedRef.current = false;
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (loading && !data) {
    return <MarketSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="mkt-error">
        <p>Unable to load market data.</p>
        <p style={{ fontSize: 12, color: "#64748b" }}>{error}</p>
        <button className="mkt-retry-btn" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const preferredSectors = new Set(watchlist?.preferred_sectors ?? []);
  const sectorPerformance = Object.keys(data.sector_performance || {}).length
    ? data.sector_performance
    : watchlist?.sector_performance ?? {};
  const yourStocks = (watchlist?.recent_stock_quotes ?? []).slice(0, 6);
  const showYourStocks = isSignedIn && yourStocks.length > 0;

  return (
    <div className="mkt-root">
      {data.is_stale ? (
        <div className="mkt-stale-banner">Data may be delayed. Showing the latest saved snapshot.</div>
      ) : null}

      {error ? (
        <div className="mkt-inline-note">Showing cached market context while a refresh retries.</div>
      ) : null}

      {isSignedIn ? (
        <div className={`mkt-regime-bar ${regimeTone(data.regime.nifty_trend)}`}>
          {regimeSummary(data.regime)}
        </div>
      ) : null}

      {showYourStocks ? (
        <div className="mkt-section">
          <div className="mkt-section-heading-row">
            <div>
              <h3 className="mkt-section-title">Your Stocks</h3>
              <p className="mkt-section-subcopy">Based on your recent trades</p>
            </div>
          </div>
          <div className="mkt-your-stocks-list">
            {yourStocks.map((stock, index) => (
              <div
                key={`${stock.symbol}-${index}`}
                className={`mkt-your-stock-row${index % 2 === 0 ? " alt" : ""}`}
              >
                <span className="mkt-your-stock-symbol">{stock.symbol}</span>
                <span className="mkt-your-stock-price">₹{fmtN(stock.price)}</span>
                <span
                  className="mkt-your-stock-change"
                  style={{ color: pctColor(stock.change_pct) }}
                >
                  {fmtPct(stock.change_pct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mkt-section">
        <div className="mkt-section-heading-row">
          <div>
            <h3 className="mkt-section-title">Sector Flow</h3>
          </div>
        </div>
        <div className="mkt-sector-grid">
          {SECTOR_ORDER.map((sector) => (
            <SectorBox
              key={sector}
              sector={sector}
              data={sectorPerformance[sector]}
              isPreferred={preferredSectors.has(sector)}
            />
          ))}
        </div>
      </div>

      <div className="mkt-section">
        <div className="mkt-index-grid compact">
          {Object.entries(INDEX_LABELS).map(([key, label]) => (
            <IndexCard
              key={key}
              label={label}
              data={data.indices[key] ?? { value: null, change: null, change_pct: null }}
            />
          ))}
          <IndexCard label="India VIX" data={data.vix} isVix={true} />
        </div>
      </div>

      <div className="mkt-section">
        <div className="mkt-section-heading-row">
          <div>
            <h3 className="mkt-section-title">Market Movers</h3>
          </div>
        </div>
        <div className="mkt-movers-grid">
          <div className="mkt-movers-col">
            <div className="mkt-mini-label">Gainers</div>
            {data.top_gainers.slice(0, 5).map((gainer) => (
              <MoverRow key={gainer.symbol} item={gainer} isGainer={true} />
            ))}
          </div>
          <div className="mkt-movers-col">
            <div className="mkt-mini-label">Losers</div>
            {data.top_losers.slice(0, 5).map((loser) => (
              <MoverRow key={loser.symbol} item={loser} isGainer={false} />
            ))}
          </div>
        </div>
      </div>

      <div className="mkt-section">
        <div className="mkt-section-heading-row">
          <div>
            <h3 className="mkt-section-title">Global Cues</h3>
            <p className="mkt-section-subcopy">{globalCueInterpretation(data.global_cues)}</p>
          </div>
        </div>
        <div className="mkt-global-grid">
          {Object.entries(GLOBAL_LABELS).map(([key, label]) => (
            <GlobalCueRow
              key={key}
              label={label}
              data={data.global_cues[key] ?? { value: null, change_pct: null }}
            />
          ))}
        </div>
      </div>

      <FiiDiiSection data={data.fii_dii} />

      <div className="mkt-footer-bar">
        <span className="mkt-footer-time">{getFetchedTimeLabel(lastFetchedAtMs)}</span>
        <button
          aria-label="Refresh market data"
          className="mkt-refresh-button"
          disabled={refreshing || loading}
          onClick={() => void load()}
          title="Refresh market data"
        >
          {refreshing || loading ? "Refreshing..." : "\u27F3 Refresh"}
        </button>
      </div>
    </div>
  );
}
