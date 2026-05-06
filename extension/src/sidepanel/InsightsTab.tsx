import { useEffect, useState } from "react";

import {
  analyzePatterns,
  getAnalyticsSummary,
  getPatterns,
  type AnalyticsSummaryResponse,
  type PatternResponse,
  type PatternsEnvelope,
} from "../shared/api";
import { getAuthToken } from "../shared/auth";
import { storageGet, storageSet } from "../shared/chrome";
import SkeletonLine from "./SkeletonLine";

const CACHED_INSIGHTS_PATTERNS_KEY = "cachedInsightsPatterns";
const CACHED_INSIGHTS_SUMMARY_KEY = "cachedInsightsSummary";

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
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
      return "🟠";
    default:
      return "🟢";
  }
}

function severityBorderColor(severity: string): string {
  switch (severity) {
    case "high":
      return "#ef4444";
    case "medium":
      return "#f59e0b";
    default:
      return "#10b981";
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

function getConfidenceMeta(pattern: PatternResponse) {
  const sampleSize = Number(pattern.data?.sample_size ?? 0);
  if (sampleSize > 30) {
    return {
      className: "confidence-high",
      text: `High confidence · ${sampleSize} trades analyzed`,
    };
  }
  if (sampleSize >= 20) {
    return {
      className: "confidence-moderate",
      text: `Moderate confidence · ${sampleSize} trades`,
    };
  }
  return {
    className: "confidence-low",
    text: `Low sample size · ${sampleSize} trades — pattern may change`,
  };
}

function estimateImpact(
  pattern: PatternResponse,
  summary: AnalyticsSummaryResponse | null
): { amount: number; text: string } | null {
  const sampleSize = Number(pattern.data?.sample_size ?? 0);
  const avgPnl = summary?.avg_pnl_per_trade ?? 0;

  switch (pattern.pattern_type) {
    case "revenge_trading": {
      const pnl = Number(pattern.data?.revenge_trade_pnl ?? NaN);
      if (!Number.isFinite(pnl)) return null;
      return { amount: pnl, text: `Estimated monthly impact: ${formatCurrency(pnl)}` };
    }
    case "time_of_day": {
      const gap =
        Number(pattern.data?.best_win_rate ?? 0) - Number(pattern.data?.worst_win_rate ?? 0);
      if (!Number.isFinite(gap) || !Number.isFinite(avgPnl)) return null;
      const saved = Math.max(0, gap * Math.max(Math.abs(avgPnl), 1) * Math.max(sampleSize, 1));
      return {
        amount: saved,
        text: `If you had avoided your worst hours, you would have saved approximately ${formatCurrency(saved)}`,
      };
    }
    case "holding_period": {
      const diff =
        Number(pattern.data?.best_avg_pnl ?? 0) - Number(pattern.data?.worst_avg_pnl ?? 0);
      if (!Number.isFinite(diff)) return null;
      const amount = diff * Math.max(1, sampleSize / 6);
      return { amount, text: `Estimated monthly impact: ${formatCurrency(amount)}` };
    }
    case "overtrading": {
      const gap =
        Number(pattern.data?.normal_day_win_rate ?? 0) -
        Number(pattern.data?.high_volume_day_win_rate ?? 0);
      if (!Number.isFinite(gap)) return null;
      const amount = -Math.abs(gap * Math.max(Math.abs(avgPnl), 1) * Math.max(sampleSize, 1));
      return { amount, text: `Estimated monthly impact: ${formatCurrency(amount)}` };
    }
    case "losing_streak_tilt": {
      const diff =
        Number(pattern.data?.post_streak_avg_pnl ?? 0) -
        Number(pattern.data?.overall_avg_pnl ?? 0);
      if (!Number.isFinite(diff)) return null;
      const amount = diff * Math.max(1, sampleSize / 3);
      return { amount, text: `Estimated monthly impact: ${formatCurrency(amount)}` };
    }
    case "winning_streak_tilt": {
      const gap =
        Number(pattern.data?.overall_win_rate ?? 0) -
        Number(pattern.data?.post_streak_win_rate ?? 0);
      if (!Number.isFinite(gap)) return null;
      const amount = -Math.abs(gap * Math.max(Math.abs(avgPnl), 1) * Math.max(sampleSize, 1));
      return { amount, text: `Estimated monthly impact: ${formatCurrency(amount)}` };
    }
    case "sector_concentration": {
      const diff =
        Number(pattern.data?.sector_avg_pnl ?? 0) - Number(pattern.data?.overall_avg_pnl ?? 0);
      if (!Number.isFinite(diff)) return null;
      const amount = diff * Math.max(1, sampleSize / 4);
      return { amount, text: `Estimated monthly impact: ${formatCurrency(amount)}` };
    }
    case "day_of_week": {
      const gap =
        Number(pattern.data?.best_win_rate ?? 0) - Number(pattern.data?.worst_win_rate ?? 0);
      if (!Number.isFinite(gap)) return null;
      const amount = gap * Math.max(Math.abs(avgPnl), 1) * Math.max(sampleSize / 2, 1);
      return { amount, text: `Estimated monthly impact: ${formatCurrency(amount)}` };
    }
    default:
      return null;
  }
}

function getRecommendation(pattern: PatternResponse): string {
  switch (pattern.pattern_type) {
    case "time_of_day":
      return `Consider reducing position size during ${String(pattern.data?.worst_bucket ?? "weaker hours")} or limiting trades to ${String(pattern.data?.best_bucket ?? "your stronger hours")}.`;
    case "day_of_week":
      return `Your data suggests ${String(pattern.data?.best_bucket ?? "some weekdays")} are stronger. Consider being more selective on ${String(pattern.data?.worst_bucket ?? "weaker days")}.`;
    case "holding_period":
      return `Your most profitable trades are held for ${String(pattern.data?.best_bucket ?? "your strongest bucket")}. Consider adjusting your holding strategy.`;
    case "revenge_trading":
      return "After a loss, consider waiting at least 30 minutes before entering a new trade.";
    case "overtrading":
      return "On days with elevated trade count, your profitability drops significantly. Consider setting a daily trade limit.";
    case "sector_concentration":
      return "Diversifying across sectors could reduce your concentration risk.";
    case "winning_streak_tilt":
      return "After winning streaks, consider maintaining your normal position size instead of increasing it.";
    case "losing_streak_tilt":
      return "During losing streaks, your data shows losses compound. Consider reducing size or taking a break.";
    default:
      return "Your data suggests a repeatable pattern here. Consider tracking it more closely in your journal.";
  }
}

function getWeeklyFocusCopy(pattern: PatternResponse): string | null {
  switch (pattern.pattern_type) {
    case "time_of_day":
      return `Limit entries during ${String(pattern.data?.worst_bucket ?? "your weaker hours")}.`;
    case "day_of_week":
      return `Be more selective on ${String(pattern.data?.worst_bucket ?? "weaker days")}.`;
    case "revenge_trading":
      return "After a loss, wait 30 minutes.";
    case "overtrading": {
      const threshold = Math.max(
        1,
        Math.ceil(Number(pattern.data?.average_trades_per_day ?? 2) * 2)
      );
      return `Max ${threshold} trades per day.`;
    }
    case "sector_concentration":
      return `Look for setups outside ${String(pattern.data?.sector ?? "one concentrated sector")}.`;
    case "holding_period":
      return `Target ${String(pattern.data?.best_bucket ?? "your strongest")} hold times.`;
    case "winning_streak_tilt":
      return "After 3 wins, keep normal sizing.";
    case "losing_streak_tilt":
      return "After 2 losses, halve your size.";
    default:
      return null;
  }
}

function InsightsSkeleton() {
  return (
    <section className="insights-root" aria-hidden="true">
      {Array.from({ length: 2 }).map((_, index) => (
        <article key={index} className="insights-pattern-card">
          <div className="insights-pattern-content">
            <SkeletonLine width="42%" height="16px" />
            <SkeletonLine width="92%" height="12px" />
            <SkeletonLine width="76%" height="12px" />
          </div>
        </article>
      ))}
    </section>
  );
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

      const [cachedPatterns, cachedSummary] = await Promise.all([
        storageGet<PatternsEnvelope>(CACHED_INSIGHTS_PATTERNS_KEY).catch(() => null),
        storageGet<AnalyticsSummaryResponse>(CACHED_INSIGHTS_SUMMARY_KEY).catch(() => null),
      ]);
      if (!active) return;
      if (cachedPatterns) setPatternsData(cachedPatterns);
      if (cachedSummary) setSummary(cachedSummary);
      setLoading(!cachedPatterns);

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
        void storageSet(CACHED_INSIGHTS_PATTERNS_KEY, patternsResponse).catch(() => undefined);
        void storageSet(CACHED_INSIGHTS_SUMMARY_KEY, summaryResponse).catch(() => undefined);
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
      void storageSet(CACHED_INSIGHTS_PATTERNS_KEY, patternsResponse).catch(() => undefined);
      void storageSet(CACHED_INSIGHTS_SUMMARY_KEY, summaryResponse).catch(() => undefined);
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
    return <InsightsSkeleton />;
  }

  const totalCompletedTrades = patternsData?.total_completed_trades ?? 0;
  const threshold = patternsData?.threshold ?? 20;
  const unlocked = patternsData?.unlocked ?? false;
  const progressPct = Math.min((totalCompletedTrades / threshold) * 100, 100);
  const patterns = sortPatterns(patternsData?.patterns ?? []);
  const weeklyFocusItems = patterns
    .filter((pattern) => !pattern.locked)
    .map((pattern) => ({
      severityOrder: pattern.severity === "high" ? 0 : pattern.severity === "medium" ? 1 : 2,
      text: getWeeklyFocusCopy(pattern),
    }))
    .filter((item): item is { severityOrder: number; text: string } => Boolean(item.text))
    .sort((a, b) => a.severityOrder - b.severityOrder)
    .map((item) => item.text)
    .slice(0, 3);

  return (
    <section className="insights-root">
      {error ? <div className="connection-error-banner">{error}</div> : null}

      {!unlocked ? (
        <article className="insights-progress-card">
          <div className="insights-progress-icon">📊</div>
          <div className="insights-progress-copy">
            <h2>Insights unlock at {threshold} completed trades</h2>
            <p>
              Insights unlock at {threshold} trades. You have {totalCompletedTrades}/{threshold}.
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
          {weeklyFocusItems.length ? (
            <section className="weekly-focus-card">
              <div className="weekly-focus-title">📋 This Week&apos;s Focus</div>
              <div>
                {weeklyFocusItems.map((item) => (
                  <div key={item} className="weekly-focus-item">
                    {item}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

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
              const confidence = getConfidenceMeta(pattern);
              const impact = estimateImpact(pattern, summary);

              return (
                <article
                  key={pattern.pattern_type}
                  className={`insights-pattern-card${pattern.locked ? " is-locked" : ""}`}
                  style={{ borderLeft: `4px solid ${severityBorderColor(pattern.severity)}` }}
                >
                  <div className="insights-pattern-content">
                    <div className="insights-pattern-header">
                      <span className="insights-pattern-severity">
                        {severityIcon(pattern.severity)}
                      </span>
                      <div className="insights-pattern-copy">
                        <div className="insights-pattern-title-row">
                          <h3>{pattern.title}</h3>
                          <span className={`insight-confidence ${confidence.className}`}>
                            {confidence.text}
                          </span>
                        </div>
                        <p>{pattern.description}</p>
                      </div>
                    </div>

                    {impact ? (
                      <div className={`insight-impact ${impact.amount >= 0 ? "impact-positive" : "impact-negative"}`}>
                        {impact.text}
                      </div>
                    ) : null}

                    <div className="insight-recommendation">
                      <span>💡</span>
                      <span>{getRecommendation(pattern)}</span>
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
