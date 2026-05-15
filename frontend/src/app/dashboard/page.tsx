"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import {
  getAnalyticsSummary,
  getPatterns,
  type AnalyticsSummaryResponse,
  type PatternResponse,
  type PatternsEnvelope,
} from "@/lib/analytics";
import { getMe } from "@/lib/auth";
import {
  exportCompletedTradesCSV,
  getCompletedTrades,
  getTrades,
  getTradeSetups,
} from "@/lib/trades";
import type { CompletedTrade, Trade, TradeSetup } from "@/types/trade";
import type { User } from "@/types/user";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const DAY_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
});

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatCurrency(value: number | null | undefined): string {
  const amount = toNumber(value) ?? 0;
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number | null | undefined): string {
  const amount = toNumber(value);
  if (amount == null) {
    return "0.0%";
  }
  return `${(amount * 100).toFixed(1)}%`;
}

function formatSignedCurrency(value: number | null | undefined): string {
  const amount = toNumber(value) ?? 0;
  return `${amount >= 0 ? "+" : "-"}${formatCurrency(Math.abs(amount))}`;
}

function emotionClass(emotion?: string | null) {
  const value = (emotion || "").toLowerCase();
  if (value.includes("confident") || value.includes("calm")) return "badge-emerald";
  if (
    value.includes("fear") ||
    value.includes("revenge") ||
    value.includes("fomo") ||
    value.includes("greed")
  ) {
    return "badge-rose";
  }
  return "badge-indigo";
}

function emotionLabel(emotion?: string | null) {
  const value = (emotion || "").trim();
  if (!value) return "No tag";
  const normalized = value.toLowerCase();
  if (normalized.includes("confident")) return "😎 Confident";
  if (normalized.includes("revenge")) return "😤 Revenge";
  if (normalized.includes("fomo")) return "😬 FOMO";
  if (normalized.includes("fear")) return "😟 Fear";
  if (normalized.includes("calm")) return "😌 Calm";
  if (normalized.includes("greed")) return "🫠 Greed";
  return value;
}

function pnlClass(value: number) {
  return (toNumber(value) ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600";
}

function getPattern(patterns: PatternResponse[], patternType: string): PatternResponse | null {
  return patterns.find((pattern) => pattern.pattern_type === patternType && !pattern.locked) ?? null;
}

function currentMonthPnl(summary: AnalyticsSummaryResponse | null) {
  const monthly = summary?.monthly_pnl ?? [];
  if (!monthly.length) {
    return { current: 0, previous: 0 };
  }
  const current = monthly[monthly.length - 1]?.pnl ?? 0;
  const previous = monthly[monthly.length - 2]?.pnl ?? 0;
  return { current, previous };
}

function getConsistencyScore(summary: AnalyticsSummaryResponse | null): number {
  const months = summary?.monthly_pnl ?? [];
  if (!months.length) {
    return 10;
  }
  const positiveCount = months.filter((point) => point.pnl > 0).length;
  if (positiveCount === months.length) return 20;
  if (positiveCount >= Math.ceil(months.length / 2)) return 15;
  if (positiveCount > 0) return 10;
  return 5;
}

function getPerformanceScore(summary: AnalyticsSummaryResponse | null, rawTrades: Trade[]): number {
  if (!summary) return 0;
  const winRateScore = Math.min(summary.win_rate / 0.6, 1) * 30;
  const consistency = getConsistencyScore(summary);
  const riskScore = 15;
  const emotionCoverage =
    rawTrades.length > 0
      ? (rawTrades.filter((trade) => Boolean(trade.emotion_tag)).length / rawTrades.length) * 25
      : 0;
  return Math.round(winRateScore + consistency + riskScore + emotionCoverage);
}

function isEmptyDashboard(summary: AnalyticsSummaryResponse | null, completedTrades: CompletedTrade[]) {
  return (summary?.total_trades ?? 0) === 0 && completedTrades.length === 0;
}

function scoreTone(score: number): "green" | "amber" | "red" {
  if (score > 70) return "green";
  if (score >= 40) return "amber";
  return "red";
}

function getScoreGradient(score: number): string {
  const tone = scoreTone(score);
  const color = tone === "green" ? "#10b981" : tone === "amber" ? "#f59e0b" : "#ef4444";
  return `conic-gradient(${color} 0% ${score}%, #e2e8f0 ${score}% 100%)`;
}

function getTradeDay(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`);
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isWithinLastDays(value: string, days: number) {
  const date = getTradeDay(value);
  const threshold = new Date();
  threshold.setHours(0, 0, 0, 0);
  threshold.setDate(threshold.getDate() - days);
  return date >= threshold;
}

function getTradingStyle(avgHoldingDays: number | null | undefined) {
  if (avgHoldingDays == null) return "Building sample";
  if (avgHoldingDays < 1) return "Intraday";
  if (avgHoldingDays <= 7) return "Swing";
  return "Positional";
}

function getHoldingBucketLabel(bucket: string | null | undefined) {
  const text = String(bucket ?? "").toLowerCase();
  if (text.includes("intraday") || text.includes("same")) return "Intraday";
  if (text.includes("2") || text.includes("3") || text.includes("4") || text.includes("5") || text.includes("swing")) {
    return "Short swings";
  }
  if (text.includes("week") || text.includes("position") || text.includes("10") || text.includes("multi")) {
    return "Positional";
  }
  return "Short swings";
}

function getTimeSince(value: string) {
  const created = new Date(value);
  const diffMs = Date.now() - created.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function truncateText(value: string | null | undefined, max = 80) {
  const text = (value ?? "").trim();
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trimEnd()}...`;
}

function getSectorStats(completedTrades: CompletedTrade[]) {
  const stats = new Map<string, { total: number; wins: number }>();
  const sectorMap: Record<string, string> = {
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

  for (const trade of completedTrades) {
    const sector = sectorMap[trade.stock_symbol.toUpperCase()] ?? "Other";
    const current = stats.get(sector) ?? { total: 0, wins: 0 };
    current.total += 1;
    if (trade.pnl > 0) current.wins += 1;
    stats.set(sector, current);
  }

  const ranked = [...stats.entries()]
    .filter(([, value]) => value.total > 0)
    .sort((a, b) => b[1].wins / b[1].total - a[1].wins / a[1].total);

  return {
    bestSector: ranked[0]?.[0] ?? "Building sample",
  };
}

function matchRawTradeToCompletedTrade(rawTrades: Trade[], trade: CompletedTrade) {
  return (
    rawTrades.find(
      (item) =>
        item.stock_symbol.toUpperCase() === trade.stock_symbol.toUpperCase() &&
        item.trade_date.slice(0, 10) === trade.entry_date.slice(0, 10)
    ) ?? null
  );
}

function getScoreExplanation(
  summary: AnalyticsSummaryResponse | null,
  rawTrades: Trade[],
  patterns: PatternsEnvelope | null
): { drag: string; strength: string; improvement: string } {
  const totalRawTrades = rawTrades.length;
  const emotionTaggedCount = rawTrades.filter((trade) => Boolean(trade.emotion_tag)).length;
  const emotionCoverage = emotionTaggedCount / Math.max(totalRawTrades, 1);

  let drag = "Pattern sample size";
  let improvement = "Keep capturing completed trades to unlock stronger analysis";

  if (emotionCoverage < 0.3) {
    drag = "Emotional awareness";
    improvement = "Tag emotions on your recent trades";
  } else if (!(patterns?.unlocked ?? false)) {
    drag = "Pattern visibility";
    improvement = "Complete more trades to unlock your pattern analysis";
  } else if ((summary?.win_rate ?? 0) < 0.5) {
    drag = "Win rate pressure";
    improvement = "Review weak setups and reduce low-conviction activity";
  }

  let strength = "Consistency";
  if ((summary?.win_rate ?? 0) > 0.55) {
    strength = "Win rate";
  } else if ((summary?.avg_pnl_per_trade ?? 0) > 0) {
    strength = "Positive average trade";
  }

  return { drag, strength, improvement };
}

function getDisciplineScore(rawTrades: Trade[], setups: TradeSetup[]) {
  const emotionCount = rawTrades.filter((trade) => Boolean(trade.emotion_tag)).length;
  const checklistCount = setups.length;
  const totalTrades = rawTrades.length;

  if (totalTrades < 10) {
    return {
      score: null as number | null,
      label: "Building sample",
      detail: `Tag emotions on ${Math.max(0, 10 - emotionCount)} more trades to unlock.`,
      progress: Math.min(emotionCount, 10),
      target: 10,
    };
  }

  const emotionScore = Math.min((emotionCount / totalTrades) * 40, 40);
  const checklistScore = Math.min((checklistCount / Math.max(totalTrades, 1)) * 35, 35);
  const riskScore = 25;
  const total = Math.round(emotionScore + checklistScore + riskScore);

  return {
    score: total,
    label: `${total}/100`,
    detail: `Emotion logging: ${Math.round(emotionScore)}pts · Checklists: ${Math.round(
      checklistScore
    )}pts · Risk control: ${riskScore}pts`,
    progress: Math.min(total, 100),
    target: 100,
  };
}

function getNeedsAttention(
  rawTrades: Trade[],
  completedTrades: CompletedTrade[],
  setups: TradeSetup[],
  patterns: PatternsEnvelope | null
): Array<{ icon: string; text: string; priority: "high" | "medium" | "low" }> {
  const items: Array<{ icon: string; text: string; priority: "high" | "medium" | "low" }> = [];

  const untaggedCount = rawTrades.filter((trade) => !trade.emotion_tag).length;
  if (untaggedCount > 3) {
    items.push({
      icon: "😶",
      text: `${untaggedCount} trades missing emotion tags`,
      priority: "medium",
    });
  }

  const pendingSetups = setups.filter((setup) => !setup.linked_trade_id).length;
  if (pendingSetups > 0) {
    items.push({
      icon: "⏳",
      text: `${pendingSetups} setups awaiting trade capture`,
      priority: "low",
    });
  }

  const activePatterns = patterns?.unlocked
    ? patterns.patterns.filter((pattern) => !pattern.locked)
    : [];
  const highSeverity = activePatterns.filter((pattern) => pattern.severity === "high");
  if (highSeverity.length > 0) {
    items.push({
      icon: "🔴",
      text: `${highSeverity.length} high-severity patterns detected`,
      priority: "high",
    });
  }

  const untaggedLosses = completedTrades.filter(
    (trade) => trade.pnl < 0 && !matchRawTradeToCompletedTrade(rawTrades, trade)?.emotion_tag
  ).length;
  const taggedLosses = completedTrades.filter(
    (trade) => trade.pnl < 0 && Boolean(matchRawTradeToCompletedTrade(rawTrades, trade)?.emotion_tag)
  ).length;
  if (untaggedLosses > taggedLosses + 2) {
    items.push({
      icon: "📝",
      text: "Several losing trades have no emotion tag — missed learning opportunity",
      priority: "medium",
    });
  }

  return items
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, 4);
}

function getThisWeekSummary(
  completedTrades: CompletedTrade[],
  rawTrades: Trade[],
  setups: TradeSetup[],
  patterns: PatternsEnvelope | null
) {
  const weekTrades = completedTrades.filter((trade) => isWithinLastDays(trade.exit_date, 7));
  const weekRawTrades = rawTrades.filter((trade) => isWithinLastDays(trade.trade_date, 7));

  const weekPnl = weekTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const weekWins = weekTrades.filter((trade) => trade.pnl > 0).length;
  const weekLosses = weekTrades.filter((trade) => trade.pnl < 0).length;
  const untaggedThisWeek = weekRawTrades.filter((trade) => !trade.emotion_tag).length;
  const pendingSetups = setups.filter((setup) => !setup.linked_trade_id).length;
  const focusPattern = patterns?.unlocked
    ? [...patterns.patterns.filter((pattern) => !pattern.locked)].sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      )[0] ?? null
    : null;

  if (weekTrades.length > 0) {
    return {
      title: "This Week",
      primary: `Trades: ${weekTrades.length} · P&L: ${formatCurrency(weekPnl)} · ${weekWins}W / ${weekLosses}L`,
      secondary: `Journal gaps: ${untaggedThisWeek} trades missing emotion tags`,
      focus: `Focus: ${focusPattern?.title ?? "Complete your trade review"}`,
    };
  }

  return {
    title: "This Week",
    primary: "Trades: 0 this week",
    secondary: `Pending setups: ${pendingSetups} · Journal gaps: ${untaggedThisWeek} trades need emotion tags`,
    focus: "Focus: Import trades or open your broker to start capturing",
  };
}

function getWorstPatternLabel(pattern: PatternResponse | null) {
  if (!pattern) return "Building sample";
  if (pattern.pattern_type === "revenge_trading") return "Revenge trading";
  return pattern.title;
}

function getBestSetupType(pattern: PatternResponse | null) {
  return getHoldingBucketLabel(String(pattern?.data?.best_bucket ?? ""));
}

function getAvoidLabel(pattern: PatternResponse | null) {
  if (!pattern) return "Low-conviction trades without review";
  switch (pattern.pattern_type) {
    case "time_of_day":
      return "Intraday trades during weak hours";
    case "revenge_trading":
      return "Oversized revenge entries";
    case "overtrading":
      return "Overactive sessions after the first few trades";
    case "losing_streak_tilt":
      return "Impulse entries during losing streaks";
    default:
      return pattern.title;
  }
}

function calculateRiskReward(setup: TradeSetup) {
  if (
    setup.entry_price == null ||
    setup.stop_loss_price == null ||
    setup.target_price == null
  ) {
    return null;
  }

  const entryPrice = toNumber(setup.entry_price);
  const stopLossPrice = toNumber(setup.stop_loss_price);
  const targetPrice = toNumber(setup.target_price);
  if (entryPrice == null || stopLossPrice == null || targetPrice == null) {
    return null;
  }

  const risk = Math.abs(entryPrice - stopLossPrice);
  const reward = Math.abs(targetPrice - entryPrice);
  if (!risk) return null;
  return reward / risk;
}

function getTradeRMultiple(trade: CompletedTrade, linkedSetup: TradeSetup | null) {
  const tradePnl = toNumber(trade.pnl);
  const linkedRiskAmount = toNumber(linkedSetup?.risk_amount);
  if (tradePnl != null && linkedRiskAmount != null && linkedRiskAmount > 0) {
    return tradePnl / linkedRiskAmount;
  }

  const linkedEntryPrice = toNumber(linkedSetup?.entry_price);
  const linkedStopLossPrice = toNumber(linkedSetup?.stop_loss_price);
  const tradeQuantity = toNumber(trade.quantity);
  if (linkedEntryPrice != null && linkedStopLossPrice != null && tradeQuantity != null && tradeQuantity > 0) {
    const riskPerUnit = Math.abs(linkedEntryPrice - linkedStopLossPrice);
    const totalRisk = riskPerUnit * tradeQuantity;
    if (totalRisk > 0) {
      return (tradePnl ?? 0) / totalRisk;
    }
  }

  return toNumber(trade.return_pct);
}

function getSetupOutcomeLabel(setup: TradeSetup, trade: CompletedTrade | null) {
  if (!trade) {
    return `⏳ Awaiting trade capture · ${getTimeSince(setup.created_at)}`;
  }

  const target = setup.target_price;
  const stopLoss = setup.stop_loss_price;
  if (target && Math.abs(trade.exit_price - target) / target <= 0.03) {
    return "✅ Plan followed";
  }
  if (stopLoss && Math.abs(trade.exit_price - stopLoss) / stopLoss <= 0.03) {
    return "⚠️ Stopped out as planned";
  }
  if (
    stopLoss != null &&
    trade.pnl < 0 &&
    trade.exit_price > Math.min(trade.entry_price, stopLoss) &&
    trade.exit_price < Math.max(trade.entry_price, stopLoss)
  ) {
    return "❌ Early exit / panic";
  }
  return "↔ Deviated from plan";
}

function getTrackedFocus(
  trackedPatternTypes: string[],
  patterns: PatternResponse[]
): string[] {
  if (!trackedPatternTypes.length) {
    return [];
  }
  const byType = new Map(patterns.map((pattern) => [pattern.pattern_type, pattern.title]));
  return trackedPatternTypes
    .map((type) => byType.get(type))
    .filter((value): value is string => Boolean(value));
}

function DashboardSkeleton() {
  return (
    <div className="command-center pt-28">
      <div className="h-36 animate-pulse rounded-3xl bg-white" />
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-2xl bg-white" />
        ))}
      </div>
      <div className="mt-6 h-40 animate-pulse rounded-3xl bg-white" />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-3xl bg-white" />
        <div className="h-72 animate-pulse rounded-3xl bg-white" />
      </div>
    </div>
  );
}

function DashboardContent() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [patternsEnvelope, setPatternsEnvelope] = useState<PatternsEnvelope | null>(null);
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([]);
  const [rawTrades, setRawTrades] = useState<Trade[]>([]);
  const [setups, setSetups] = useState<TradeSetup[]>([]);
  const [trackedPatternTypes, setTrackedPatternTypes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      let resolvedUser: User;
      try {
        resolvedUser = await getMe();
      } catch (firstError) {
        try {
          resolvedUser = await getMe();
        } catch (secondError) {
          if (!active) return;
          setError(
            secondError instanceof Error ? secondError.message : "Failed to load dashboard"
          );
          setLoading(false);
          return;
        }
      }

      const [
        summaryResult,
        patternsResult,
        completedResult,
        rawTradesResult,
        setupsResult,
      ] = await Promise.allSettled([
        getAnalyticsSummary(),
        getPatterns(),
        getCompletedTrades(50, 0),
        getTrades({ limit: 50, offset: 0 }),
        getTradeSetups(20, 0),
      ]);

      if (!active) return;

      setUser(resolvedUser);
      if (summaryResult.status === "fulfilled") setSummary(summaryResult.value);
      if (patternsResult.status === "fulfilled") setPatternsEnvelope(patternsResult.value);
      if (completedResult.status === "fulfilled") setCompletedTrades(completedResult.value);
      if (rawTradesResult.status === "fulfilled") setRawTrades(rawTradesResult.value);
      if (setupsResult.status === "fulfilled") setSetups(setupsResult.value);
      const backgroundFailure = [
        summaryResult,
        patternsResult,
        completedResult,
        rawTradesResult,
        setupsResult,
      ].find((result) => result.status === "rejected");
      if (backgroundFailure?.status === "rejected") {
        setError(
          backgroundFailure.reason instanceof Error
            ? backgroundFailure.reason.message
            : "Some dashboard sections could not be loaded."
        );
      }
      setLoading(false);
    }

    void loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem("trackedPatterns") ?? "[]");
      if (Array.isArray(stored)) {
        setTrackedPatternTypes(stored.filter((value): value is string => typeof value === "string"));
      }
    } catch {
      setTrackedPatternTypes([]);
    }
  }, []);

  const visiblePatterns = useMemo(
    () => (patternsEnvelope?.patterns ?? []).filter((pattern) => !pattern.locked),
    [patternsEnvelope]
  );

  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "Trader";
  const today = new Date();
  const performanceScore = getPerformanceScore(summary, rawTrades);
  const score = Math.max(0, Math.min(100, performanceScore));
  const monthPnl = currentMonthPnl(summary);
  const scoreExplanation = getScoreExplanation(summary, rawTrades, patternsEnvelope);
  const discipline = getDisciplineScore(rawTrades, setups);
  const needsAttention = getNeedsAttention(rawTrades, completedTrades, setups, patternsEnvelope);
  const weekSummary = getThisWeekSummary(completedTrades, rawTrades, setups, patternsEnvelope);
  const sectorStats = getSectorStats(completedTrades);
  const emptyDashboard = isEmptyDashboard(summary, completedTrades);
  const worstPattern = [...visiblePatterns].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  )[0] ?? null;
  const tradeCountForDna = patternsEnvelope?.total_completed_trades ?? summary?.total_trades ?? 0;
  const bestDayPattern = getPattern(visiblePatterns, "day_of_week");
  const timePattern = getPattern(visiblePatterns, "time_of_day");
  const holdingPattern = getPattern(visiblePatterns, "holding_period");
  const trackedFocus = getTrackedFocus(trackedPatternTypes, visiblePatterns);

  async function handleExport() {
    setExporting(true);
    try {
      await exportCompletedTradesCSV();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to export journal");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error && !user) {
    return (
      <div className="command-center pt-28">
        <div className="rounded-2xl bg-rose-50 p-5 text-sm font-semibold text-rose-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="command-center pt-28">
      {error ? (
        <div className="mb-6 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="glass-card flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-950">Welcome back, {firstName}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {DATE_FORMATTER.format(today)} · {DAY_FORMATTER.format(today)}
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <div className="score-ring" style={{ background: getScoreGradient(score) }}>
            <div className="score-ring-inner">
              <span className="score-ring-value">{score}</span>
              <span className="score-ring-label">Score</span>
            </div>
          </div>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Performance Score
          </span>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="glass-card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-gray-500">Performance Score</div>
              <div className="mt-4 flex items-center gap-4">
                <div className="score-ring h-[84px] w-[84px]" style={{ background: getScoreGradient(score) }}>
                  <div className="score-ring-inner h-[64px] w-[64px]">
                    <span className="text-lg font-black text-slate-950">
                      {emptyDashboard ? "..." : score}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-950">
                    {emptyDashboard ? "Building sample" : `${score}/100`}
                  </div>
                  <div className="text-sm text-gray-500">
                    {emptyDashboard
                      ? "Complete trades to unlock your first performance read"
                      : "Live read on your trading health"}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="score-explanation">
            <div>
              Main drag: <span className="score-drag">{scoreExplanation.drag}</span>
            </div>
            <div>
              Strength: <span className="score-strength">{scoreExplanation.strength}</span>
            </div>
            <div>Next step: {scoreExplanation.improvement}</div>
          </div>
        </article>

        <article className="glass-card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-sm font-bold text-gray-500">This Month P&amp;L</div>
          <div className={`mt-3 text-3xl font-black ${pnlClass(monthPnl.current)}`}>
            {formatCurrency(monthPnl.current)}
          </div>
          <p className="mt-3 text-sm text-gray-500">
            vs last month:{" "}
            <span className={pnlClass(monthPnl.current - monthPnl.previous)}>
              {formatSignedCurrency(monthPnl.current - monthPnl.previous)}
            </span>
          </p>
        </article>

        <article className="glass-card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-sm font-bold text-gray-500">Win Rate</div>
          <div className="mt-3 text-3xl font-black text-slate-950">
            {formatPercent(summary?.win_rate)}
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-indigo-600"
              style={{ width: `${Math.min((summary?.win_rate ?? 0) * 100, 100)}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-gray-500">Across {summary?.total_trades ?? 0} completed trades</p>
        </article>

        <article className="glass-card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-sm font-bold text-gray-500">Discipline Score</div>
          {discipline.score == null ? (
            <>
              <div className="mt-3 text-2xl font-black text-slate-950">{discipline.label}</div>
              <div className="mt-3 h-2 rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${(discipline.progress / discipline.target) * 100}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-gray-500">
                {rawTrades.filter((trade) => Boolean(trade.emotion_tag)).length}/10 trades tagged
              </p>
              <p className="mt-1 text-xs text-gray-500">{discipline.detail}</p>
            </>
          ) : (
            <>
              <div className="mt-3 text-3xl font-black text-slate-950">{discipline.label}</div>
              <div className="mt-3 h-2 rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${discipline.progress}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-gray-500">{discipline.detail}</p>
            </>
          )}
        </article>
      </section>


      {needsAttention.length ? (
        <section className="needs-attention-card mt-6">
          <div className="text-lg font-black text-slate-950">⚡ Needs Attention</div>
          <div className="mt-3 grid gap-1">
            {needsAttention.map((item) => (
              <div key={`${item.icon}-${item.text}`} className="needs-attention-item">
                <span>{item.icon}</span>
                <span className="flex-1 text-slate-700">{item.text}</span>
                <span className={`priority-${item.priority}`}>
                  {item.priority === "high"
                    ? "High"
                    : item.priority === "medium"
                      ? "Medium"
                      : "Low"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6 glass-card p-6">
          <h2 className="text-xl font-black text-slate-950">{weekSummary.title}</h2>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              {weekSummary.primary}
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              {weekSummary.secondary}
            </div>
            <div className="rounded-2xl bg-indigo-50 p-4 text-sm font-medium text-indigo-900">
              {weekSummary.focus}
            </div>
          </div>
      </section>

      <section className="mt-6 glass-card border-l-4 border-l-indigo-500 p-6">
          <h2 className="text-xl font-black text-slate-950">This Week&apos;s Focus</h2>
          <div className="mt-4 grid gap-3">
            {trackedFocus.length ? (
              trackedFocus.map((item) => (
                <div key={item} className="improvement-item">
                  <span className="text-sm leading-6 text-slate-700">Track: {item}</span>
                </div>
              ))
            ) : (
              <div className="improvement-item">
                <span className="text-sm leading-6 text-slate-700">
                  Track a pattern on the Patterns page to keep it in view here next week.
                </span>
              </div>
            )}
            <div className="improvement-item">
              <span className="text-sm leading-6 text-slate-700">{weekSummary.focus}</span>
            </div>
          </div>
      </section>

      <section className="mt-6">
        {tradeCountForDna >= 20 ? (
          <div className="dna-card">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">
                  Your Trader DNA
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <span className="text-sm text-gray-500">Best edge: Thursday trading</span>
                    <div className="mt-1 font-black text-slate-950">
                      {String(bestDayPattern?.data?.best_bucket ?? "Building sample")}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Weak day: Wednesday (reduce activity)</span>
                    <div className="mt-1 font-black text-slate-950">
                      {String(bestDayPattern?.data?.worst_bucket ?? "Building sample")}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Sweet spot: Short swing trades (2-5 days)</span>
                    <div className="mt-1 font-black text-slate-950">
                      {String(holdingPattern?.data?.best_bucket ?? "Building sample")}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Style: Swing trader</span>
                    <div className="mt-1 font-black text-slate-950">
                      {getTradingStyle(summary?.avg_holding_days)}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="text-sm text-gray-500">Strongest sector: IT</span>
                  <div className="mt-1 font-black text-slate-950">{sectorStats.bestSector}</div>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Risk leak: Revenge trading</span>
                  <div className="mt-1 font-black text-slate-950">{getWorstPatternLabel(worstPattern)}</div>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Best setup type</span>
                  <div className="mt-1 font-black text-slate-950">{getBestSetupType(holdingPattern)}</div>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Avoid</span>
                  <div className="mt-1 font-black text-slate-950">{getAvoidLabel(worstPattern)}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card p-6">
            <h2 className="text-xl font-black text-slate-950">Trader DNA</h2>
            <p className="mt-3 text-sm text-gray-500">
              Unlocks at 20 trades. You have {tradeCountForDna}/20 completed trades.
            </p>
            <div className="mt-4 h-3 rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-indigo-600"
                style={{ width: `${Math.min((tradeCountForDna / 20) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </section>

      <section className="mt-6 glass-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black text-slate-950">Recent Trades</h2>
          <Link href="/dashboard/trades" className="text-sm font-bold text-indigo-600">
            View all trades →
          </Link>
        </div>

        <div className="mt-5 grid gap-3">
          {completedTrades.length ? (
            completedTrades.slice(0, 5).map((trade) => {
              const rawTrade = matchRawTradeToCompletedTrade(rawTrades, trade);
              const linkedSetup =
                setups.find((setup) => setup.linked_trade_id === trade.id) ?? null;
              const rMultiple = getTradeRMultiple(trade, linkedSetup);

              return (
                <article
                  key={trade.id}
                  className="rounded-2xl border border-gray-100 bg-white px-4 py-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-black text-slate-950">{trade.stock_symbol}</span>
                      <span className="hidden text-slate-500">
                        ₹{trade.entry_price.toLocaleString("en-IN")} → ₹
                        {formatCurrency(trade.entry_price)} â†’ {formatCurrency(trade.exit_price)}
                      </span>
                      <span className="text-slate-500">
                        {formatCurrency(trade.entry_price)} to {formatCurrency(trade.exit_price)}
                      </span>
                      <span className={`font-bold ${pnlClass(trade.pnl)}`}>
                        {formatSignedCurrency(trade.pnl)}
                      </span>
                      <span className={`font-semibold ${pnlClass(rMultiple ?? 0)}`}>
                        {rMultiple == null ? "—" : `${rMultiple.toFixed(2)}R`}
                      </span>
                      <span
                        className={`badge ${
                          rawTrade?.emotion_tag ? emotionClass(rawTrade.emotion_tag) : "badge-indigo"
                        }`}
                      >
                        {emotionLabel(rawTrade?.emotion_tag)}
                      </span>
                      <span className={`badge ${linkedSetup ? "badge-emerald" : "badge-indigo"}`}>
                        {linkedSetup ? "✓ Plan followed" : "No plan"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Holding {toNumber(trade.holding_days) ?? 0} day
                      {(toNumber(trade.holding_days) ?? 0) === 1 ? "" : "s"}
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="text-sm text-gray-500">
              No completed trades yet. Import trades to unlock your review workflow.
            </p>
          )}
        </div>
      </section>

      {setups.length > 0 ? (
        <section className="mt-6 glass-card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-black text-slate-950">Pre-Trade Setups</h2>
            <Link href="/dashboard/trades" className="text-sm font-bold text-indigo-600">
              View all setups →
            </Link>
          </div>
          <div className="mt-5 grid gap-4">
            {setups.slice(0, 4).map((setup) => {
              const linkedTrade = completedTrades.find((trade) => trade.id === setup.linked_trade_id) ?? null;
              const rr = calculateRiskReward(setup);
              const thesisPreview = truncateText(setup.thesis);
              const rMultiple =
                linkedTrade && setup.risk_amount && setup.risk_amount > 0
                  ? linkedTrade.pnl / setup.risk_amount
                  : linkedTrade
                    ? getTradeRMultiple(linkedTrade, setup)
                    : null;

              return (
                <article key={setup.id} className="rounded-2xl border border-gray-100 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1">
                      <h3 className="font-black text-slate-950">{setup.symbol || "Setup"}</h3>
                      {setup.entry_price != null || setup.stop_loss_price != null || setup.target_price != null ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Entry {formatCurrency(setup.entry_price)} · SL {formatCurrency(setup.stop_loss_price)} · Target{" "}
                          {formatCurrency(setup.target_price)}
                        </p>
                      ) : null}
                      {rr != null ? (
                        <p className="mt-1 text-sm text-slate-500">R:R 1:{rr.toFixed(2)}</p>
                      ) : null}
                      {setup.conviction_score != null ? (
                        <div className="mt-3 max-w-sm">
                          <div className="mb-1 text-xs font-semibold text-slate-500">
                            Conviction {setup.conviction_score}/10
                          </div>
                          <div className="h-2 rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-indigo-600"
                              style={{ width: `${Math.min(setup.conviction_score * 10, 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : null}
                      {setup.risk_level ? (
                        <div className="mt-3">
                          <span
                            className={`badge ${
                              setup.risk_level.toLowerCase().includes("high")
                                ? "badge-rose"
                                : setup.risk_level.toLowerCase().includes("low")
                                  ? "badge-emerald"
                                  : "badge-indigo"
                            }`}
                          >
                            Risk: {setup.risk_level}
                          </span>
                        </div>
                      ) : null}
                      {thesisPreview ? (
                        <p className="mt-3 text-sm italic text-gray-500">{thesisPreview}</p>
                      ) : null}
                    </div>

                    <div className="min-w-[220px] rounded-2xl bg-white px-4 py-3 text-sm">
                      <div className="font-semibold text-slate-700">
                        {linkedTrade
                          ? `Result: ${formatSignedCurrency(linkedTrade.pnl)} · ${
                              rMultiple == null ? "—" : `${rMultiple.toFixed(2)}R`
                            }`
                          : `⏳ Awaiting trade capture · ${getTimeSince(setup.created_at)}`}
                      </div>
                      <div className="mt-2 text-sm text-slate-500">
                        {getSetupOutcomeLabel(setup, linkedTrade)}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-6 glass-card p-6">
        <h2 className="text-xl font-black text-slate-950">Quick Actions</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/import"
            className="rounded-2xl border border-gray-100 bg-white px-4 py-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-100 hover:bg-indigo-50/40"
          >
            📥 Import Trades
          </Link>
          <Link
            href="/dashboard/analytics"
            className="rounded-2xl border border-gray-100 bg-white px-4 py-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-100 hover:bg-indigo-50/40"
          >
            📊 View Patterns
          </Link>
          <Link
            href="/dashboard/mistakes"
            className="rounded-2xl border border-gray-100 bg-white px-4 py-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-100 hover:bg-indigo-50/40"
          >
            🔍 Review Mistakes
          </Link>
          <button
            onClick={() => void handleExport()}
            disabled={exporting}
            className="rounded-2xl border border-gray-100 bg-white px-4 py-4 text-left text-sm font-semibold text-slate-700 transition hover:border-indigo-100 hover:bg-indigo-50/40 disabled:opacity-60"
          >
            📤 {exporting ? "Exporting..." : "Export Journal"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
