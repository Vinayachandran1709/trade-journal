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

function getTopPatternLine(patternsEnvelope: PatternsEnvelope | null | undefined): { label: string; href: string } | null {
  const patterns = patternsEnvelope?.unlocked ? patternsEnvelope.patterns.filter((pattern) => !pattern.locked) : [];
  if (!patterns.length) return null;

  const riskPattern = patterns.find((pattern) =>
    ["revenge_trading", "overtrading", "losing_streak_tilt", "time_of_day"].includes(pattern.pattern_type)
  );
  if (riskPattern) {
    return {
      label: `Top risk: ${riskPattern.title}`,
      href: "/dashboard/mistakes",
    };
  }

  return {
    label: `Top edge: ${patterns[0].title}`,
    href: "/dashboard/analytics#patterns",
  };
}

function openWebPath(path: string) {
  void chrome.tabs.create({ url: `${WEB_APP_URL}${path}` });
}

function getBadge(
  user: User | null,
  tradeCount: number,
  marketData: MarketDashboardData | null,
  patterns: PatternsEnvelope | null | undefined,
  captureState: CaptureState | null
): { text: string; tone: PulseBadgeTone } {
  if (!user) return { text: "INDIACIRCLE", tone: "neutral" };

  const session = getSessionContext();
  if (session.kind === "weekend") return { text: "WEEKEND · Review your week", tone: "neutral" };
  if (session.kind === "post-market") return { text: "SESSION CLOSED · Review your day", tone: "neutral" };

  const activePatterns = patterns?.unlocked ? patterns.patterns : [];
  const overtradingPattern = findPattern(activePatterns, "overtrading");
  const threshold = getOvertradingThreshold(overtradingPattern);
  if (threshold && tradeCount >= threshold + 2) {
    return { text: "TILT RISK DETECTED", tone: "red" };
  }
  if (threshold && tradeCount >= threshold) {
    return { text: "OVERTRADING RISK", tone: "amber" };
  }

  const captureStats = getCapturePerformanceStats(captureState);
  if (captureStats.losingStreakCount >= 3) {
    return { text: "TILT RISK · LOSING STREAK", tone: "red" };
  }
  if (captureStats.losingStreakCount >= 2) {
    return { text: "CAUTION · CONSECUTIVE LOSSES", tone: "amber" };
  }

  if (session.kind === "pre-market") {
    return { text: "PRE-MARKET · PREPARING FOR OPEN", tone: "amber" };
  }

  if (marketData?.regime) {
    const vix = marketData.vix?.value ?? 15;
    const advPct = marketData.regime.breadth?.pct_advancing ?? 50;
    const niftyChange = Math.abs(marketData.indices?.nifty_50?.change_pct ?? 0);

    if (vix > 22) return { text: "HIGH VOLATILITY SESSION", tone: "amber" };
    if (niftyChange > 1.2 && advPct > 55) return { text: "STRONG TREND DAY", tone: "green" };
    if (niftyChange > 0.5 && advPct > 50) return { text: "MOMENTUM SESSION", tone: "green" };
    if (niftyChange < 0.3 && advPct > 40 && advPct < 60) {
      return { text: "RANGE-BOUND · LOW CONVICTION", tone: "amber" };
    }
    if (advPct < 35) return { text: "WEAK BREADTH · SELECTIVE MARKET", tone: "amber" };
    if (niftyChange > 0.8 && advPct < 40) {
      return { text: "NARROW RALLY · FEW STOCKS DRIVING", tone: "amber" };
    }
  }

  if (tradeCount > 0 && captureStats.winRate != null && captureStats.winRate > 0.7) {
    return { text: "CONTROLLED SESSION", tone: "green" };
  }
  if (tradeCount > 0) {
    return { text: `ACTIVE · ${tradeCount} TRADES TODAY`, tone: "green" };
  }

  return { text: "MARKET OPEN · SCANNING", tone: "green" };
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
    const leadingSectors = [sorted[0]?.[0], sorted[1]?.[0]].filter(Boolean).join(" and ");

    if (nifty_trend === "Bullish" && advPct > 50) {
      lines.push(
        `${leadingSectors || "Financials and IT"} driving momentum. Trend-continuation setups have room.`
      );
    } else if (nifty_trend === "Bullish" && advPct <= 40) {
      lines.push(`Index is green but only ${advPct}% stocks advancing. Narrow rally — be selective.`);
    } else if (nifty_trend === "Bearish") {
      lines.push("Selling pressure building. Your data shows tighter stops help on weak-breadth days.");
    } else {
      lines.push(
        "Rangebound conditions. Your breakout setups historically underperform in chop — favor mean-reversion."
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
  return lines[0] ?? "Your market context is ready. Watch for where your behavior and the tape line up.";
}

function generatePulseAction(
  marketData: MarketDashboardData | null,
  patterns: PatternsEnvelope | null | undefined,
  captureState: CaptureState | null
): string | null {
  const activePatterns = patterns?.unlocked ? patterns.patterns : [];
  const captureStats = getCapturePerformanceStats(captureState);
  const session = getSessionContext();
  const hour = new Date().getHours();

  const todPattern = findPattern(activePatterns, "time_of_day");
  if (todPattern?.data) {
    const bucketHour = parseBucketHour(todPattern.data.worst_bucket);
    if (bucketHour != null && Math.abs(hour - bucketHour) <= 1) {
      return `⚠️ Reduce activity during ${String(todPattern.data.worst_bucket)} — your weakest window.`;
    }
  }

  if (captureStats.losingStreakCount >= 2) {
    return "⚠️ Pause before the next entry. Losses tend to compound during streaks.";
  }

  const threshold = getOvertradingThreshold(findPattern(activePatterns, "overtrading"));
  if (threshold && captureStats.tradeCount >= threshold) {
    return `⚠️ Consider stopping at ${threshold} trades. Win rate drops sharply beyond this.`;
  }

  if (marketData?.vix?.value && marketData.vix.value > 20) {
    return "⚠️ Elevated volatility — prefer smaller positions today.";
  }

  const advPct = marketData?.regime?.breadth?.pct_advancing ?? 50;
  if (advPct < 35) {
    return "⚠️ Weak breadth — avoid chasing breakouts in thin participation.";
  }

  if (session.kind === "post-market") {
    return "📊 Review today's trades in the Journal tab.";
  }

  const sectors = Object.entries(marketData?.sector_performance ?? {}).sort(
    (a, b) => (b[1]?.change_pct ?? 0) - (a[1]?.change_pct ?? 0)
  );
  const leading = sectors[0];
  if (leading && (leading[1]?.change_pct ?? 0) > 1) {
    return `✅ ${leading[0]} showing strength. Momentum setups may get follow-through.`;
  }

  return null;
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
      {
        label: "Total P&L",
        value: `₹${formatCurrency(args.summary.total_pnl)}`,
        tone: args.summary.total_pnl >= 0 ? "positive" : "negative",
      },
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
  if (
    (threshold && captureStats.tradeCount > threshold) ||
    (losingPattern && captureStats.losingStreakCount >= 2)
  ) {
    return { kind: "link", text: "Review top risk on dashboard", href: "/dashboard/mistakes" };
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
      text: "Open patterns on dashboard",
      href: "/dashboard/analytics#patterns",
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
}): Set<string> {
  if (Array.isArray(args.marketData?.personalized?.recent_symbols)) {
    return new Set(
      args.marketData.personalized.recent_symbols
        .filter((symbol): symbol is string => typeof symbol === "string")
        .map((symbol) => symbol.toUpperCase())
    );
  }

  const symbols = new Set<string>();
  const trades = Array.isArray(args.captureState?.trades) ? args.captureState.trades : [];
  for (const trade of trades) {
    if (trade.stock_symbol) {
      symbols.add(trade.stock_symbol.toUpperCase());
    }
  }
  return symbols;
}

function isFutureEarningsEvent(value: string): boolean {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(value);
  if (!Number.isFinite(eventDate.getTime())) {
    return false;
  }
  return eventDate >= today;
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
  const badge = getBadge(user, captureStats.tradeCount, marketData, patternsEnvelope, captureState);
  const metrics = getMetricsLine({ captureState, summary: analyticsSummary });
  const pulseAction = generatePulseAction(marketData, patternsEnvelope, captureState);
  const topPatternLine = getTopPatternLine(patternsEnvelope);
  const action = getAction({
    user,
    patternsEnvelope,
    captureState,
    summary: analyticsSummary,
  });
  const recentSymbols = useMemo(
    () => getRecentSymbols({ captureState, marketData }),
    [captureState, marketData]
  );
  const earningsAlert = useMemo(
    () =>
      earningsEvents
        .filter(
          (event) =>
            event.symbol &&
            isFutureEarningsEvent(event.date) &&
            recentSymbols.has(event.symbol.toUpperCase())
        )
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
        {generatePulseInsight(marketData, patternsEnvelope, captureState, new Date().getHours())}
      </p>

      {pulseAction ? (
        <p
          className={`pulse-action-line ${pulseAction.startsWith("⚠️") ? "pulse-warning" : "pulse-positive"}`}
        >
          {pulseAction}
        </p>
      ) : null}

      {topPatternLine ? (
        <div className="pulse-action">
          <a
            href={`${WEB_APP_URL}${topPatternLine.href}`}
            onClick={(event) => {
              event.preventDefault();
              openWebPath(topPatternLine.href);
            }}
          >
            {topPatternLine.label}
          </a>
        </div>
      ) : null}

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
