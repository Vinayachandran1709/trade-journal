import { useEffect, useMemo, useState } from "react";

import {
  analyzePatterns,
  fetchCompletedTrades,
  getAnalyticsSummary,
  getPatterns,
  type AnalyticsSummaryResponse,
  type CompletedTradeListItem,
  type PatternResponse,
  type PatternsEnvelope,
} from "../shared/api";
import { getAuthToken } from "../shared/auth";
import { storageGet, storageSet } from "../shared/chrome";
import SkeletonLine from "./SkeletonLine";

const CACHED_INSIGHTS_PATTERNS_KEY = "cachedInsightsPatterns";
const CACHED_INSIGHTS_SUMMARY_KEY = "cachedInsightsSummary";
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});

type PatternMeta = {
  pattern: PatternResponse;
  impact: { amount: number; text: string } | null;
  confidence: { className: string; text: string };
  statusPill: string;
  exampleTrades: CompletedTradeListItem[];
  isCosting: boolean;
  isHelping: boolean;
};

type AvoidableLossesSummary =
  | {
      kind: "locked";
      message: string;
    }
  | {
      kind: "empty";
      message: string;
      detail: string;
    }
  | {
      kind: "ready";
      amount: number;
      leak: string;
      rule: string;
    };

type DisciplineScoreSummary =
  | {
      kind: "locked";
      message: string;
    }
  | {
      kind: "ready";
      score: number;
      label: string;
      note: string;
    };

type ImprovementTrendSummary =
  | {
      kind: "not-enough-data";
      title: string;
      note: string;
    }
  | {
      kind: "ready";
      title: string;
      note: string;
      recentWinRate: string;
      previousWinRate: string;
      recentAvgPnl: string;
    };

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

function formatSignedCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "₹--";
  }
  return `${value >= 0 ? "+" : "-"}₹${CURRENCY_FORMATTER.format(Math.abs(value))}`;
}

function formatExampleTradeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return SHORT_DATE_FORMATTER.format(date);
}

function severityIcon(severity: string): string {
  switch (severity) {
    case "high":
      return "●";
    case "medium":
      return "◐";
    default:
      return "○";
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

function normalizePatternsEnvelope(value: unknown): PatternsEnvelope | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<PatternsEnvelope>;
  return {
    patterns: Array.isArray(record.patterns) ? record.patterns : [],
    total_completed_trades:
      typeof record.total_completed_trades === "number" ? record.total_completed_trades : 0,
    threshold: typeof record.threshold === "number" ? record.threshold : 20,
    unlocked: Boolean(record.unlocked),
  };
}

function normalizeAnalyticsSummary(value: unknown): AnalyticsSummaryResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<AnalyticsSummaryResponse>;
  return {
    total_trades: typeof record.total_trades === "number" ? record.total_trades : 0,
    win_rate: typeof record.win_rate === "number" ? record.win_rate : 0,
    total_pnl: typeof record.total_pnl === "number" ? record.total_pnl : 0,
    avg_pnl_per_trade:
      typeof record.avg_pnl_per_trade === "number" ? record.avg_pnl_per_trade : 0,
    best_trade:
      record.best_trade && typeof record.best_trade === "object"
        ? {
            symbol: record.best_trade.symbol ?? null,
            pnl: typeof record.best_trade.pnl === "number" ? record.best_trade.pnl : null,
            exit_date:
              typeof record.best_trade.exit_date === "string" ? record.best_trade.exit_date : null,
          }
        : { symbol: null, pnl: null, exit_date: null },
    worst_trade:
      record.worst_trade && typeof record.worst_trade === "object"
        ? {
            symbol: record.worst_trade.symbol ?? null,
            pnl: typeof record.worst_trade.pnl === "number" ? record.worst_trade.pnl : null,
            exit_date:
              typeof record.worst_trade.exit_date === "string" ? record.worst_trade.exit_date : null,
          }
        : { symbol: null, pnl: null, exit_date: null },
    avg_holding_days: typeof record.avg_holding_days === "number" ? record.avg_holding_days : 0,
    most_traded_symbol:
      typeof record.most_traded_symbol === "string" ? record.most_traded_symbol : null,
    monthly_pnl: Array.isArray(record.monthly_pnl) ? record.monthly_pnl : [],
  };
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

function getPatternSampleSize(pattern: PatternResponse): number {
  return Number(pattern.data?.sample_size ?? 0);
}

function isSoftConfidencePattern(pattern: PatternResponse, totalCompletedTrades: number): boolean {
  const sampleSize = getPatternSampleSize(pattern);
  return totalCompletedTrades < 30 || sampleSize < 30;
}

function getConfidenceMeta(pattern: PatternResponse) {
  const sampleSize = getPatternSampleSize(pattern);
  if (sampleSize > 30) {
    return {
      className: "confidence-high",
      text: `Higher confidence · ${sampleSize} trades analyzed`,
    };
  }
  if (sampleSize >= 20) {
    return {
      className: "confidence-moderate",
      text: `Early signal · ${sampleSize} trades`,
    };
  }
  return {
    className: "confidence-low",
    text: `Worth monitoring · ${sampleSize} trades`,
  };
}

function getExplicitImpactAmount(pattern: PatternResponse): number | null {
  const keys = [
    "estimated_monthly_impact",
    "monthly_impact",
    "impact",
    "estimatedImpact",
  ] as const;

  const source = pattern as PatternResponse & Record<string, unknown>;
  for (const key of keys) {
    const topLevel = source[key];
    if (typeof topLevel === "number" && Number.isFinite(topLevel)) {
      return topLevel;
    }
    const nested = pattern.data?.[key];
    if (typeof nested === "number" && Number.isFinite(nested)) {
      return nested;
    }
  }
  return null;
}

function estimateImpact(
  pattern: PatternResponse,
  summary: AnalyticsSummaryResponse | null
): { amount: number; text: string } | null {
  const explicitImpact = getExplicitImpactAmount(pattern);
  if (explicitImpact != null) {
    return {
      amount: explicitImpact,
      text: `Estimated monthly impact: ${formatCurrency(explicitImpact)}`,
    };
  }

  const sampleSize = getPatternSampleSize(pattern);
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
        text: `Estimated monthly impact: ${formatCurrency(saved)}`,
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

function getSoftLead(pattern: PatternResponse, totalCompletedTrades: number): string {
  return isSoftConfidencePattern(pattern, totalCompletedTrades)
    ? "Early data suggests"
    : "Your recent data shows";
}

function getTraderFacingPatternDescription(
  pattern: PatternResponse,
  totalCompletedTrades: number
): string {
  const lead = getSoftLead(pattern, totalCompletedTrades);
  switch (pattern.pattern_type) {
    case "day_of_week":
      return `${lead} your stronger days are doing more of the work, and ${String(pattern.data?.worst_bucket ?? "weaker days")} need tighter discipline.`;
    case "holding_period":
      return `${lead} short holds are working better for you. ${String(pattern.data?.worst_bucket ?? "weaker hold times")} need review.`;
    case "time_of_day":
      return `${lead} some hours are costing you more. ${String(pattern.data?.worst_bucket ?? "weaker hours")} need tighter execution quality.`;
    case "revenge_trading":
      return `${lead} follow-up trades after losses are hurting execution quality.`;
    case "overtrading":
      return `${lead} extra trades are reducing your edge. More activity is not improving control.`;
    case "sector_concentration":
      return `${lead} one sector is carrying too much of your risk.`;
    case "winning_streak_tilt":
      return `${lead} wins may be nudging you away from your normal process.`;
    case "losing_streak_tilt":
      return `${lead} losses may be carrying into the next decision.`;
    default:
      return pattern.description;
  }
}

function getRecommendation(pattern: PatternResponse, totalCompletedTrades: number): string {
  switch (pattern.pattern_type) {
    case "time_of_day":
      return `Trade smaller during ${String(pattern.data?.worst_bucket ?? "weaker hours")}. Keep your better decisions inside ${String(pattern.data?.best_bucket ?? "your stronger hours")}.`;
    case "day_of_week":
      return `Trade smaller on ${String(pattern.data?.worst_bucket ?? "weaker days")}. Your stronger days are doing more of the work.`;
    case "holding_period":
      return `Lean into ${String(pattern.data?.best_bucket ?? "shorter holds")} and review trades that drift into ${String(pattern.data?.worst_bucket ?? "weaker hold times")}.`;
    case "revenge_trading":
      return "Pause after a loss before the next decision.";
    case "overtrading": {
      const threshold = Math.max(1, Math.ceil(Number(pattern.data?.average_trades_per_day ?? 2) * 2));
      return `Stop after about ${threshold} trades so activity does not dilute your edge.`;
    }
    case "sector_concentration":
      return `Review how much of your risk is tied to ${String(pattern.data?.sector ?? "one sector")}.`;
    case "winning_streak_tilt":
      return "Keep your normal size after a run of wins.";
    case "losing_streak_tilt":
      return "Reduce size or step back when losses start clustering.";
    default:
      return isSoftConfidencePattern(pattern, totalCompletedTrades)
        ? "Early data suggests this behavior pattern is worth monitoring."
        : "Review this behavior pattern in your journal and keep the rule simple.";
  }
}

function getWeeklyFocusCopy(pattern: PatternResponse, totalCompletedTrades: number): string | null {
  switch (pattern.pattern_type) {
    case "time_of_day":
      return `Limit entries during ${String(pattern.data?.worst_bucket ?? "your weaker hours")}.`;
    case "day_of_week":
      return `Be selective on ${String(pattern.data?.worst_bucket ?? "weaker days")}.`;
    case "revenge_trading":
      return "Pause after a loss before re-entering.";
    case "overtrading": {
      const threshold = Math.max(
        1,
        Math.ceil(Number(pattern.data?.average_trades_per_day ?? 2) * 2)
      );
      return `Stop after ${threshold} trades in a day.`;
    }
    case "sector_concentration":
      return `Review whether ${String(pattern.data?.sector ?? "one sector")} is dominating your risk.`;
    case "holding_period":
      return `Prefer ${String(pattern.data?.best_bucket ?? "your stronger")} hold times.`;
    case "winning_streak_tilt":
      return isSoftConfidencePattern(pattern, totalCompletedTrades)
        ? "Monitor sizing after a run of wins."
        : "Keep normal sizing after a run of wins.";
    case "losing_streak_tilt":
      return "Cut size after losses start clustering.";
    default:
      return null;
  }
}

function getTraderFacingPatternTitle(pattern: PatternResponse): string {
  switch (pattern.pattern_type) {
    case "day_of_week":
      return "Your best and worst trading days are clear";
    case "holding_period":
      return "Short holds are working better for you";
    case "time_of_day":
      return "Some hours are costing you more";
    case "revenge_trading":
      return "Revenge trades are damaging your P&L";
    case "overtrading":
      return "Extra trades are reducing your edge";
    case "sector_concentration":
      return "One sector may be dominating your risk";
    case "winning_streak_tilt":
      return "Wins may be making you oversized";
    case "losing_streak_tilt":
      return "Losses may be triggering tilt";
    default:
      return pattern.title;
  }
}

function isCostingPattern(pattern: PatternResponse, impact: { amount: number; text: string } | null): boolean {
  if (pattern.locked) {
    return false;
  }
  const text = `${pattern.title} ${pattern.description} ${getTraderFacingPatternTitle(pattern)}`.toLowerCase();
  if (pattern.pattern_type === "holding_period") {
    return typeof pattern.data?.worst_avg_pnl === "number" &&
      typeof pattern.data?.best_avg_pnl === "number"
      ? Number(pattern.data.worst_avg_pnl) > Number(pattern.data.best_avg_pnl)
      : false;
  }
  if (impact && impact.amount < 0) {
    return true;
  }
  if (
    ["revenge_trading", "overtrading", "losing_streak_tilt"].includes(pattern.pattern_type) &&
    pattern.severity !== "low"
  ) {
    return true;
  }
  return ["cost", "hurt", "damaging", "reducing", "loss", "weak", "worst"].some((term) =>
    text.includes(term)
  );
}

function isHelpingPattern(pattern: PatternResponse, impact: { amount: number; text: string } | null): boolean {
  if (impact && impact.amount > 0) {
    return true;
  }
  if (
    pattern.pattern_type === "holding_period" &&
    typeof pattern.data?.best_avg_pnl === "number" &&
    typeof pattern.data?.worst_avg_pnl === "number" &&
    Number(pattern.data.best_avg_pnl) >= Number(pattern.data.worst_avg_pnl)
  ) {
    return true;
  }
  const text = `${pattern.title} ${pattern.description} ${getTraderFacingPatternTitle(pattern)}`.toLowerCase();
  return ["sweet spot", "stronger", "best", "helping", "working better", "positive"].some((term) =>
    text.includes(term)
  );
}

function getPatternStatusPill(pattern: PatternResponse, impact: { amount: number; text: string } | null): string {
  if (pattern.locked) {
    return "Pro";
  }
  if (isHelpingPattern(pattern, impact)) {
    return "Helping you";
  }
  if (isCostingPattern(pattern, impact)) {
    return "Costing money";
  }
  return "Needs attention";
}

function getPatternStatusClass(statusPill: string): string {
  if (statusPill === "Helping you") {
    return "status-low";
  }
  if (statusPill === "Costing money") {
    return "status-high";
  }
  return "status-medium";
}

function getMainFocusPriority(pattern: PatternResponse, impact: { amount: number; text: string } | null): number {
  const severityScore = pattern.severity === "high" ? 300 : pattern.severity === "medium" ? 200 : 100;
  const negativeImpactScore =
    impact && impact.amount < 0 ? Math.min(Math.abs(Math.round(impact.amount)), 9999) : 0;
  return severityScore + negativeImpactScore;
}

function getMainFocusWhy(pattern: PatternResponse, totalCompletedTrades: number): string {
  const softLead = isSoftConfidencePattern(pattern, totalCompletedTrades)
    ? "So far, your data shows"
    : "Your trade history shows";

  switch (pattern.pattern_type) {
    case "holding_period":
      return `${softLead} holding time matters as much as entry quality. That makes exit discipline worth reviewing this week.`;
    case "day_of_week":
      return `${softLead} some weekdays are much less forgiving. That makes selectivity measurable, not just emotional.`;
    case "time_of_day":
      return `${softLead} your edge changes through the day. Better timing can improve execution quality without changing strategy.`;
    case "revenge_trading":
      return `${softLead} follow-up trades after losses are reducing control. A pause rule can help with loss prevention.`;
    case "overtrading":
      return `${softLead} more trades are not improving outcomes. A cap can protect discipline and capital.`;
    case "sector_concentration":
      return `${softLead} one weak pocket can distort the whole week when risk is concentrated.`;
    case "winning_streak_tilt":
      return `${softLead} confidence can drift away from process when results run hot.`;
    case "losing_streak_tilt":
      return `${softLead} frustration can carry into the next trade when losses cluster.`;
    default:
      return "This pattern is worth monitoring because one simple rule can protect execution quality.";
  }
}

function getMainFocusHeadline(pattern: PatternResponse, totalCompletedTrades: number): string {
  const softLead = isSoftConfidencePattern(pattern, totalCompletedTrades) ? "Early data suggests" : "";
  switch (pattern.pattern_type) {
    case "holding_period":
      return `${softLead ? `${softLead} ` : ""}your shorter holds are doing more of the work.`;
    case "day_of_week":
      return `${softLead ? `${softLead} ` : ""}${String(pattern.data?.worst_bucket ?? "Some days")} are costing you more than others.`;
    case "time_of_day":
      return `${softLead ? `${softLead} ` : ""}${String(pattern.data?.worst_bucket ?? "Some hours")} are reducing your edge.`;
    case "revenge_trading":
      return `${softLead ? `${softLead} ` : ""}follow-up trades after losses are hurting your P&L.`;
    case "overtrading":
      return `${softLead ? `${softLead} ` : ""}extra trades are reducing the quality of your day.`;
    case "sector_concentration":
      return `${softLead ? `${softLead} ` : ""}${String(pattern.data?.sector ?? "One sector")} may be dominating your risk too much.`;
    case "winning_streak_tilt":
      return `${softLead ? `${softLead} ` : ""}wins may be pulling you away from normal sizing discipline.`;
    case "losing_streak_tilt":
      return `${softLead ? `${softLead} ` : ""}losses may be carrying into the next trade more than you think.`;
    default:
      return getTraderFacingPatternTitle(pattern);
  }
}

function bucketMatchesHoldingDays(bucket: string, holdingDays: number): boolean {
  if (!bucket) {
    return false;
  }
  const normalized = bucket.toLowerCase();
  if (normalized.includes("intraday") || normalized.includes("same day")) {
    return holdingDays <= 0;
  }
  if (normalized.includes("1-3")) {
    return holdingDays >= 1 && holdingDays <= 3;
  }
  if (normalized.includes("4-7")) {
    return holdingDays >= 4 && holdingDays <= 7;
  }
  if (normalized.includes("8+") || normalized.includes("8 +") || normalized.includes("8 or")) {
    return holdingDays >= 8;
  }
  return false;
}

function getTradeWeekday(entryDate: string): string | null {
  const parsed = new Date(entryDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const day = parsed.getUTCDay();
  return WEEKDAY_LABELS[(day + 6) % 7] ?? null;
}

function getExampleTrades(pattern: PatternResponse, completedTrades: CompletedTradeListItem[]): CompletedTradeListItem[] {
  const bestBucket = String(pattern.data?.best_bucket ?? "");
  const worstBucket = String(pattern.data?.worst_bucket ?? "");
  const symbol = typeof pattern.data?.symbol === "string" ? pattern.data.symbol.toUpperCase() : null;
  const bucketsToTry = [worstBucket, bestBucket].filter(Boolean);

  if (pattern.pattern_type === "holding_period") {
    for (const bucket of bucketsToTry) {
      const matches = completedTrades.filter((trade) => bucketMatchesHoldingDays(bucket, trade.holding_days));
      if (matches.length >= 1) {
        return matches.slice(0, 3);
      }
    }
    return [];
  }

  if (pattern.pattern_type === "day_of_week") {
    for (const bucket of bucketsToTry) {
      const matches = completedTrades.filter(
        (trade) =>
          getTradeWeekday(trade.entry_date) === bucket || getTradeWeekday(trade.exit_date) === bucket
      );
      if (matches.length >= 2) {
        return matches.slice(0, 3);
      }
    }
    return [];
  }

  if (symbol) {
    return completedTrades
      .filter((trade) => trade.stock_symbol.toUpperCase() === symbol)
      .slice(0, 3);
  }

  return [];
}

function getAvoidableLeakLabel(pattern: PatternResponse): string {
  switch (pattern.pattern_type) {
    case "day_of_week":
      return `${String(pattern.data?.worst_bucket ?? "Weekday")} execution`;
    case "holding_period":
      return `${String(pattern.data?.worst_bucket ?? "Holding-period")} review`;
    case "time_of_day":
      return `${String(pattern.data?.worst_bucket ?? "Timing")} execution`;
    case "revenge_trading":
      return "Post-loss re-entry";
    case "overtrading":
      return "Trade-frequency control";
    case "sector_concentration":
      return `${String(pattern.data?.sector ?? "Sector")} concentration`;
    case "winning_streak_tilt":
      return "Post-win sizing drift";
    case "losing_streak_tilt":
      return "Post-loss tilt";
    default:
      return getTraderFacingPatternTitle(pattern);
  }
}

function buildAvoidableLossesSummary(
  patternsWithMeta: PatternMeta[],
  unlocked: boolean,
  totalCompletedTrades: number
): AvoidableLossesSummary {
  if (!unlocked) {
    return {
      kind: "locked",
      message: "Unlock full behavioral analysis to estimate avoidable losses.",
    };
  }

  const costingPatterns = patternsWithMeta.filter(
    (item) => !item.pattern.locked && item.isCosting && item.impact
  );

  if (costingPatterns.length === 0) {
    return {
      kind: "empty",
      message: "Not enough negative patterns yet",
      detail:
        totalCompletedTrades < 30
          ? "Keep journaling more trades to estimate avoidable losses."
          : "Keep reviewing trades to isolate your biggest leak more clearly.",
    };
  }

  const displayAmounts = costingPatterns.map((item) => {
    const rawAmount = item.impact?.amount ?? 0;
    return {
      item,
      amount: Math.abs(rawAmount),
    };
  });

  const totalAmount = displayAmounts.reduce((sum, current) => sum + current.amount, 0);
  const biggestLeak = [...displayAmounts].sort((left, right) => right.amount - left.amount)[0];

  if (!Number.isFinite(totalAmount) || totalAmount <= 0 || !biggestLeak) {
    return {
      kind: "empty",
      message: "Not enough negative patterns yet",
      detail: "Keep journaling more trades to estimate avoidable losses.",
    };
  }

  return {
    kind: "ready",
    amount: totalAmount,
    leak: getAvoidableLeakLabel(biggestLeak.item.pattern),
    rule: getRecommendation(biggestLeak.item.pattern, totalCompletedTrades),
  };
}

function buildDisciplineScoreSummary(args: {
  summary: AnalyticsSummaryResponse | null;
  patternsWithMeta: PatternMeta[];
  unlocked: boolean;
}): DisciplineScoreSummary {
  const { summary, patternsWithMeta, unlocked } = args;
  if (!unlocked) {
    return {
      kind: "locked",
      message: "Unlock full behavioral analysis to score consistency across behavior patterns.",
    };
  }

  let score = 75;
  if ((summary?.win_rate ?? 0) >= 0.6) {
    score += 10;
  }
  if ((summary?.avg_pnl_per_trade ?? 0) > 0) {
    score += 5;
  }

  const highCosting = patternsWithMeta.filter(
    (item) => !item.pattern.locked && item.isCosting && item.pattern.severity === "high"
  ).length;
  const mediumCosting = patternsWithMeta.filter(
    (item) => !item.pattern.locked && item.isCosting && item.pattern.severity === "medium"
  ).length;
  const hasHelpingPattern = patternsWithMeta.some((item) => !item.pattern.locked && item.isHelping);

  score -= Math.min(highCosting * 10, 25);
  score -= Math.min(mediumCosting * 5, 15);
  if (hasHelpingPattern) {
    score += 5;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    kind: "ready",
    score,
    label: score >= 75 ? "Improving" : score >= 55 ? "Stable" : "Needs control",
    note: "Based on consistency across timing, holding period, and repeated mistake patterns.",
  };
}

function summarizeTradeSet(trades: CompletedTradeListItem[]) {
  const winRate = trades.length
    ? trades.filter((trade) => trade.pnl > 0).length / trades.length
    : null;
  const avgPnl = trades.length
    ? trades.reduce((sum, trade) => sum + trade.pnl, 0) / trades.length
    : null;
  return { winRate, avgPnl };
}

function buildImprovementTrendSummary(completedTrades: CompletedTradeListItem[]): ImprovementTrendSummary {
  const sortedTrades = [...completedTrades].sort(
    (left, right) => new Date(right.exit_date).getTime() - new Date(left.exit_date).getTime()
  );

  if (sortedTrades.length < 20) {
    return {
      kind: "not-enough-data",
      title: "Improvement Trend",
      note: "Need more completed trades to show trend.",
    };
  }

  const recent10 = sortedTrades.slice(0, 10);
  const previous10 = sortedTrades.slice(10, 20);
  const recentStats = summarizeTradeSet(recent10);
  const previousStats = summarizeTradeSet(previous10);

  const improvedWinRate =
    recentStats.winRate != null &&
    previousStats.winRate != null &&
    recentStats.winRate > previousStats.winRate;
  const improvedAvgPnl =
    recentStats.avgPnl != null &&
    previousStats.avgPnl != null &&
    recentStats.avgPnl > previousStats.avgPnl;

  return {
    kind: "ready",
    title: improvedWinRate || improvedAvgPnl
      ? "Recent trades show better control"
      : "Recent trades need tighter review",
    note:
      improvedWinRate || improvedAvgPnl
        ? "Recent decisions are showing better discipline than the prior set."
        : "The recent set is softer than the prior one, so this is worth reviewing.",
    recentWinRate: `Recent 10 win rate: ${formatPercent(recentStats.winRate)}`,
    previousWinRate: `Previous 10 win rate: ${formatPercent(previousStats.winRate)}`,
    recentAvgPnl: `Avg P&L change: ${formatSignedCurrency((recentStats.avgPnl ?? 0) - (previousStats.avgPnl ?? 0))}`,
  };
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
  const [completedTrades, setCompletedTrades] = useState<CompletedTradeListItem[]>([]);
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
          setCompletedTrades([]);
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
      const safeCachedPatterns = normalizePatternsEnvelope(cachedPatterns);
      const safeCachedSummary = normalizeAnalyticsSummary(cachedSummary);
      if (safeCachedPatterns) setPatternsData(safeCachedPatterns);
      if (safeCachedSummary) setSummary(safeCachedSummary);
      setLoading(!safeCachedPatterns);

      try {
        const token = await getAuthToken();
        if (!token) {
          throw new Error("Sign in to view your insights.");
        }

        const [patternsResponse, summaryResponse, completedTradesResponse] = await Promise.all([
          getPatterns(token),
          getAnalyticsSummary(token),
          fetchCompletedTrades(token, { limit: 200 }).catch(() => []),
        ]);

        if (active) {
          setPatternsData(normalizePatternsEnvelope(patternsResponse));
          setSummary(normalizeAnalyticsSummary(summaryResponse));
          setCompletedTrades(Array.isArray(completedTradesResponse) ? completedTradesResponse : []);
          setError(null);
        }
        void storageSet(
          CACHED_INSIGHTS_PATTERNS_KEY,
          normalizePatternsEnvelope(patternsResponse)
        ).catch(() => undefined);
        void storageSet(
          CACHED_INSIGHTS_SUMMARY_KEY,
          normalizeAnalyticsSummary(summaryResponse)
        ).catch(() => undefined);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load insights.");
          setPatternsData(null);
          setSummary(null);
          setCompletedTrades([]);
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
      const [patternsResponse, summaryResponse, completedTradesResponse] = await Promise.all([
        getPatterns(token),
        getAnalyticsSummary(token),
        fetchCompletedTrades(token, { limit: 200 }).catch(() => []),
      ]);
      setPatternsData(normalizePatternsEnvelope(patternsResponse));
      setSummary(normalizeAnalyticsSummary(summaryResponse));
      setCompletedTrades(Array.isArray(completedTradesResponse) ? completedTradesResponse : []);
      setError(null);
      void storageSet(
        CACHED_INSIGHTS_PATTERNS_KEY,
        normalizePatternsEnvelope(patternsResponse)
      ).catch(() => undefined);
      void storageSet(
        CACHED_INSIGHTS_SUMMARY_KEY,
        normalizeAnalyticsSummary(summaryResponse)
      ).catch(() => undefined);
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

  const totalCompletedTrades = patternsData?.total_completed_trades ?? 0;
  const threshold = patternsData?.threshold ?? 20;
  const unlocked = patternsData?.unlocked ?? false;
  const progressPct = Math.min((totalCompletedTrades / threshold) * 100, 100);

  const patternsWithMeta = useMemo<PatternMeta[]>(() => {
    return sortPatterns(patternsData?.patterns ?? []).map((pattern) => {
      const impact = estimateImpact(pattern, summary);
      const isCosting = isCostingPattern(pattern, impact);
      const isHelping = isHelpingPattern(pattern, impact);
      return {
        pattern,
        impact,
        confidence: getConfidenceMeta(pattern),
        statusPill: getPatternStatusPill(pattern, impact),
        exampleTrades: getExampleTrades(pattern, completedTrades),
        isCosting,
        isHelping,
      };
    });
  }, [completedTrades, patternsData?.patterns, summary]);

  const weeklyFocusItems = useMemo(() => {
    return patternsWithMeta
      .filter((item) => !item.pattern.locked)
      .map((item) => ({
        severityOrder:
          item.pattern.severity === "high" ? 0 : item.pattern.severity === "medium" ? 1 : 2,
        text: getWeeklyFocusCopy(item.pattern, totalCompletedTrades),
      }))
      .filter((item): item is { severityOrder: number; text: string } => Boolean(item.text))
      .sort((a, b) => a.severityOrder - b.severityOrder)
      .map((item, index) => `Rule ${index + 1}: ${item.text}`)
      .slice(0, 3);
  }, [patternsWithMeta, totalCompletedTrades]);

  const mainFocus = useMemo(() => {
    const unlockedPatterns = patternsWithMeta.filter((item) => !item.pattern.locked);
    if (unlockedPatterns.length === 0) {
      return null;
    }
    return [...unlockedPatterns].sort((left, right) => {
      const rightPriority = getMainFocusPriority(right.pattern, right.impact);
      const leftPriority = getMainFocusPriority(left.pattern, left.impact);
      return rightPriority - leftPriority;
    })[0];
  }, [patternsWithMeta]);

  const avoidableLosses = useMemo(
    () => buildAvoidableLossesSummary(patternsWithMeta, unlocked, totalCompletedTrades),
    [patternsWithMeta, totalCompletedTrades, unlocked]
  );

  const disciplineScore = useMemo(
    () => buildDisciplineScoreSummary({ summary, patternsWithMeta, unlocked }),
    [patternsWithMeta, summary, unlocked]
  );

  const improvementTrend = useMemo(
    () => buildImprovementTrendSummary(completedTrades),
    [completedTrades]
  );

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

  return (
    <section className="insights-root">
      {error ? <div className="connection-error-banner">{error}</div> : null}

      {!unlocked ? (
        <>
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

          <article className="insight-loss-card">
            <div className="insight-loss-title">Avoidable Losses</div>
            <p className="insight-soft-note">{avoidableLosses.kind === "locked" ? avoidableLosses.message : "Unlock full behavioral analysis to estimate avoidable losses."}</p>
          </article>

          <article className="insight-discipline-card">
            <div className="insight-loss-title">Discipline Score</div>
            <p className="insight-soft-note">{disciplineScore.kind === "locked" ? disciplineScore.message : "Unlock full behavioral analysis to score consistency."}</p>
          </article>
        </>
      ) : (
        <>
          {weeklyFocusItems.length ? (
            <section className="weekly-focus-card">
              <div className="weekly-focus-title">This week&apos;s focus</div>
              <div>
                {weeklyFocusItems.map((item) => (
                  <div key={item} className="weekly-focus-item">
                    {item}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {mainFocus ? (
            <article className="insight-main-focus-card">
              <div className="insight-main-focus-label">Main focus this week</div>
              <div className="insight-main-focus-title">
                {getMainFocusHeadline(mainFocus.pattern, totalCompletedTrades)}
              </div>
              {mainFocus.impact ? (
                <div className={`insight-main-focus-impact ${mainFocus.impact.amount >= 0 ? "impact-positive" : "impact-negative"}`}>
                  {mainFocus.impact.text}
                </div>
              ) : null}
              <div className="insight-main-focus-rule">
                Rule this week: {getRecommendation(mainFocus.pattern, totalCompletedTrades)}
              </div>
              <p className="insights-subcopy" style={{ marginTop: 0 }}>
                {getMainFocusWhy(mainFocus.pattern, totalCompletedTrades)}
              </p>
            </article>
          ) : null}

          <article className="insight-loss-card">
            <div className="insight-loss-title">Avoidable Losses</div>
            {avoidableLosses.kind === "ready" ? (
              <>
                <div className="insight-loss-number">
                  Estimated avoidable impact: {formatCurrency(avoidableLosses.amount)}/month
                </div>
                <div className="insight-loss-row">
                  <span>Biggest leak</span>
                  <strong>{avoidableLosses.leak}</strong>
                </div>
                <div className="insight-loss-row">
                  <span>Most useful rule</span>
                  <strong>{avoidableLosses.rule}</strong>
                </div>
              </>
            ) : (
              <>
                <div className="insight-loss-number">{avoidableLosses.message}</div>
                {"detail" in avoidableLosses ? (
                  <p className="insight-soft-note">{avoidableLosses.detail}</p>
                ) : null}
              </>
            )}
          </article>

          <article className="insight-discipline-card">
            <div className="insight-loss-title">Discipline Score</div>
            {disciplineScore.kind === "ready" ? (
              <>
                <div className="insight-discipline-score">{disciplineScore.score}/100</div>
                <div className="insight-discipline-label">{disciplineScore.label}</div>
                <p className="insight-soft-note">{disciplineScore.note}</p>
              </>
            ) : (
              <p className="insight-soft-note">{disciplineScore.message}</p>
            )}
          </article>

          <article className="insight-trend-card">
            <div className="insight-loss-title">Improvement Trend</div>
            <div className="insight-discipline-label">{improvementTrend.title}</div>
            {improvementTrend.kind === "ready" ? (
              <>
                <div className="insight-trend-row">
                  <span>{improvementTrend.recentWinRate}</span>
                </div>
                <div className="insight-trend-row">
                  <span>{improvementTrend.previousWinRate}</span>
                </div>
                <div className="insight-trend-row">
                  <span>{improvementTrend.recentAvgPnl}</span>
                </div>
                <p className="insight-soft-note">{improvementTrend.note}</p>
              </>
            ) : (
              <p className="insight-soft-note">{improvementTrend.note}</p>
            )}
          </article>

          <div className="insights-toolbar">
            <div>
              <h2 className="insights-heading">Mistakes &amp; Strengths</h2>
              <p className="insights-subcopy">
                Your trade history shows what is helping your P&amp;L and what is quietly costing you.
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
            {patternsWithMeta.map(({ pattern, confidence, impact, statusPill, exampleTrades }) => {
              const isExpanded = expanded[pattern.pattern_type] ?? false;

              return (
                <article
                  key={pattern.pattern_type}
                  className={`insights-pattern-card${pattern.locked ? " is-locked" : ""}`}
                  style={{ borderLeft: `4px solid ${severityBorderColor(pattern.severity)}` }}
                >
                  <div className="insights-pattern-content">
                    <div className="insights-pattern-header">
                      <span className="insights-pattern-severity">{severityIcon(pattern.severity)}</span>
                      <div className="insights-pattern-copy">
                        <div className="insights-pattern-title-row">
                          <h3>{getTraderFacingPatternTitle(pattern)}</h3>
                          <span className={`insight-confidence ${confidence.className}`}>
                            {confidence.text}
                          </span>
                          {!pattern.locked ? (
                            <span className={`insight-status-pill ${getPatternStatusClass(statusPill)}`}>
                              {statusPill}
                            </span>
                          ) : null}
                        </div>
                        <p>{getTraderFacingPatternDescription(pattern, totalCompletedTrades)}</p>
                      </div>
                    </div>

                    {impact ? (
                      <div className={`insight-impact ${impact.amount >= 0 ? "impact-positive" : "impact-negative"}`}>
                        {impact.text}
                      </div>
                    ) : null}

                    <div className="insight-next-action">
                      <span>Next action</span>
                      <span>{getRecommendation(pattern, totalCompletedTrades)}</span>
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
                      <>
                        <div className="insights-details-grid">
                          {Object.entries(pattern.data ?? {}).map(([key, value]) => (
                            <div key={key} className="insights-detail-row">
                              <span>{key.replace(/_/g, " ")}</span>
                              <strong>{formatPatternStat(key, value)}</strong>
                            </div>
                          ))}
                        </div>

                        {exampleTrades.length > 0 ? (
                          <div className="insight-proof-trades">
                            <div className="insights-section-title">Proof trades</div>
                            {exampleTrades.map((trade) => (
                              <div key={trade.id} className="insight-proof-row">
                                <span className="insight-proof-symbol">{trade.stock_symbol}</span>
                                <span>{formatExampleTradeDate(trade.entry_date)}</span>
                                <strong className="insight-proof-pnl">{formatSignedCurrency(trade.pnl)}</strong>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </>
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
