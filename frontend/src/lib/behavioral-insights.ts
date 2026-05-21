import type { AnalyticsSummaryResponse, PatternResponse } from "@/lib/analytics";
import type { CompletedTrade, Trade } from "@/types/trade";
import type { User } from "@/types/user";

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const SECTOR_MAP: Record<string, string> = {
  TCS: "IT",
  INFY: "IT",
  WIPRO: "IT",
  HCLTECH: "IT",
  TECHM: "IT",
  LTIM: "IT",
  HDFCBANK: "Banking",
  ICICIBANK: "Banking",
  SBIN: "Banking",
  KOTAKBANK: "Banking",
  AXISBANK: "Banking",
  INDUSINDBK: "Banking",
  BAJFINANCE: "NBFC",
  BAJAJFINSV: "NBFC",
  RELIANCE: "Energy",
  ONGC: "Energy",
  BPCL: "Energy",
  IOC: "Energy",
  GAIL: "Energy",
  SUNPHARMA: "Pharma",
  DRREDDY: "Pharma",
  CIPLA: "Pharma",
  DIVISLAB: "Pharma",
  LUPIN: "Pharma",
  TATAMOTORS: "Auto",
  MARUTI: "Auto",
  "BAJAJ-AUTO": "Auto",
  HEROMOTOCO: "Auto",
  EICHERMOT: "Auto",
  TATASTEEL: "Metals",
  JSWSTEEL: "Metals",
  HINDALCO: "Metals",
  VEDL: "Metals",
  ITC: "FMCG",
  HINDUNILVR: "FMCG",
};

export type PatternStatus = "costing" | "helping" | "monitoring";

export type PatternMetricTile = {
  label: string;
  value: string;
};

export type PatternSummaryCard = {
  title: string;
  detail: string;
  action: string;
  impactText: string | null;
  patternType: string | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "₹--";
  }
  return `₹${CURRENCY_FORMATTER.format(value)}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }
  return `${(value * 100).toFixed(0)}%`;
}

export function severityBadgeClass(severity: string): string {
  if (severity === "high") return "badge-rose";
  if (severity === "medium") return "badge-indigo";
  return "badge-emerald";
}

export function severityBorderColor(severity: string): string {
  if (severity === "high") return "#ef4444";
  if (severity === "medium") return "#f59e0b";
  return "#10b981";
}

function getPatternSampleSize(pattern: PatternResponse): number {
  return toNumber(pattern.data?.sample_size) ?? toNumber(pattern.data?.trade_count) ?? 0;
}

export function getConfidenceMeta(pattern: PatternResponse) {
  const sampleSize = getPatternSampleSize(pattern);
  if (sampleSize > 30) {
    return { className: "confidence-high", text: `High confidence · ${sampleSize} trades analyzed` };
  }
  if (sampleSize >= 20) {
    return { className: "confidence-moderate", text: `Moderate confidence · ${sampleSize} trades` };
  }
  return { className: "confidence-low", text: `Early read · ${sampleSize} trades` };
}

export function estimatePatternImpact(
  pattern: PatternResponse,
  summary: AnalyticsSummaryResponse | null
): { amount: number; text: string } | null {
  const sampleSize = getPatternSampleSize(pattern);
  const avgPnl = summary?.avg_pnl_per_trade ?? 0;

  switch (pattern.pattern_type) {
    case "revenge_trading": {
      const pnl = toNumber(pattern.data?.revenge_trade_pnl);
      if (pnl == null) return null;
      return { amount: pnl, text: `Estimated monthly swing: ${formatCurrency(pnl)}` };
    }
    case "time_of_day": {
      const gap =
        (toNumber(pattern.data?.best_win_rate) ?? 0) -
        (toNumber(pattern.data?.worst_win_rate) ?? 0);
      const amount = Math.abs(gap) * Math.max(Math.abs(avgPnl), 1) * Math.max(sampleSize, 1);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return { amount: -amount, text: `Estimated monthly swing: ${formatCurrency(amount)}` };
    }
    case "day_of_week": {
      const gap =
        (toNumber(pattern.data?.best_win_rate) ?? 0) -
        (toNumber(pattern.data?.worst_win_rate) ?? 0);
      const amount = Math.abs(gap) * Math.max(Math.abs(avgPnl), 1) * Math.max(sampleSize / 2, 1);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return { amount: -amount, text: `Estimated monthly swing: ${formatCurrency(amount)}` };
    }
    case "holding_period": {
      const diff =
        (toNumber(pattern.data?.best_avg_pnl) ?? 0) -
        (toNumber(pattern.data?.worst_avg_pnl) ?? 0);
      if (!Number.isFinite(diff) || diff === 0) return null;
      const amount = Math.abs(diff) * Math.max(1, sampleSize / 6);
      return {
        amount: diff >= 0 ? amount : -amount,
        text: `Estimated monthly swing: ${formatCurrency(amount)}`,
      };
    }
    case "overtrading": {
      const gap =
        (toNumber(pattern.data?.normal_day_win_rate) ?? 0) -
        (toNumber(pattern.data?.high_volume_day_win_rate) ?? 0);
      const amount = Math.abs(gap) * Math.max(Math.abs(avgPnl), 1) * Math.max(sampleSize, 1);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return { amount: -amount, text: `Estimated monthly swing: ${formatCurrency(amount)}` };
    }
    case "losing_streak_tilt": {
      const diff =
        (toNumber(pattern.data?.post_streak_avg_pnl) ?? 0) -
        (toNumber(pattern.data?.overall_avg_pnl) ?? 0);
      const amount = Math.abs(diff) * Math.max(1, sampleSize / 3);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return { amount: -amount, text: `Estimated monthly swing: ${formatCurrency(amount)}` };
    }
    case "winning_streak_tilt": {
      const gap =
        (toNumber(pattern.data?.overall_win_rate) ?? 0) -
        (toNumber(pattern.data?.post_streak_win_rate) ?? 0);
      const amount = Math.abs(gap) * Math.max(Math.abs(avgPnl), 1) * Math.max(sampleSize, 1);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return { amount: -amount, text: `Estimated monthly swing: ${formatCurrency(amount)}` };
    }
    case "sector_concentration": {
      const diff =
        (toNumber(pattern.data?.sector_avg_pnl) ?? 0) -
        (toNumber(pattern.data?.overall_avg_pnl) ?? 0);
      const amount = Math.abs(diff) * Math.max(1, sampleSize / 4);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return { amount: diff >= 0 ? amount : -amount, text: `Estimated monthly swing: ${formatCurrency(amount)}` };
    }
    default:
      return null;
  }
}

export function getRecommendation(pattern: PatternResponse): string {
  switch (pattern.pattern_type) {
    case "time_of_day":
      return `Trade smaller during ${String(pattern.data?.worst_bucket ?? "your weaker hours")} and keep your better size for ${String(pattern.data?.best_bucket ?? "your stronger window")}.`;
    case "day_of_week":
      return `Demand your best setups on ${String(pattern.data?.worst_bucket ?? "weaker days")}.`;
    case "holding_period":
      return `Bias exits toward ${String(pattern.data?.best_bucket ?? "your stronger hold bucket")}.`;
    case "revenge_trading":
      return "Pause after a loss before the next entry.";
    case "overtrading":
      return `Set a hard daily cap around ${Math.ceil((toNumber(pattern.data?.average_trades_per_day) ?? 2) * 2)} trades.`;
    case "sector_concentration":
      return `Only press size when ${String(pattern.data?.sector ?? "that sector")} is actually proving edge.`;
    case "winning_streak_tilt":
      return "Keep sizing constant after a hot streak.";
    case "losing_streak_tilt":
      return "Cut size or stop after clustered losses.";
    default:
      return "Turn this repeat behavior into a written review rule.";
  }
}

export function getRuleLikeRecommendation(pattern: PatternResponse): string {
  return getRecommendation(pattern);
}

export function getPatternStatus(
  pattern: PatternResponse,
  summary: AnalyticsSummaryResponse | null
): PatternStatus {
  const impact = estimatePatternImpact(pattern, summary);
  if (impact && impact.amount > 0) return "helping";
  if (impact && impact.amount < 0) return "costing";

  if (pattern.pattern_type === "holding_period") {
    return (toNumber(pattern.data?.best_avg_pnl) ?? 0) >= (toNumber(pattern.data?.worst_avg_pnl) ?? 0)
      ? "helping"
      : "costing";
  }

  const text = `${pattern.title} ${pattern.description}`.toLowerCase();
  if (/(best|strong|improving|positive)/.test(text)) return "helping";
  if (/(worst|weak|loss|revenge|overtrad|drag)/.test(text)) return "costing";
  return "monitoring";
}

export function getPatternStatusLabel(status: PatternStatus): string {
  if (status === "costing") return "Costing money";
  if (status === "helping") return "Helping you";
  return "Needs attention";
}

export function getPatternStatusGroupTitle(status: PatternStatus): string {
  if (status === "costing") return "Costing you";
  if (status === "helping") return "Helping you";
  return "Needs monitoring";
}

export function getTraderFacingPatternTitle(pattern: PatternResponse): string {
  switch (pattern.pattern_type) {
    case "time_of_day":
      return `${String(pattern.data?.worst_bucket ?? "Certain hours")} are dragging your edge`;
    case "day_of_week":
      return `${String(pattern.data?.worst_bucket ?? "Certain days")} need more selectivity`;
    case "holding_period":
      return "Your holding time is shaping outcomes";
    case "revenge_trading":
      return "Follow-up trades after losses are hurting";
    case "overtrading":
      return "Activity spikes are eroding quality";
    case "sector_concentration":
      return "Your sector concentration needs cleaner focus";
    case "winning_streak_tilt":
      return "Winning streaks may be loosening discipline";
    case "losing_streak_tilt":
      return "Losing streaks are compounding damage";
    default:
      return pattern.title;
  }
}

export function getTraderFacingPatternDescription(pattern: PatternResponse): string {
  switch (pattern.pattern_type) {
    case "time_of_day":
      return `Your entries around ${String(pattern.data?.worst_bucket ?? "this window")} are underperforming. Tighten standards there and press harder during ${String(pattern.data?.best_bucket ?? "stronger windows")}.`;
    case "day_of_week":
      return `Your weaker day is showing up clearly enough to deserve a rule, not a guess.`;
    case "holding_period":
      return `Your exit timing is shaping as much of the outcome as the setup itself.`;
    case "revenge_trading":
      return "Post-loss re-entries are showing up as repeated damage instead of fresh opportunity.";
    case "overtrading":
      return "More activity is not creating more edge in your own data.";
    case "sector_concentration":
      return "Your P&L is clustering around one pocket of the market, which can help when it works and hurt when it does not.";
    case "winning_streak_tilt":
      return "Confidence after a run of wins may be drifting into size or discipline slippage.";
    case "losing_streak_tilt":
      return "Losses appear to be carrying forward into the next decision.";
    default:
      return pattern.description;
  }
}

export function getPatternProofTrades(
  pattern: PatternResponse,
  completedTrades: CompletedTrade[]
): CompletedTrade[] {
  const sorted = [...completedTrades].sort((left, right) => Math.abs(right.pnl) - Math.abs(left.pnl));
  const symbol = String(pattern.data?.symbol ?? "").toUpperCase();
  if (symbol) {
    const matches = sorted.filter((trade) => trade.stock_symbol.toUpperCase() === symbol);
    if (matches.length) return matches.slice(0, 3);
  }

  if (pattern.pattern_type === "holding_period") {
    const worstBucket = String(pattern.data?.worst_bucket ?? "").toLowerCase();
    return sorted
      .filter((trade) => {
        if (worstBucket.includes("intra")) return trade.holding_days <= 1;
        if (worstBucket.includes("swing")) return trade.holding_days > 1 && trade.holding_days <= 7;
        if (worstBucket.includes("position") || worstBucket.includes("week")) return trade.holding_days > 7;
        return true;
      })
      .slice(0, 3);
  }

  return sorted.slice(0, 3);
}

export function getPatternMetricTiles(pattern: PatternResponse): PatternMetricTile[] {
  const tiles: PatternMetricTile[] = [];
  const sampleSize = getPatternSampleSize(pattern);

  function push(label: string, value: string | null) {
    if (!value || value === "--") return;
    tiles.push({ label, value });
  }

  switch (pattern.pattern_type) {
    case "time_of_day":
    case "day_of_week":
      push("Best bucket", String(pattern.data?.best_bucket ?? "--"));
      push("Worst bucket", String(pattern.data?.worst_bucket ?? "--"));
      push("Best win rate", formatPercent(toNumber(pattern.data?.best_win_rate)));
      push("Worst win rate", formatPercent(toNumber(pattern.data?.worst_win_rate)));
      break;
    case "holding_period":
      push("Best hold", String(pattern.data?.best_bucket ?? "--"));
      push("Worst hold", String(pattern.data?.worst_bucket ?? "--"));
      push("Best avg P&L", formatCurrency(toNumber(pattern.data?.best_avg_pnl)));
      push("Worst avg P&L", formatCurrency(toNumber(pattern.data?.worst_avg_pnl)));
      break;
    case "overtrading":
      push("Normal-day win rate", formatPercent(toNumber(pattern.data?.normal_day_win_rate)));
      push("High-activity win rate", formatPercent(toNumber(pattern.data?.high_volume_day_win_rate)));
      push("Avg trades / day", String(toNumber(pattern.data?.average_trades_per_day) ?? "--"));
      break;
    case "revenge_trading":
      push("Revenge win rate", formatPercent(toNumber(pattern.data?.revenge_win_rate)));
      push("Impact", formatCurrency(toNumber(pattern.data?.revenge_trade_pnl)));
      break;
    case "sector_concentration":
      push("Sector", String(pattern.data?.sector ?? "--"));
      push("Sector avg P&L", formatCurrency(toNumber(pattern.data?.sector_avg_pnl)));
      push("Overall avg P&L", formatCurrency(toNumber(pattern.data?.overall_avg_pnl)));
      break;
    default:
      break;
  }

  push("Sample size", sampleSize ? `${sampleSize} trades` : null);
  return tiles.slice(0, 5);
}

export function getStrongestEdgeSummary(
  patterns: PatternResponse[],
  summary: AnalyticsSummaryResponse | null
): PatternSummaryCard {
  const helping = patterns
    .map((pattern) => ({ pattern, impact: estimatePatternImpact(pattern, summary) }))
    .filter((item) => getPatternStatus(item.pattern, summary) === "helping")
    .sort((left, right) => Math.abs(right.impact?.amount ?? 0) - Math.abs(left.impact?.amount ?? 0))[0];

  if (!helping) {
    return {
      title: "Strongest edge still forming",
      detail: "Your cleaner edge will show up once more completed trades and tagged reviews accumulate.",
      action: "Keep tagging strong setups and outcomes.",
      impactText: null,
      patternType: null,
    };
  }

  return {
    title: getTraderFacingPatternTitle(helping.pattern),
    detail: getTraderFacingPatternDescription(helping.pattern),
    action: getRecommendation(helping.pattern),
    impactText: helping.impact?.text ?? null,
    patternType: helping.pattern.pattern_type,
  };
}

export function getBiggestLeakSummary(
  patterns: PatternResponse[],
  summary: AnalyticsSummaryResponse | null
): PatternSummaryCard {
  const costing = patterns
    .map((pattern) => ({ pattern, impact: estimatePatternImpact(pattern, summary) }))
    .filter((item) => getPatternStatus(item.pattern, summary) === "costing")
    .sort((left, right) => Math.abs(right.impact?.amount ?? 0) - Math.abs(left.impact?.amount ?? 0))[0];

  if (!costing) {
    return {
      title: "No dominant leak yet",
      detail: "Your journal does not show one clear leak above the rest yet.",
      action: "Keep journaling repeat mistakes so the biggest drag becomes obvious.",
      impactText: null,
      patternType: null,
    };
  }

  return {
    title: getTraderFacingPatternTitle(costing.pattern),
    detail: getTraderFacingPatternDescription(costing.pattern),
    action: getRecommendation(costing.pattern),
    impactText: costing.impact?.text ?? null,
    patternType: costing.pattern.pattern_type,
  };
}

export function getAvoidableImpactSummary(
  patterns: PatternResponse[],
  summary: AnalyticsSummaryResponse | null
): string {
  const impacts = patterns
    .map((pattern) => estimatePatternImpact(pattern, summary))
    .filter((impact): impact is { amount: number; text: string } => Boolean(impact))
    .filter((impact) => impact.amount < 0);

  if (!impacts.length) {
    return "No clear avoidable-impact estimate yet.";
  }

  const total = impacts.reduce((sum, impact) => sum + Math.abs(impact.amount), 0);
  return `Estimated avoidable swing: ${formatCurrency(total)}/month`;
}

export function getScoreFraming(args: {
  summary: AnalyticsSummaryResponse | null;
  trades: Trade[];
  patterns: PatternResponse[];
}): { drag: string; nextFix: string; strength: string } {
  const { summary, trades, patterns } = args;
  const totalTrades = trades.length;
  const taggedTrades = trades.filter((trade) => Boolean(trade.emotion_tag)).length;
  const emotionCoverage = taggedTrades / Math.max(totalTrades, 1);
  const biggestLeak = getBiggestLeakSummary(patterns, summary);
  const strongestEdge = getStrongestEdgeSummary(patterns, summary);

  let drag = "Pattern sample size";
  let nextFix = "Keep capturing completed trades to sharpen pattern confidence.";

  if (emotionCoverage < 0.4) {
    drag = "Emotional awareness";
    nextFix = "Tag missing emotions and add short follow-up notes on recent trades.";
  } else if (biggestLeak.patternType) {
    drag = biggestLeak.title;
    nextFix = biggestLeak.action;
  } else if ((summary?.win_rate ?? 0) < 0.5) {
    drag = "Win-rate pressure";
    nextFix = "Reduce low-conviction activity and review weak setups first.";
  }

  const strength =
    strongestEdge.patternType != null
      ? strongestEdge.title
      : (summary?.avg_pnl_per_trade ?? 0) > 0
        ? "Positive average trade"
        : "Consistency still forming";

  return { drag, nextFix, strength };
}

function getHoldingBucket(days: number): "Intraday" | "Swing" | "Positional" {
  if (days <= 1) return "Intraday";
  if (days <= 7) return "Swing";
  return "Positional";
}

export function buildTraderProfile(args: {
  user: User | null;
  trades: Trade[];
  completedTrades: CompletedTrade[];
  patterns: PatternResponse[];
}) {
  const { user, trades, completedTrades, patterns } = args;
  const holdingCounts = completedTrades.reduce<Record<string, number>>((acc, trade) => {
    const bucket = getHoldingBucket(trade.holding_days);
    acc[bucket] = (acc[bucket] ?? 0) + 1;
    return acc;
  }, {});

  const tradingStyle =
    Object.entries(holdingCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Building sample";

  const sectorStats = new Map<string, { wins: number; total: number }>();
  for (const trade of completedTrades) {
    const sector = SECTOR_MAP[trade.stock_symbol.toUpperCase()] ?? "Other";
    const current = sectorStats.get(sector) ?? { wins: 0, total: 0 };
    current.total += 1;
    if (trade.pnl > 0) current.wins += 1;
    sectorStats.set(sector, current);
  }
  const strongestSector =
    [...sectorStats.entries()]
      .filter(([, value]) => value.total > 0)
      .sort((left, right) => right[1].wins / right[1].total - left[1].wins / left[1].total)[0]?.[0] ?? "Building sample";

  const timePattern = patterns.find((pattern) => pattern.pattern_type === "time_of_day");
  const bestTradingHours = String(timePattern?.data?.best_bucket ?? "Building sample");

  const emotionCounts = trades.reduce<Record<string, number>>((acc, trade) => {
    const key = trade.emotion_tag?.trim();
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const emotionalPattern =
    Object.entries(emotionCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Not tagged yet";

  const disciplineScore = Math.round(
    (trades.filter((trade) => Boolean(trade.emotion_tag)).length / Math.max(trades.length, 1)) * 50 +
      (completedTrades.filter((trade) => trade.pnl > 0).length / Math.max(completedTrades.length, 1)) * 50
  );

  return {
    tradingStyle,
    strongestSector,
    bestTradingHours,
    emotionalPattern,
    disciplineScore,
    memberSince: user?.created_at ?? null,
  };
}

export function buildBeforeAfter(completedTrades: CompletedTrade[]) {
  if (completedTrades.length < 30) return null;

  const sorted = [...completedTrades].sort(
    (left, right) => new Date(left.exit_date).getTime() - new Date(right.exit_date).getTime()
  );
  const midpoint = Math.floor(sorted.length / 2);
  const earlier = sorted.slice(0, midpoint);
  const recent = sorted.slice(midpoint);
  const summarize = (trades: CompletedTrade[]) => ({
    winRate: trades.filter((trade) => trade.pnl > 0).length / Math.max(trades.length, 1),
    avgPnl: trades.reduce((sum, trade) => sum + trade.pnl, 0) / Math.max(trades.length, 1),
    avgHolding: trades.reduce((sum, trade) => sum + trade.holding_days, 0) / Math.max(trades.length, 1),
  });

  const earlierStats = summarize(earlier);
  const recentStats = summarize(recent);
  const improved =
    recentStats.winRate > earlierStats.winRate && recentStats.avgPnl >= earlierStats.avgPnl;

  return { earlierStats, recentStats, improved };
}

export function buildPerformanceScore(args: {
  summary: AnalyticsSummaryResponse;
  completedTrades: CompletedTrade[];
  trades: Trade[];
}) {
  const { summary, completedTrades, trades } = args;
  if (completedTrades.length === 0 && trades.length === 0) {
    return {
      totalScore: 0,
      winRateScore: 0,
      consistencyScore: 0,
      riskDisciplineScore: 0,
      emotionalAwarenessScore: 0,
    };
  }

  const winRateScore = Math.max(0, Math.min(30, summary.win_rate * 30));
  const dailyPnl = new Map<string, number>();
  for (const trade of completedTrades) {
    dailyPnl.set(trade.exit_date.slice(0, 10), (dailyPnl.get(trade.exit_date.slice(0, 10)) ?? 0) + trade.pnl);
  }

  const dailyValues = [...dailyPnl.values()];
  let consistencyScore = 10;
  if (dailyValues.length > 0) {
    const positiveDays = dailyValues.filter((value) => value > 0).length;
    const negativeDays = dailyValues.filter((value) => value < 0).length;
    if (negativeDays === 0) {
      consistencyScore = 20;
    } else if (positiveDays <= negativeDays) {
      consistencyScore = 5;
    } else {
      consistencyScore = 10 + (positiveDays / dailyValues.length) * 10;
    }
  }

  const riskDisciplineScore = 15;
  const emotionalAwarenessScore =
    (trades.filter((trade) => Boolean(trade.emotion_tag)).length / Math.max(trades.length, 1)) * 25;

  return {
    totalScore: Math.round(
      Math.max(0, Math.min(100, winRateScore + consistencyScore + riskDisciplineScore + emotionalAwarenessScore))
    ),
    winRateScore,
    consistencyScore,
    riskDisciplineScore,
    emotionalAwarenessScore,
  };
}
