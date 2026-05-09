import { useEffect, useMemo, useState } from "react";

import {
  fetchMarketEarnings,
  type AnalyticsSummaryResponse,
  type EarningsEvent,
  type MarketDashboardData,
  type PatternsEnvelope,
} from "../shared/api";
import type { CaptureState } from "../shared/captures";
import type { User } from "../shared/types";
import {
  findPattern,
  formatCurrency,
  formatPercent,
  getCapturePerformanceStats,
  getOvertradingThreshold,
  getSessionContext,
  type PulseBadgeTone,
} from "./behavioral";

const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL || "https://indiacircle.in").replace(/\/$/, "");

type PulseAction = {
  kind: "link" | "warning";
  text: string;
  href?: string;
};

function openWebPath(path: string) {
  void chrome.tabs.create({ url: `${WEB_APP_URL}${path}` });
}

function getBadge(user: User | null, tradeCount: number): { text: string; tone: PulseBadgeTone } {
  if (!user) {
    return { text: "INDIACIRCLE", tone: "neutral" };
  }

  const session = getSessionContext();
  if (session.kind === "weekend") {
    return { text: "WEEKEND · Review your week", tone: "neutral" };
  }
  if (session.kind === "pre-market") {
    return { text: "PRE-MARKET · Preparing for open", tone: "amber" };
  }
  if (session.kind === "post-market") {
    return { text: "MARKET CLOSED · Review your day", tone: "neutral" };
  }
  if (tradeCount === 0) {
    return { text: "MARKET OPEN · Ready to trade", tone: "green" };
  }
  if (tradeCount > 4) {
    return { text: `HIGH ACTIVITY · ${tradeCount} trades today`, tone: "amber" };
  }
  return { text: `ACTIVE SESSION · ${tradeCount} trades today`, tone: "green" };
}

function parsePatternPercent(value: unknown): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric > 1 ? numeric : numeric * 100;
}

function parseBucketHour(bucket: unknown): number | null {
  const text = String(bucket ?? "");
  const bucketHour = parseInt(text.split(/[-: ]/)[0], 10);
  if (!Number.isFinite(bucketHour)) return null;
  return bucketHour < 12 && /\bPM\b/i.test(text) ? bucketHour + 12 : bucketHour;
}

function generatePulseInsight(
  marketData: MarketDashboardData | null,
  patterns: PatternsEnvelope | null | undefined,
  captureState: CaptureState | null,
  currentHour: number
): string {
  const lines: string[] = [];

  if (marketData?.regime) {
    const { nifty_trend, breadth } = marketData.regime;
    const advPct = breadth?.pct_advancing ?? 50;
    const sectors = Object.entries(marketData.sector_performance ?? {});
    const sorted = [...sectors].sort(
      (left, right) => (right[1]?.change_pct ?? 0) - (left[1]?.change_pct ?? 0)
    );
    const strongest = sorted[0];
    const weakest = sorted[sorted.length - 1];

    if (nifty_trend === "Bullish" && advPct > 50) {
      lines.push(
        `${strongest?.[0] ?? "Financials"} leading with broad participation. Momentum setups may get follow-through.`
      );
    } else if (nifty_trend === "Bullish" && advPct <= 40) {
      lines.push(`Index is green but only ${advPct}% stocks advancing. Narrow rally — be selective.`);
    } else if (nifty_trend === "Bearish") {
      lines.push(
        `Weakness in ${weakest?.[0] ?? "broader market"}. Breadth is poor at ${advPct}% advancing.`
      );
    } else {
      lines.push(
        `Rangebound session. ${strongest?.[0] ?? "Select sectors"} showing relative strength.`
      );
    }
  }

  const activePatterns = patterns?.unlocked ? patterns.patterns : [];
  if (activePatterns.length) {
    const todPattern = activePatterns.find((pattern) => pattern.pattern_type === "time_of_day");
    const bucketHour = parseBucketHour(todPattern?.data?.worst_bucket);
    if (todPattern?.data && bucketHour != null && Math.abs(currentHour - bucketHour) <= 1) {
      lines.push(
        `⚠️ Entering your historically weak window. Win rate drops to ${Math.round(
          parsePatternPercent(todPattern.data.worst_win_rate)
        )}% around this time.`
      );
    }

    const overtradingPattern = activePatterns.find(
      (pattern) => pattern.pattern_type === "overtrading"
    );
    const captureStats = getCapturePerformanceStats(captureState);
    const threshold = getOvertradingThreshold(overtradingPattern ?? null);
    if (overtradingPattern?.data && threshold && captureStats.tradeCount >= threshold) {
      lines.push(
        `⚠️ ${captureStats.tradeCount} trades today — your win rate drops on high-activity days.`
      );
    }
  }

  const warningLines = lines.filter((line) => line.startsWith("⚠️"));
  if (warningLines.length > 0) return warningLines[0];
  return lines[0] ?? "Extension is tracking your trades automatically.";
}

function getMetricsLine(args: {
  captureState: CaptureState | null;
  summary: AnalyticsSummaryResponse | null | undefined;
}): Array<{ label: string; value: string; tone?: "positive" | "negative" }> {
  const captureStats = getCapturePerformanceStats(args.captureState);
  if (captureStats.tradeCount > 0) {
    const pnl = captureStats.realizedPnl;
    return [
      {
        label: "P&L",
        value: pnl == null ? "Pending" : `₹${formatCurrency(pnl)}`,
        tone: pnl == null ? undefined : pnl >= 0 ? "positive" : "negative",
      },
      { label: "Trades", value: String(captureStats.tradeCount) },
      {
        label: "Win",
        value: captureStats.winRate == null ? "--" : formatPercent(captureStats.winRate, 0),
      },
    ];
  }

  if (args.summary && args.summary.total_trades > 0) {
    return [
      { label: "Total P&L", value: `₹${formatCurrency(args.summary.total_pnl)}`, tone: args.summary.total_pnl >= 0 ? "positive" : "negative" },
      { label: "Win Rate", value: formatPercent(args.summary.win_rate, 0) },
      { label: "Trades", value: String(args.summary.total_trades) },
    ];
  }

  return [];
}

function getAction(args: {
  user: User | null;
  patternsEnvelope: PatternsEnvelope | null | undefined;
  captureState: CaptureState | null;
  summary: AnalyticsSummaryResponse | null | undefined;
}): PulseAction | null {
  const { user, patternsEnvelope, captureState, summary } = args;
  if (!user) {
    return null;
  }

  const hasPaidPlan = user.subscription_status?.startsWith("pro") ?? false;
  if (!hasPaidPlan) {
    return {
      kind: "link",
      text: "Upgrade to Pro for behavioral insights",
      href: "/pricing",
    };
  }

  const captureStats = getCapturePerformanceStats(captureState);
  const patterns = patternsEnvelope?.unlocked ? patternsEnvelope.patterns : [];
  const overtradingPattern = findPattern(patterns, "overtrading");
  const losingPattern = findPattern(patterns, "losing_streak_tilt");
  const threshold = getOvertradingThreshold(overtradingPattern);
  if ((threshold && captureStats.tradeCount > threshold) || (losingPattern && captureStats.losingStreakCount >= 2)) {
    return {
      kind: "warning",
      text: "Check Insights tab for risk alerts",
    };
  }

  const totalKnownTrades = summary?.total_trades ?? patternsEnvelope?.total_completed_trades ?? 0;
  if (totalKnownTrades === 0 && captureStats.tradeCount === 0) {
    return {
      kind: "link",
      text: "Open your broker to start auto-capturing",
      href: "/download",
    };
  }

  if (getSessionContext().kind === "post-market") {
    return {
      kind: "link",
      text: "View full analytics on dashboard",
      href: "/dashboard/analytics",
    };
  }

  return null;
}

function parseEventDate(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function getRecentSymbols(args: {
  captureState: CaptureState | null;
  marketData: MarketDashboardData | null;
  analyticsSummary: AnalyticsSummaryResponse | null | undefined;
}): Set<string> {
  const symbols = new Set<string>();
  for (const trade of args.captureState?.trades ?? []) {
    symbols.add(trade.stock_symbol.toUpperCase());
  }
  for (const symbol of args.marketData?.personalized?.recent_symbols ?? []) {
    symbols.add(symbol.toUpperCase());
  }
  if (args.analyticsSummary?.most_traded_symbol) {
    symbols.add(args.analyticsSummary.most_traded_symbol.toUpperCase());
  }
  return symbols;
}

export default function TraderPulse({
  user,
  marketData,
  captureState,
  patternsEnvelope,
  analyticsSummary,
}: {
  user: User | null;
  marketData: MarketDashboardData | null;
  captureState: CaptureState | null;
  patternsEnvelope?: PatternsEnvelope | null;
  analyticsSummary?: AnalyticsSummaryResponse | null;
}) {
  const [earningsEvents, setEarningsEvents] = useState<EarningsEvent[]>([]);
  const captureStats = getCapturePerformanceStats(captureState);
  const badge = getBadge(user, captureStats.tradeCount);
  const metrics = getMetricsLine({ captureState, summary: analyticsSummary });
  const action = getAction({
    user,
    patternsEnvelope,
    captureState,
    summary: analyticsSummary,
  });
  const recentSymbols = useMemo(
    () => getRecentSymbols({ captureState, marketData, analyticsSummary }),
    [analyticsSummary, captureState, marketData]
  );
  const earningsAlert = useMemo(
    () =>
      earningsEvents
        .filter((event) => event.symbol && recentSymbols.has(event.symbol.toUpperCase()))
        .sort((left, right) => parseEventDate(left.date) - parseEventDate(right.date))[0] ?? null,
    [earningsEvents, recentSymbols]
  );

  useEffect(() => {
    let active = true;
    fetchMarketEarnings()
      .then((response) => {
        if (active) {
          setEarningsEvents(response.upcoming ?? []);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="trader-pulse">
      <div className={`pulse-state-badge state-${badge.tone}`}>{badge.text}</div>

      <p className="pulse-insight">
        {generatePulseInsight(
          marketData,
          patternsEnvelope,
          captureState,
          new Date().getHours()
        )}
      </p>

      {metrics.length > 0 ? (
        <div className="pulse-metrics">
          {metrics.map((metric, index) => (
            <span key={metric.label}>
              <span>{metric.label} </span>
              <span className={metric.tone ? `value-${metric.tone}` : undefined}>{metric.value}</span>
              {index < metrics.length - 1 ? <span className="sep"> · </span> : null}
            </span>
          ))}
        </div>
      ) : null}

      {earningsAlert?.symbol ? (
        <div className="pulse-earnings-alert">
          📅 {earningsAlert.symbol} results expected soon
        </div>
      ) : null}

      {action ? (
        <div className="pulse-action">
          {action.kind === "link" && action.href ? (
            <a
              href={`${WEB_APP_URL}${action.href}`}
              onClick={(event) => {
                event.preventDefault();
                openWebPath(action.href!);
              }}
            >
              {action.text}
            </a>
          ) : (
            <span className="warning">{`Risk score: ${action.text}`}</span>
          )}
        </div>
      ) : null}
    </section>
  );
}
