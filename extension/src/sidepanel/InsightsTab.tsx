import { useEffect, useState } from "react";

import {
  analyzePatterns,
  getAnalyticsSummary,
  getPatterns,
  type AnalyticsSummaryResponse,
  type PatternsEnvelope,
  type PatternResponse,
} from "../shared/api";
import { getAuthToken } from "../shared/auth";

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "₹--";
  }
  return `₹${CURRENCY_FORMATTER.format(value)}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }
  return `${(value * 100).toFixed(0)}%`;
}

function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }
  return CURRENCY_FORMATTER.format(value);
}

function severityIcon(severity: string): string {
  switch (severity) {
    case "high":
      return "🔴";
    case "medium":
      return "🟡";
    default:
      return "🟢";
  }
}

function sortPatterns(patterns: PatternResponse[]): PatternResponse[] {
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...patterns].sort((a, b) => (order[a.severity] ?? 99) - (order[b.severity] ?? 99));
}

function formatStatValue(value: unknown): string {
  if (typeof value === "number") {
    return formatCount(value);
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (value == null) {
    return "--";
  }
  return String(value);
}

function formatPatternStat(key: string, value: unknown): string {
  if (typeof value !== "number") {
    return formatStatValue(value);
  }

  if (key.includes("win_rate") || key.includes("share")) {
    return formatPercent(value);
  }

  if (key.includes("pnl")) {
    return formatCurrency(value);
  }

  return formatCount(value);
}

export default function InsightsTab({
  isSignedIn,
  webAppUrl,
}: {
  isSignedIn: boolean;
  webAppUrl: string;
}) {
  const [patternsData, setPatternsData] = useState<PatternsEnvelope | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;

    async function loadInsights() {
      if (!isSignedIn) {
        if (active) {
          setPatternsData(null);
          setSummary(null);
          setError(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const token = await getAuthToken();
        if (!token) {
          throw new Error("Sign in to view your insights.");
        }

        const [patternsResponse, summaryResponse] = await Promise.all([
          getPatterns(token),
          getAnalyticsSummary(token),
        ]);

        if (active) {
          setPatternsData(patternsResponse);
          setSummary(summaryResponse);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load insights.");
          setPatternsData(null);
          setSummary(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadInsights();

    return () => {
      active = false;
    };
  }, [isSignedIn]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Sign in to refresh your insights.");
      }

      await analyzePatterns(token);
      const [patternsResponse, summaryResponse] = await Promise.all([
        getPatterns(token),
        getAnalyticsSummary(token),
      ]);
      setPatternsData(patternsResponse);
      setSummary(summaryResponse);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh your insights."
      );
    } finally {
      setRefreshing(false);
    }
  }

  if (!isSignedIn) {
    return (
      <section className="placeholder-grid">
        <article className="placeholder-card">
          <h2>Insights</h2>
          <p>Sign in from the popup to analyze patterns in your own trading data.</p>
        </article>
      </section>
    );
  }

  if (loading) {
    return <section className="insights-loading">Loading your insights...</section>;
  }

  const totalCompletedTrades = patternsData?.total_completed_trades ?? 0;
  const threshold = patternsData?.threshold ?? 20;
  const unlocked = patternsData?.unlocked ?? false;
  const progressPct = Math.min((totalCompletedTrades / threshold) * 100, 100);
  const patterns = sortPatterns(patternsData?.patterns ?? []);

  return (
    <section className="insights-root">
      {error ? <div className="connection-error-banner">{error}</div> : null}

      {!unlocked ? (
        <article className="insights-progress-card">
          <div className="insights-progress-icon">📊</div>
          <div className="insights-progress-copy">
            <h2>Insights unlock at {threshold} completed trades</h2>
            <p>
              Insights unlock at {threshold} trades - you have {totalCompletedTrades}/{threshold}.
            </p>
          </div>
          <div className="insights-progress-bar">
            <span style={{ width: `${progressPct}%` }} />
          </div>
          <p className="insights-progress-note">
            Import more trades via CSV or keep your broker tab open to auto-capture.
          </p>
        </article>
      ) : (
        <>
          <div className="insights-toolbar">
            <div>
              <h2 className="insights-heading">Behavioral Patterns</h2>
              <p className="insights-subcopy">
                Your data shows where your own execution patterns are helping or hurting.
              </p>
            </div>
            <button
              className="insights-refresh-button"
              disabled={refreshing}
              onClick={() => void handleRefresh()}
            >
              {refreshing ? "Refreshing..." : "Refresh Analysis"}
            </button>
          </div>

          {summary ? (
            <section className="insights-summary-grid">
              <article className="insights-summary-card">
                <span className="insights-summary-label">Completed trades</span>
                <strong>{summary.total_trades}</strong>
              </article>
              <article className="insights-summary-card">
                <span className="insights-summary-label">Win rate</span>
                <strong>{formatPercent(summary.win_rate)}</strong>
              </article>
              <article className="insights-summary-card">
                <span className="insights-summary-label">Total P&amp;L</span>
                <strong>{formatCurrency(summary.total_pnl)}</strong>
              </article>
              <article className="insights-summary-card">
                <span className="insights-summary-label">Avg/trade</span>
                <strong>{formatCurrency(summary.avg_pnl_per_trade)}</strong>
              </article>
            </section>
          ) : null}

          {summary?.monthly_pnl?.length ? (
            <article className="insights-monthly-card">
              <div className="insights-section-title">Monthly P&amp;L</div>
              <div className="insights-monthly-list">
                {summary.monthly_pnl.map((point) => (
                  <div key={point.month} className="insights-monthly-row">
                    <span>{point.month}</span>
                    <strong>{formatCurrency(point.pnl)}</strong>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          <div className="insights-pattern-list">
            {patterns.map((pattern) => {
              const isExpanded = expanded[pattern.pattern_type] ?? false;
              return (
                <article
                  key={pattern.pattern_type}
                  className={`insights-pattern-card${pattern.locked ? " is-locked" : ""}`}
                >
                  <div className="insights-pattern-content">
                    <div className="insights-pattern-header">
                      <span className="insights-pattern-severity">
                        {severityIcon(pattern.severity)}
                      </span>
                      <div className="insights-pattern-copy">
                        <h3>{pattern.title}</h3>
                        <p>{pattern.description}</p>
                      </div>
                    </div>

                    <button
                      className="insights-details-button"
                      onClick={() =>
                        setExpanded((current) => ({
                          ...current,
                          [pattern.pattern_type]: !isExpanded,
                        }))
                      }
                      disabled={pattern.locked}
                    >
                      {isExpanded ? "Hide details" : "View details"}
                    </button>

                    {isExpanded ? (
                      <div className="insights-details-grid">
                        {Object.entries(pattern.data ?? {}).map(([key, value]) => (
                          <div key={key} className="insights-detail-row">
                            <span>{key.replace(/_/g, " ")}</span>
                            <strong>{formatPatternStat(key, value)}</strong>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {pattern.locked ? (
                    <div className="insights-lock-overlay">
                      <span>🔒 Upgrade to Pro</span>
                      <button
                        className="pro-banner-button"
                        onClick={() => void chrome.tabs.create({ url: `${webAppUrl}/pricing` })}
                      >
                        Upgrade
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
