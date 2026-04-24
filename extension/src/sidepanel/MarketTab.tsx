import { useEffect, useRef, useState } from "react";
import { fetchMarketDashboard, type MarketDashboardData } from "../shared/api";

const POLL_MS = 60_000;

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

function StatusDot({ status }: { status: string }) {
  const isOpen = status === "open";
  const isPreOpen = status === "pre_open";
  const color = isOpen ? "#16a34a" : isPreOpen ? "#f59e0b" : "#dc2626";
  const label = isOpen ? "Market Open" : isPreOpen ? "Pre-Open" : "Market Closed";
  return (
    <span className="mkt-status-pill" style={{ borderColor: color }}>
      <span className="mkt-dot" style={{ background: color }} />
      {label}
    </span>
  );
}

function IndexCard({ label, data }: { label: string; data: MarketDashboardData["indices"][string] }) {
  return (
    <div className="mkt-index-card">
      <div className="mkt-index-name">{label}</div>
      <div className="mkt-index-value">{fmtN(data?.value)}</div>
      <div className="mkt-index-change" style={{ color: pctColor(data?.change_pct) }}>
        {data?.change != null ? (data.change >= 0 ? "▲" : "▼") : ""}{" "}
        {fmtN(data?.change)} ({fmtPct(data?.change_pct)})
      </div>
    </div>
  );
}

function VixCard({ vix }: { vix: MarketDashboardData["vix"] }) {
  const ctxColor =
    vix.context === "Low" ? "#16a34a"
    : vix.context === "Moderate" ? "#f59e0b"
    : vix.context === "Elevated" ? "#ea580c"
    : vix.context === "High" ? "#dc2626"
    : "#64748b";
  return (
    <div className="mkt-index-card">
      <div className="mkt-index-name">India VIX</div>
      <div className="mkt-index-value">{fmtN(vix.value)}</div>
      <div className="mkt-index-change" style={{ color: ctxColor, fontWeight: 600 }}>
        {vix.context}
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
        {isGainer ? "+" : ""}{fmtPct(item.change_pct)}
      </span>
    </div>
  );
}

function GlobalCueRow({ label, data }: { label: string; data: { value: number | null; change_pct: number | null } }) {
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

function FiiDiiSection({ data }: { data: MarketDashboardData["fii_dii"] }) {
  if (data.source === "unavailable" || (data.fii_net == null && data.dii_net == null)) {
    return (
      <div className="mkt-section">
        <h3 className="mkt-section-title">FII / DII Activity</h3>
        <p className="mkt-unavail">Live data unavailable — check NSE website for latest figures.</p>
      </div>
    );
  }
  const fii = data.fii_net ?? 0;
  const dii = data.dii_net ?? 0;
  return (
    <div className="mkt-section">
      <h3 className="mkt-section-title">FII / DII Activity</h3>
      {data.date ? <p className="mkt-unavail" style={{ marginTop: 0 }}>As of {data.date}</p> : null}
      <div className="mkt-fiidii-bar-row">
        <span className="mkt-fiidii-lbl">FII</span>
        <div className="mkt-fiidii-bar-wrap">
          <div
            className="mkt-fiidii-bar"
            style={{ width: `${Math.min(100, (Math.abs(fii) / 5000) * 100)}%`, background: fii >= 0 ? "#16a34a" : "#dc2626" }}
          />
        </div>
        <span style={{ color: fii >= 0 ? "#16a34a" : "#dc2626", fontWeight: 600, fontSize: 12 }}>
          {fii >= 0 ? "+" : ""}₹{numFmt.format(Math.abs(fii))} Cr
        </span>
      </div>
      <div className="mkt-fiidii-bar-row">
        <span className="mkt-fiidii-lbl">DII</span>
        <div className="mkt-fiidii-bar-wrap">
          <div
            className="mkt-fiidii-bar"
            style={{ width: `${Math.min(100, (Math.abs(dii) / 5000) * 100)}%`, background: dii >= 0 ? "#16a34a" : "#dc2626" }}
          />
        </div>
        <span style={{ color: dii >= 0 ? "#16a34a" : "#dc2626", fontWeight: 600, fontSize: 12 }}>
          {dii >= 0 ? "+" : ""}₹{numFmt.format(Math.abs(dii))} Cr
        </span>
      </div>
    </div>
  );
}

export default function MarketTab() {
  const [data, setData] = useState<MarketDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  async function load(isRefresh: boolean) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await fetchMarketDashboard();
      if (mountedRef.current) { setData(result); setError(null); }
    } catch (err) {
      if (mountedRef.current)
        setError(err instanceof Error ? err.message : "Failed to load market data");
    } finally {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    void load(false);
    const id = setInterval(() => void load(true), POLL_MS);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, []);

  if (loading) {
    return <div className="mkt-loading">Loading market data...</div>;
  }

  if (error && !data) {
    return (
      <div className="mkt-error">
        <p>Unable to load market data.</p>
        <p style={{ fontSize: 12, color: "#64748b" }}>{error}</p>
        <button className="mkt-retry-btn" onClick={() => void load(false)}>Retry</button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mkt-root">
      {/* Stale banner */}
      {data.is_stale && (
        <div className="mkt-stale-banner">
          Data may be delayed. Source temporarily unavailable.
        </div>
      )}

      {/* Status header */}
      <div className="mkt-header">
        <StatusDot status={data.market_status} />
        <span className="mkt-updated">
          {refreshing ? "Refreshing…" : `Updated ${new Date(data.last_updated).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
        </span>
      </div>

      {/* Index cards — 2×2 grid */}
      <div className="mkt-section">
        <div className="mkt-index-grid">
          {Object.entries(INDEX_LABELS).map(([key, label]) => (
            <IndexCard key={key} label={label} data={data.indices[key] ?? { value: null, change: null, change_pct: null }} />
          ))}
          <VixCard vix={data.vix} />
        </div>
      </div>

      {/* Gainers */}
      <div className="mkt-section">
        <h3 className="mkt-section-title mkt-title-green">▲ Top Gainers</h3>
        {data.top_gainers.length === 0
          ? <p className="mkt-unavail">No data</p>
          : data.top_gainers.map((g) => <MoverRow key={g.symbol} item={g} isGainer={true} />)}
      </div>

      {/* Losers */}
      <div className="mkt-section">
        <h3 className="mkt-section-title mkt-title-red">▼ Top Losers</h3>
        {data.top_losers.length === 0
          ? <p className="mkt-unavail">No data</p>
          : data.top_losers.map((l) => <MoverRow key={l.symbol} item={l} isGainer={false} />)}
      </div>

      {/* Global cues */}
      <div className="mkt-section">
        <h3 className="mkt-section-title">Global Cues</h3>
        {Object.entries(GLOBAL_LABELS).map(([key, label]) => (
          <GlobalCueRow
            key={key}
            label={label}
            data={data.global_cues[key] ?? { value: null, change_pct: null }}
          />
        ))}
      </div>

      {/* FII / DII */}
      <FiiDiiSection data={data.fii_dii} />
    </div>
  );
}
