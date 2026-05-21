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
  BANDHANBNK: "Banking",
  FEDERALBNK: "Banking",
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
  SAIL: "Metals",
  HINDUNILVR: "FMCG",
  ITC: "FMCG",
  BRITANNIA: "FMCG",
  DABUR: "FMCG",
  MARICO: "FMCG",
};

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

export function getConfidenceMeta(pattern: PatternResponse) {
  const sampleSize = Number(pattern.data?.sample_size ?? 0);
  if (sampleSize > 30) {
    return { className: "confidence-high", text: `High confidence · ${sampleSize} trades analyzed` };
  }
  if (sampleSize >= 20) {
    return { className: "confidence-moderate", text: `Moderate confidence · ${sampleSize} trades` };
  }
  return { className: "confidence-low", text: `Low sample size · ${sampleSize} trades — pattern may change` };
}

export function estimatePatternImpact(
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
      const amount = -Math.abs(gap * Math.max(Math.abs(avgPnl), 1) * Math.max(sampleSize, 1));
      return { amount, text: `Estimated monthly impact: ${formatCurrency(amount)}` };
    }
    case "losing_streak_tilt": {
      const diff =
        Number(pattern.data?.post_streak_avg_pnl ?? 0) -
        Number(pattern.data?.overall_avg_pnl ?? 0);
      const amount = diff * Math.max(1, sampleSize / 3);
      return { amount, text: `Estimated monthly impact: ${formatCurrency(amount)}` };
    }
    case "winning_streak_tilt": {
      const gap =
        Number(pattern.data?.overall_win_rate ?? 0) -
        Number(pattern.data?.post_streak_win_rate ?? 0);
      const amount = -Math.abs(gap * Math.max(Math.abs(avgPnl), 1) * Math.max(sampleSize, 1));
      return { amount, text: `Estimated monthly impact: ${formatCurrency(amount)}` };
    }
    case "sector_concentration": {
      const diff =
        Number(pattern.data?.sector_avg_pnl ?? 0) - Number(pattern.data?.overall_avg_pnl ?? 0);
      const amount = diff * Math.max(1, sampleSize / 4);
      return { amount, text: `Estimated monthly impact: ${formatCurrency(amount)}` };
    }
    case "day_of_week": {
      const gap =
        Number(pattern.data?.best_win_rate ?? 0) - Number(pattern.data?.worst_win_rate ?? 0);
      const amount = gap * Math.max(Math.abs(avgPnl), 1) * Math.max(sampleSize / 2, 1);
      return { amount, text: `Estimated monthly impact: ${formatCurrency(amount)}` };
    }
    default:
      return null;
  }
}

export function getRecommendation(pattern: PatternResponse): string {
  switch (pattern.pattern_type) {
    case "time_of_day":
      return `Consider reducing position size during ${String(pattern.data?.worst_bucket ?? "weaker hours")} or limiting trades to ${String(pattern.data?.best_bucket ?? "your stronger hours")}.`;
    case "day_of_week":
      return `Your data suggests ${String(pattern.data?.best_bucket ?? "some weekdays")} is your stronger day. Consider being more selective on ${String(pattern.data?.worst_bucket ?? "weaker days")}.`;
    case "holding_period":
      return `Your most profitable trades are held for ${String(pattern.data?.best_bucket ?? "your strongest bucket")}. Consider adjusting your holding strategy.`;
    case "revenge_trading":
      return "After a loss, consider waiting at least 30 minutes before entering a new trade.";
    case "overtrading":
      return `On days with more than ${Math.ceil(Number(pattern.data?.average_trades_per_day ?? 0) * 2) || "your usual threshold"} trades, your profitability drops significantly. Consider setting a daily trade limit.`;
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

export type PatternStatus = "costing" | "helping" | "monitoring";

export function getPatternStatus(
  pattern: PatternResponse,
  summary: AnalyticsSummaryResponse | null
): PatternStatus {
  const impact = estimatePatternImpact(pattern, summary);
  const text = `${pattern.title} ${pattern.description}`.toLowerCase();

  if (impact && impact.amount > 0) {
    return "helping";
  }

  if (pattern.pattern_type === "holding_period") {
    const bestAvg = Number(pattern.data?.best_avg_pnl ?? 0);
    const worstAvg = Number(pattern.data?.worst_avg_pnl ?? 0);
    return bestAvg >= worstAvg ? "helping" : "costing";
  }

  if (impact && impact.amount < 0) {
    return "costing";
  }

  if (
    text.includes("best") ||
    text.includes("strong") ||
    text.includes("improving") ||
    text.includes("discipline")
  ) {
    return "helping";
  }

  if (
    text.includes("worst") ||
    text.includes("weak") ||
    text.includes("cost") ||
    text.includes("loss") ||
    text.includes("revenge") ||
    text.includes("overtrad")
  ) {
    return "costing";
  }

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
      return `Your data suggests ${String(pattern.data?.worst_bucket ?? "some weekdays")} are less forgiving. Treat them as lower-conviction sessions unless the setup is exceptional.`;
    case "holding_period":
      return `Your exits are affecting P&L as much as entry quality. The holding bucket doing the real work deserves to become part of your plan.`;
    case "revenge_trading":
      return "Loss-triggered re-entries are showing up as repeat damage, which points to emotional continuation instead of fresh opportunity.";
    case "overtrading":
      return "More trades are not producing more edge in your data. Past a certain point, decision quality falls faster than opportunity rises.";
    case "sector_concentration":
      return "Your results are clustering by sector. That can be useful if the edge is real, or expensive if you keep forcing the wrong pocket.";
    case "winning_streak_tilt":
      return "After a run of wins, your process may be loosening. Protect size discipline when confidence is high.";
    case "losing_streak_tilt":
      return "After losses, your next decisions appear more fragile. Damage control matters more than forcing recovery.";
    default:
      return pattern.description;
  }
}

export function getRuleLikeRecommendation(pattern: PatternResponse): string {
  switch (pattern.pattern_type) {
    case "time_of_day":
      return `Trade smaller during ${String(pattern.data?.worst_bucket ?? "weak hours")}.`;
    case "day_of_week":
      return `Demand A-grade setups on ${String(pattern.data?.worst_bucket ?? "your weak day")}.`;
    case "holding_period":
      return `Match exits to your best holding bucket.`;
    case "revenge_trading":
      return "Wait 30 minutes after a loss.";
    case "overtrading":
      return "Set a hard daily trade cap.";
    case "sector_concentration":
      return "Only press size in sectors that prove edge.";
    case "winning_streak_tilt":
      return "Keep size constant after a hot streak.";
    case "losing_streak_tilt":
      return "Cut size after consecutive losses.";
    default:
      return "Turn this pattern into a review rule.";
  }
}

export function getPatternProofTrades(
  pattern: PatternResponse,
  completedTrades: CompletedTrade[]
): CompletedTrade[] {
  const sorted = [...completedTrades].sort(
    (left, right) => Math.abs(right.pnl) - Math.abs(left.pnl)
  );

  switch (pattern.pattern_type) {
    case "holding_period": {
      const worstBucket = String(pattern.data?.worst_bucket ?? "").toLowerCase();
      return sorted
        .filter((trade) => {
          if (worstBucket.includes("intra")) return trade.holding_days <= 1;
          if (worstBucket.includes("swing")) return trade.holding_days > 1 && trade.holding_days <= 7;
          if (worstBucket.includes("position")) return trade.holding_days > 7;
          return true;
        })
        .slice(0, 3);
    }
    default:
      return sorted.slice(0, 3);
  }
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
    Object.entries(holdingCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Building sample";

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
      .sort((a, b) => b[1].wins / b[1].total - a[1].wins / a[1].total)[0]?.[0] ?? "Building sample";

  const timePattern = patterns.find((pattern) => pattern.pattern_type === "time_of_day");
  const bestTradingHours = String(timePattern?.data?.best_bucket ?? "Building sample");

  const emotionCounts = trades.reduce<Record<string, number>>((acc, trade) => {
    const key = trade.emotion_tag?.trim();
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const emotionalPattern =
    Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Not tagged yet";

  const disciplineScore = Math.round(
    ((trades.filter((trade) => Boolean(trade.emotion_tag)).length / Math.max(trades.length, 1)) * 50) +
      ((completedTrades.filter((trade) => trade.pnl > 0).length / Math.max(completedTrades.length, 1)) * 50)
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
  if (completedTrades.length < 30) {
    return null;
  }

  const sorted = [...completedTrades].sort(
    (a, b) => new Date(a.exit_date).getTime() - new Date(b.exit_date).getTime()
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
    dailyPnl.set(trade.exit_date, (dailyPnl.get(trade.exit_date) ?? 0) + trade.pnl);
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

  const totalScore = Math.round(
    Math.max(0, Math.min(100, winRateScore + consistencyScore + riskDisciplineScore + emotionalAwarenessScore))
  );

  return {
    totalScore,
    winRateScore,
    consistencyScore,
    riskDisciplineScore,
    emotionalAwarenessScore,
  };
}
