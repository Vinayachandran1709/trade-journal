import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchCompletedTrades,
  fetchMarketDashboard,
  fetchWatchlist,
  type CompletedTradeListItem,
  type MarketDashboardData,
  type PatternsEnvelope,
  type TickerIntelResponse,
  type WatchlistResponse,
} from "../shared/api";
import { getAuthToken } from "../shared/auth";
import type { CaptureState } from "../shared/captures";
import { storageGet, storageSet } from "../shared/chrome";
import {
  buildBehavioralWarnings,
  buildRealtimeRiskAlerts,
  findPattern,
  formatPercent,
  getCachedBehaviorPatterns,
  getIstDateKey,
  getPatternSeverityRank,
  getSessionContext,
  type RealtimeRiskAlert,
} from "./behavioral";

const FAST_REFRESH_MS = 15_000;
const SLOW_REFRESH_MS = 60_000;
const LAST_MARKET_DATA_KEY = "lastMarketData";
const LAST_MARKET_WATCHLIST_KEY = "lastMarketWatchlist";
const DISMISSED_ALERTS_KEY_PREFIX = "riskAlertDismissed";
const SEEN_ALERTS_KEY_PREFIX = "riskAlertSeen";
const NUMBER_FORMATTER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

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

const SECTOR_MAP: Record<string, string> = {
  TCS: "IT",
  INFY: "IT",
  WIPRO: "IT",
  HCLTECH: "IT",
  HDFCBANK: "Banking",
  ICICIBANK: "Banking",
  SBIN: "Banking",
  RELIANCE: "Energy",
  ONGC: "Energy",
  SUNPHARMA: "Pharma",
  DRREDDY: "Pharma",
  TATAMOTORS: "Auto",
  MARUTI: "Auto",
  TATASTEEL: "Metals",
  ITC: "FMCG",
};

function formatNumber(value: number | null | undefined): string {
  return value == null ? "--" : NUMBER_FORMATTER.format(value);
}

function formatSignedPercent(value: number | null | undefined): string {
  if (value == null) {
    return "--";
  }
  return `${value >= 0 ? "+" : ""}${NUMBER_FORMATTER.format(value)}%`;
}

function percentColor(value: number | null | undefined): string {
  if (value == null) {
    return "#64748b";
  }
  if (value > 0) {
    return "#16a34a";
  }
  if (value < 0) {
    return "#dc2626";
  }
  return "#64748b";
}

function getDismissedAlertsKey(dateKey: string) {
  return `${DISMISSED_ALERTS_KEY_PREFIX}_${dateKey}`;
}

function getSeenAlertsKey(dateKey: string) {
  return `${SEEN_ALERTS_KEY_PREFIX}_${dateKey}`;
}

function isMarketHours(now: Date): boolean {
  return getSessionContext(now).kind === "market-open";
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

function regimeTone(trend: MarketDashboardData["regime"]["nifty_trend"]) {
  if (trend === "Bullish") return "bullish";
  if (trend === "Bearish") return "bearish";
  return "sideways";
}

function regimeSummary(data: MarketDashboardData["regime"]): string {
  const breadth = `${data.breadth.pct_advancing}% advancing`;
  if (data.nifty_trend === "Bullish") {
    return `Bullish · ${data.nifty_vs_vwap} · ${breadth}`;
  }
  if (data.nifty_trend === "Bearish") {
    return `Bearish · ${data.nifty_vs_vwap === "Below VWAP" ? "Nifty weak" : data.nifty_vs_vwap} · ${breadth}`;
  }
  return `Sideways · Range-bound · ${breadth}`;
}

function globalCueInterpretation(data: MarketDashboardData["global_cues"]): string {
  const spx = data.sp500_futures?.change_pct;
  if (spx != null && spx < -0.5) {
    return "US futures weak. Opening tone may stay cautious.";
  }
  if (spx != null && spx > 0.5) {
    return "US futures are positive. Opening tone may stay supportive.";
  }
  return "US futures are flat. Global cues look neutral.";
}

function getTradeSector(symbol: string): string {
  return SECTOR_MAP[symbol.toUpperCase()] ?? "Other";
}

function getStockMarker(args: {
  symbol: string;
  tickerIntel: TickerIntelResponse | null;
  strongSector: string | null;
}): string[] {
  const markers: string[] = [];
  if (
    args.tickerIntel?.avg_volume &&
    args.tickerIntel.volume &&
    args.tickerIntel.volume / args.tickerIntel.avg_volume > 1.5
  ) {
    markers.push("🔥");
  }
  if (args.strongSector && getTradeSector(args.symbol) === args.strongSector) {
    markers.push("⭐");
  }
  return markers;
}

function SectorBox({
  sector,
  data,
  isPreferred,
  isConcentrated,
}: {
  sector: string;
  data?: { index: string; value: number | null; change_pct: number | null };
  isPreferred: boolean;
  isConcentrated: boolean;
}) {
  const change = data?.change_pct ?? null;
  const tone =
    change == null
      ? "rgba(148, 163, 184, 0.10)"
      : change > 0
        ? `rgba(22, 163, 74, ${Math.min(0.24, 0.08 + Math.abs(change) / 10)})`
        : `rgba(220, 38, 38, ${Math.min(0.24, 0.08 + Math.abs(change) / 10)})`;

  return (
    <div
      className="mkt-sector-box"
      style={{
        background: tone,
        boxShadow: isConcentrated ? "0 0 0 2px rgba(79, 70, 229, 0.18) inset" : undefined,
        borderColor: isConcentrated ? "rgba(79, 70, 229, 0.4)" : undefined,
      }}
    >
      <div className="mkt-sector-box-top">
        <span className="mkt-sector-name">{SECTOR_SHORT_LABELS[sector] ?? sector}</span>
        {isPreferred ? <span className="mkt-sector-star">★</span> : null}
      </div>
      <div className="mkt-sector-change" style={{ color: percentColor(change) }}>
        {formatSignedPercent(change)}
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
      <div className="mkt-index-value">{formatNumber(data?.value ?? null)}</div>
      <div
        className="mkt-index-change"
        style={{ color: isVix ? "#475569" : percentColor((data as { change_pct?: number | null }).change_pct) }}
      >
        {isVix
          ? (data as { context?: string }).context ?? "Unknown"
          : formatSignedPercent((data as { change_pct?: number | null }).change_pct)}
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
      <span className="mkt-mover-price">₹{formatNumber(item.price)}</span>
      <span className="mkt-mover-pct" style={{ color: isGainer ? "#16a34a" : "#dc2626" }}>
        {formatSignedPercent(item.change_pct)}
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
      <span className="mkt-global-val">{formatNumber(data.value)}</span>
      <span className="mkt-global-pct" style={{ color: percentColor(data.change_pct) }}>
        {formatSignedPercent(data.change_pct)}
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
          {fii >= 0 ? "+" : ""}₹{NUMBER_FORMATTER.format(Math.abs(fii))} Cr
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
          {dii >= 0 ? "+" : ""}₹{NUMBER_FORMATTER.format(Math.abs(dii))} Cr
        </span>
      </div>
    </div>
  );
}

function RiskAlertCard({
  alert,
  onDismiss,
}: {
  alert: RealtimeRiskAlert;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className={`risk-alert-card alert-${alert.severity}`}>
      <button className="risk-alert-dismiss" onClick={() => onDismiss(alert.id)}>
        ×
      </button>
      <div className="risk-alert-title">
        {alert.emoji} {alert.title}
      </div>
      <div className="risk-alert-detail">{alert.detail}</div>
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

export default function MarketTab({
  isSignedIn,
  captureState,
  onDataChange,
}: {
  isSignedIn: boolean;
  captureState: CaptureState | null;
  onDataChange?: (data: MarketDashboardData | null) => void;
}) {
  const [data, setData] = useState<MarketDashboardData | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistResponse | null>(null);
  const [patternsEnvelope, setPatternsEnvelope] = useState<PatternsEnvelope | null>(null);
  const [completedTrades, setCompletedTrades] = useState<CompletedTradeListItem[]>([]);
  const [stockIntel, setStockIntel] = useState<Record<string, TickerIntelResponse | null>>({});
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [seenTimeWarning, setSeenTimeWarning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAtMs, setLastFetchedAtMs] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const hasDataRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const fetchInFlightRef = useRef(false);
  const todayKey = getIstDateKey();

  useEffect(() => {
    hasDataRef.current = Boolean(data);
    onDataChange?.(data);
  }, [data, onDataChange]);

  useEffect(() => {
    let active = true;
    async function hydrateAlertState() {
      const [storedDismissed, storedSeen] = await Promise.all([
        storageGet<string[]>(getDismissedAlertsKey(todayKey)).catch(() => []),
        storageGet<boolean>(getSeenAlertsKey(todayKey)).catch(() => false),
      ]);
      if (!active) return;
      setDismissedAlerts(storedDismissed ?? []);
      setSeenTimeWarning(Boolean(storedSeen));
    }
    void hydrateAlertState();
    return () => {
      active = false;
    };
  }, [todayKey]);

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
      const [dashboardResult, watchlistResult, patternsResult, completedTradesResult] = await Promise.all([
        fetchMarketDashboard(token),
        token ? fetchWatchlist(token).catch(() => null) : Promise.resolve(null),
        isSignedIn && token ? getCachedBehaviorPatterns(token) : Promise.resolve(null),
        isSignedIn && token ? fetchCompletedTrades(token, { limit: 200 }).catch(() => []) : Promise.resolve([]),
      ]);

      if (mountedRef.current) {
        setData(dashboardResult);
        setWatchlist(watchlistResult);
        setPatternsEnvelope(patternsResult);
        setCompletedTrades(completedTradesResult);
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

      if (!mountedRef.current) return;

      if (cachedDashboard) {
        setData(cachedDashboard);
        setLastFetchedAtMs(new Date(cachedDashboard.last_updated).getTime() || Date.now());
        setLoading(false);
      }
      if (cachedWatchlist) {
        setWatchlist(cachedWatchlist);
      }

      const token = await getAuthToken().catch(() => null);
      if (isSignedIn && token) {
        const cachedPatterns = await getCachedBehaviorPatterns(token);
        if (mountedRef.current) {
          setPatternsEnvelope(cachedPatterns);
        }
      } else if (mountedRef.current) {
        setPatternsEnvelope(null);
      }

      await load(token);
      if (mountedRef.current) {
        scheduleNextRefresh();
      }
    }

    void hydrate();

    return () => {
      mountedRef.current = false;
      onDataChange?.(null);
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [isSignedIn, onDataChange]);

  const yourStocks = (watchlist?.recent_stock_quotes ?? []).slice(0, 6);

  useEffect(() => {
    let active = true;

    async function loadStockIntel() {
      if (!isSignedIn || yourStocks.length === 0) {
        if (active) {
          setStockIntel({});
        }
        return;
      }

      const responses = await Promise.all(
        yourStocks.map(async (stock) => {
          try {
            const response = await chrome.runtime.sendMessage({
              type: "ticker:fetch-intel",
              payload: { symbol: stock.symbol },
            });
            return [stock.symbol, (response?.tickerIntel as TickerIntelResponse | undefined) ?? null] as const;
          } catch {
            return [stock.symbol, null] as const;
          }
        })
      );

      if (!active) return;
      setStockIntel(Object.fromEntries(responses));
    }

    void loadStockIntel();
    return () => {
      active = false;
    };
  }, [isSignedIn, yourStocks]);

  const sectorWinRates = useMemo(() => {
    const stats = new Map<string, { total: number; wins: number }>();
    for (const trade of completedTrades) {
      const sector = getTradeSector(trade.stock_symbol);
      const current = stats.get(sector) ?? { total: 0, wins: 0 };
      current.total += 1;
      if (trade.pnl > 0) current.wins += 1;
      stats.set(sector, current);
    }
    return stats;
  }, [completedTrades]);

  const sectorPattern = findPattern(patternsEnvelope?.patterns, "sector_concentration");
  const concentratedSector = sectorPattern ? String(sectorPattern.data?.sector ?? "") : "";
  const concentratedWinRate = concentratedSector
    ? (() => {
        const stats = sectorWinRates.get(concentratedSector);
        return stats && stats.total > 0 ? stats.wins / stats.total : null;
      })()
    : null;
  const strongSector =
    sectorPattern &&
    Number(sectorPattern.data?.sector_avg_pnl ?? 0) >= Number(sectorPattern.data?.overall_avg_pnl ?? 0)
      ? concentratedSector
      : null;

  const warnings = useMemo(
    () =>
      buildBehavioralWarnings({
        patterns: patternsEnvelope?.patterns,
        captureState,
        marketData: data,
        session: getSessionContext(),
      }),
    [captureState, data, patternsEnvelope]
  );

  const activeRiskAlerts = useMemo(
    () =>
      buildRealtimeRiskAlerts({
        patterns: patternsEnvelope?.patterns,
        captureState,
        marketData: data,
        seenTimeWarning,
      }).filter((alert) => !dismissedAlerts.includes(alert.id)),
    [captureState, data, dismissedAlerts, patternsEnvelope, seenTimeWarning]
  );

  useEffect(() => {
    if (!activeRiskAlerts.some((alert) => alert.id.startsWith("time-warning-")) || seenTimeWarning) {
      return;
    }
    setSeenTimeWarning(true);
    void storageSet(getSeenAlertsKey(todayKey), true).catch(() => undefined);
  }, [activeRiskAlerts, seenTimeWarning, todayKey]);

  async function dismissAlert(id: string) {
    const next = [...new Set([...dismissedAlerts, id])];
    setDismissedAlerts(next);
    await storageSet(getDismissedAlertsKey(todayKey), next).catch(() => undefined);
  }

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
  const showYourStocks = isSignedIn && yourStocks.length > 0;
  const highestSeverityPattern = [...(patternsEnvelope?.patterns ?? [])]
    .filter((pattern) => !pattern.locked)
    .sort((left, right) => getPatternSeverityRank(left.severity) - getPatternSeverityRank(right.severity))[0] ?? null;
  const vixBehaviorLine =
    data.vix.value != null &&
    data.vix.value > 18 &&
    typeof highestSeverityPattern?.data?.high_vix_win_rate === "number"
      ? `Your data shows high-VIX days reduce your win rate to ${formatPercent(
          Number(highestSeverityPattern.data.high_vix_win_rate) / 100,
          0
        )}.`
      : null;

  return (
    <div className="mkt-root">
      {activeRiskAlerts.length > 0 ? (
        <div className="behavioral-warnings-section">
          {activeRiskAlerts.map((alert) => (
            <RiskAlertCard key={alert.id} alert={alert} onDismiss={dismissAlert} />
          ))}
        </div>
      ) : null}

      {data.is_stale ? (
        <div className="mkt-stale-banner">Data may be delayed. Showing the latest saved snapshot.</div>
      ) : null}

      {error ? (
        <div className="mkt-inline-note">Showing cached market context while a refresh retries.</div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="behavioral-warnings-section">
          <div className="behavioral-warnings-label">Based on your trading patterns</div>
          {warnings.map((warning) => (
            <div key={warning.id} className={`behavioral-warning warn-${warning.severity}`}>
              <div className="warn-title">{warning.title}</div>
              <div className="warn-detail">{warning.detail}</div>
            </div>
          ))}
        </div>
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
            {yourStocks.map((stock, index) => {
              const markers = getStockMarker({
                symbol: stock.symbol,
                tickerIntel: stockIntel[stock.symbol] ?? null,
                strongSector,
              });
              return (
                <div
                  key={`${stock.symbol}-${index}`}
                  className={`mkt-your-stock-row${index % 2 === 0 ? " alt" : ""}`}
                >
                  <span className="mkt-your-stock-symbol">
                    {stock.symbol} {markers.length ? <span>{markers.join(" ")}</span> : null}
                  </span>
                  <span className="mkt-your-stock-price">₹{formatNumber(stock.price)}</span>
                  <span className="mkt-your-stock-change" style={{ color: percentColor(stock.change_pct) }}>
                    {formatSignedPercent(stock.change_pct)}
                  </span>
                </div>
              );
            })}
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
              isConcentrated={sector === concentratedSector}
            />
          ))}
        </div>
        {concentratedSector && concentratedWinRate != null ? (
          <p className="mkt-section-subcopy" style={{ marginTop: 8 }}>
            You trade {concentratedSector} most · {formatPercent(concentratedWinRate, 0)} win rate there
          </p>
        ) : null}
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
        {vixBehaviorLine ? (
          <p className="mkt-section-subcopy" style={{ marginTop: 8 }}>
            {vixBehaviorLine}
          </p>
        ) : null}
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
          {refreshing || loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </div>
  );
}
