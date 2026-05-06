import type { AnalyticsSummaryResponse, MarketDashboardData, PatternsEnvelope } from "../shared/api";
import type { CaptureState } from "../shared/captures";
import type { User } from "../shared/types";
import {
  findPattern,
  formatCurrency,
  formatPercent,
  getCapturePerformanceStats,
  getCurrentHourBucket,
  getLeadingSector,
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
    return { text: "📈 WEEKEND · Review your week", tone: "neutral" };
  }
  if (session.kind === "pre-market") {
    return { text: "🟡 PRE-MARKET · Preparing for open", tone: "amber" };
  }
  if (session.kind === "post-market") {
    return { text: "📊 MARKET CLOSED · Review your day", tone: "neutral" };
  }
  if (tradeCount === 0) {
    return { text: "🟢 MARKET OPEN · Ready to trade", tone: "green" };
  }
  if (tradeCount > 4) {
    return { text: `🟠 HIGH ACTIVITY · ${tradeCount} trades today`, tone: "amber" };
  }
  return { text: `🟢 ACTIVE SESSION · ${tradeCount} trades today`, tone: "green" };
}

function getContextualInsight(args: {
  user: User | null;
  marketData: MarketDashboardData | null;
  captureState: CaptureState | null;
  patternsEnvelope: PatternsEnvelope | null | undefined;
}): string {
  const { user, marketData, captureState, patternsEnvelope } = args;
  const session = getSessionContext();
  const captureStats = getCapturePerformanceStats(captureState);
  const patterns = patternsEnvelope?.unlocked ? patternsEnvelope.patterns : [];

  if (user && patterns.length > 0) {
    const timePattern = findPattern(patterns, "time_of_day");
    const currentBucket = getCurrentHourBucket(session);
    if (timePattern && String(timePattern.data.worst_bucket ?? "") === currentBucket) {
      return `Your data shows win rate drops during ${currentBucket}. Consider reduced sizing.`;
    }

    const overtradingPattern = findPattern(patterns, "overtrading");
    const threshold = getOvertradingThreshold(overtradingPattern);
    if (overtradingPattern && threshold && captureStats.tradeCount > threshold) {
      return `You've taken ${captureStats.tradeCount} trades today. Your win rate historically drops after ${threshold}.`;
    }

    const revengePattern = findPattern(patterns, "revenge_trading");
    if (revengePattern && captureStats.quickReentryAfterLoss) {
      return `Consecutive entries after a loss. Your revenge trade win rate is ${formatPercent(Number(revengePattern.data.revenge_trade_win_rate ?? 0), 0)}.`;
    }
  }

  if (marketData) {
    const vix = marketData.vix?.value ?? null;
    if (vix != null && vix > 20) {
      return `High volatility session. VIX is at ${vix.toFixed(1)}.`;
    }
    if (marketData.regime.nifty_trend === "Bearish") {
      return `Weak market breadth. ${marketData.regime.breadth.pct_advancing}% of stocks are advancing.`;
    }
    if (marketData.regime.nifty_trend === "Bullish") {
      const leader = getLeadingSector(marketData);
      return leader
        ? `Strong momentum. ${leader.sector} is leading today.`
        : "Strong momentum is showing across the tape.";
    }
  }

  if (session.kind === "weekend") {
    return "Good time to review your weekly performance.";
  }
  if (session.kind === "pre-market") {
    return "Check global cues and plan your setups.";
  }
  if (session.kind === "post-market") {
    return "Review patterns in the Insights tab.";
  }
  return "Extension is capturing trades automatically.";
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
      text: "⚡ Upgrade to Pro for behavioral insights",
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
      text: "⚠️ Check Insights tab for risk alerts",
    };
  }

  const totalKnownTrades = summary?.total_trades ?? patternsEnvelope?.total_completed_trades ?? 0;
  if (totalKnownTrades === 0 && captureStats.tradeCount === 0) {
    return {
      kind: "link",
      text: "📝 Open your broker to start auto-capturing",
      href: "/download",
    };
  }

  if (getSessionContext().kind === "post-market") {
    return {
      kind: "link",
      text: "📊 View full analytics on dashboard",
      href: "/dashboard/analytics",
    };
  }

  return null;
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
  const captureStats = getCapturePerformanceStats(captureState);
  const badge = getBadge(user, captureStats.tradeCount);
  const metrics = getMetricsLine({ captureState, summary: analyticsSummary });
  const action = getAction({
    user,
    patternsEnvelope,
    captureState,
    summary: analyticsSummary,
  });

  return (
    <section className="trader-pulse">
      <div className={`pulse-state-badge state-${badge.tone}`}>{badge.text}</div>

      <p className="pulse-insight">
        {getContextualInsight({ user, marketData, captureState, patternsEnvelope })}
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
