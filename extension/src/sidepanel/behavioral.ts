import { getAnalyticsSummary, getPatterns, type AnalyticsSummaryResponse, type MarketDashboardData, type PatternResponse, type PatternsEnvelope } from "../shared/api";
import type { CaptureState, CapturedTrade } from "../shared/captures";

const MARKET_TIMEZONE = "Asia/Kolkata";
const PATTERN_CACHE_TTL_MS = 5 * 60_000;
const SUMMARY_CACHE_TTL_MS = 5 * 60_000;

type CacheRecord<T> = {
  token: string;
  value: T;
  cachedAt: number;
};

let patternsCache: CacheRecord<PatternsEnvelope> | null = null;
let summaryCache: CacheRecord<AnalyticsSummaryResponse> | null = null;

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
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
  CHOLAFIN: "NBFC",
  MUTHOOTFIN: "NBFC",
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

export type SessionKind = "weekend" | "pre-market" | "market-open" | "post-market";

export type PulseBadgeTone = "green" | "amber" | "red" | "neutral";

export type BehavioralWarning = {
  id: string;
  severity: "red" | "amber";
  title: string;
  detail: string;
  priority: number;
};

export type RealtimeRiskAlert = {
  id: string;
  severity: "amber" | "red";
  emoji: string;
  title: string;
  detail: string;
  priority: number;
};

export type CapturePerformanceStats = {
  tradeCount: number;
  realizedPnl: number | null;
  closedTrades: number;
  winRate: number | null;
  quickReentryAfterLoss: boolean;
  quickReentryWinRate: number | null;
  losingStreakCount: number;
  losingStreakLossMultiplier: number | null;
  lastTradeMinutes: number | null;
  sectorConcentration: { sector: string; share: number } | null;
};

export type SessionContext = {
  kind: SessionKind;
  weekday: string;
  hour: number;
  minute: number;
  minutesFromMidnight: number;
};

export type PlanValue = "YES" | "PARTIAL" | "NO" | null;
export type ReasonValue =
  | "EARLY_EXIT"
  | "LATE_ENTRY"
  | "REVENGE"
  | "OVERSIZED"
  | "FOMO"
  | "IGNORED_SL"
  | null;

const PLAN_PATTERN = /\[PLAN:(YES|PARTIAL|NO)\]\s*/gi;
const REASON_PATTERN = /\[REASON:([A-Z_]+)\]\s*/gi;

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "0";
  }
  return CURRENCY_FORMATTER.format(Math.round(value));
}

export function formatPercent(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }
  return `${(value * 100).toFixed(decimals)}%`;
}

export function getSessionContext(now = new Date()): SessionContext {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const minutesFromMidnight = hour * 60 + minute;
  const isWeekend = weekday === "Sat" || weekday === "Sun";

  if (isWeekend) {
    return { kind: "weekend", weekday, hour, minute, minutesFromMidnight };
  }
  if (minutesFromMidnight < 9 * 60 + 15) {
    return { kind: "pre-market", weekday, hour, minute, minutesFromMidnight };
  }
  if (minutesFromMidnight <= 15 * 60 + 30) {
    return { kind: "market-open", weekday, hour, minute, minutesFromMidnight };
  }
  return { kind: "post-market", weekday, hour, minute, minutesFromMidnight };
}

export function getIstDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARKET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

export function getCurrentHourBucket(context: SessionContext): string {
  const displayHour = context.hour % 12 || 12;
  const suffix = context.hour < 12 ? "AM" : "PM";
  const nextHour = (context.hour + 1) % 24;
  const nextDisplay = nextHour % 12 || 12;
  const nextSuffix = nextHour < 12 ? "AM" : "PM";
  return `${displayHour} ${suffix}-${nextDisplay} ${nextSuffix}`;
}

function parseTradeMinutes(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function tradeSortValue(trade: CapturedTrade): number {
  const minutes = parseTradeMinutes(trade.trade_time);
  if (minutes != null) {
    return minutes;
  }
  if (trade.created_at) {
    const date = new Date(trade.created_at);
    if (!Number.isNaN(date.getTime())) {
      return date.getHours() * 60 + date.getMinutes();
    }
  }
  return 0;
}

export function extractPlanMetadata(note: string | null | undefined): {
  plan: PlanValue;
  reason: ReasonValue;
  text: string;
} {
  const raw = note ?? "";
  const planMatch = raw.match(/\[PLAN:(YES|PARTIAL|NO)\]/i);
  const reasonMatch = raw.match(/\[REASON:([A-Z_]+)\]/i);
  const text = raw
    .replace(PLAN_PATTERN, "")
    .replace(REASON_PATTERN, "")
    .trim();

  return {
    plan: (planMatch?.[1]?.toUpperCase() as PlanValue | undefined) ?? null,
    reason: (reasonMatch?.[1]?.toUpperCase() as ReasonValue | undefined) ?? null,
    text,
  };
}

export function composePlanNote(args: {
  plan: PlanValue;
  reason: ReasonValue;
  text: string;
}): string {
  const parts = [
    args.plan ? `[PLAN:${args.plan}]` : "",
    args.reason ? `[REASON:${args.reason}]` : "",
    args.text.trim(),
  ].filter(Boolean);
  return parts.join(" ").trim();
}

function estimateTradeSector(symbol: string): string {
  return SECTOR_MAP[symbol.toUpperCase()] ?? "Other";
}

export function getCapturePerformanceStats(captureState: CaptureState | null): CapturePerformanceStats {
  const trades = [...(captureState?.trades ?? [])].sort((a, b) => tradeSortValue(a) - tradeSortValue(b));
  const openLots = new Map<string, Array<{ quantity: number; price: number }>>();
  const closedPnls: number[] = [];
  let realizedPnl = 0;
  let closedTrades = 0;
  let wins = 0;
  let quickReentryAfterLoss = false;
  let lastLossCloseAt: number | null = null;

  for (const trade of trades) {
    const symbol = trade.stock_symbol.toUpperCase();
    const minutes = tradeSortValue(trade);

    if (lastLossCloseAt != null && minutes - lastLossCloseAt <= 15) {
      quickReentryAfterLoss = true;
      lastLossCloseAt = null;
    }

    if (trade.trade_type === "BUY") {
      const lots = openLots.get(symbol) ?? [];
      lots.push({ quantity: trade.quantity, price: trade.price });
      openLots.set(symbol, lots);
      continue;
    }

    let remaining = trade.quantity;
    let tradePnl = 0;
    const lots = openLots.get(symbol) ?? [];

    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      const matchedQty = Math.min(remaining, lot.quantity);
      tradePnl += (trade.price - lot.price) * matchedQty;
      lot.quantity -= matchedQty;
      remaining -= matchedQty;
      if (lot.quantity <= 0) {
        lots.shift();
      }
    }

    if (trade.quantity !== remaining) {
      closedTrades += 1;
      realizedPnl += tradePnl;
      closedPnls.push(tradePnl);
      if (tradePnl > 0) {
        wins += 1;
      }
      if (tradePnl < 0) {
        lastLossCloseAt = minutes;
      } else {
        lastLossCloseAt = null;
      }
    }
  }

  let losingStreakCount = 0;
  for (let index = closedPnls.length - 1; index >= 0; index -= 1) {
    if (closedPnls[index] < 0) {
      losingStreakCount += 1;
      continue;
    }
    break;
  }

  const allLosses = closedPnls.filter((pnl) => pnl < 0).map((pnl) => Math.abs(pnl));
  const streakLosses = closedPnls.slice(-losingStreakCount).filter((pnl) => pnl < 0).map((pnl) => Math.abs(pnl));
  const avgLoss =
    allLosses.length > 0 ? allLosses.reduce((sum, value) => sum + value, 0) / allLosses.length : null;
  const avgStreakLoss =
    streakLosses.length > 0 ? streakLosses.reduce((sum, value) => sum + value, 0) / streakLosses.length : null;

  const sectorCounter = new Map<string, number>();
  for (const trade of trades) {
    const sector = estimateTradeSector(trade.stock_symbol);
    sectorCounter.set(sector, (sectorCounter.get(sector) ?? 0) + 1);
  }

  const dominantSectorEntry = [...sectorCounter.entries()].sort((a, b) => b[1] - a[1])[0];
  const sectorConcentration =
    dominantSectorEntry && trades.length > 0
      ? {
          sector: dominantSectorEntry[0],
          share: dominantSectorEntry[1] / trades.length,
        }
      : null;

  return {
    tradeCount: trades.length,
    realizedPnl: closedTrades > 0 ? Number(realizedPnl.toFixed(2)) : null,
    closedTrades,
    winRate: closedTrades > 0 ? wins / closedTrades : null,
    quickReentryAfterLoss,
    quickReentryWinRate: null,
    losingStreakCount,
    losingStreakLossMultiplier:
      avgLoss && avgStreakLoss ? Number((avgStreakLoss / avgLoss).toFixed(1)) : null,
    lastTradeMinutes: trades.length > 0 ? tradeSortValue(trades[trades.length - 1]) : null,
    sectorConcentration,
  };
}

export function findPattern(
  patterns: PatternResponse[] | undefined,
  patternType: string
): PatternResponse | null {
  return patterns?.find((pattern) => pattern.pattern_type === patternType && !pattern.locked) ?? null;
}

export function getPatternSeverityRank(severity: PatternResponse["severity"]): number {
  if (severity === "high") return 0;
  if (severity === "medium") return 1;
  return 2;
}

export function getOvertradingThreshold(pattern: PatternResponse | null): number | null {
  const average = Number(pattern?.data?.average_trades_per_day ?? NaN);
  if (!Number.isFinite(average) || average <= 0) {
    return null;
  }
  return Math.max(1, Math.ceil(average * 2));
}

export function getLeadingSector(
  marketData: MarketDashboardData | null
): { sector: string; changePct: number } | null {
  if (!marketData) {
    return null;
  }
  const entries = Object.entries(marketData.sector_performance ?? {})
    .map(([sector, value]) => ({ sector, changePct: value.change_pct ?? Number.NEGATIVE_INFINITY }))
    .filter((entry) => Number.isFinite(entry.changePct));
  if (!entries.length) {
    return null;
  }
  return entries.sort((a, b) => b.changePct - a.changePct)[0];
}

export function buildBehavioralWarnings(args: {
  patterns: PatternResponse[] | undefined;
  captureState: CaptureState | null;
  marketData: MarketDashboardData | null;
  session: SessionContext;
}): BehavioralWarning[] {
  const { patterns, captureState, marketData, session } = args;
  const warnings: BehavioralWarning[] = [];
  const captureStats = getCapturePerformanceStats(captureState);

  const timePattern = findPattern(patterns, "time_of_day");
  const currentBucket = getCurrentHourBucket(session);
  const worstBucket = String(timePattern?.data?.worst_bucket ?? "");
  if (timePattern && worstBucket === currentBucket) {
    warnings.push({
      id: "time-of-day",
      severity: "amber",
      priority: 2,
      title: `Your data shows ${formatPercent(Number(timePattern.data.worst_win_rate ?? 0), 0)} win rate during ${currentBucket}.`,
      detail: `Your strongest hours are ${String(timePattern.data.best_bucket ?? "--")}.`,
    });
  }

  const overtradingPattern = findPattern(patterns, "overtrading");
  const overtradingThreshold = getOvertradingThreshold(overtradingPattern);
  if (overtradingPattern && overtradingThreshold && captureStats.tradeCount > overtradingThreshold) {
    warnings.push({
      id: "overtrading",
      severity: "red",
      priority: 4,
      title: `Your data shows ${captureStats.tradeCount} trades today is above your high-activity threshold.`,
      detail: `Historically your win rate drops to ${formatPercent(Number(overtradingPattern.data.high_volume_day_win_rate ?? 0), 0)} on those days.`,
    });
  }

  const losingPattern = findPattern(patterns, "losing_streak_tilt");
  if (losingPattern && captureStats.losingStreakCount >= 2) {
    warnings.push({
      id: "losing-streak",
      severity: "amber",
      priority: 3,
      title: `Your data shows ${captureStats.losingStreakCount} consecutive losing round trips today.`,
      detail: `Average loss increases ${captureStats.losingStreakLossMultiplier ?? 1}x during losing streaks.`,
    });
  }

  const sectorPattern = findPattern(patterns, "sector_concentration");
  const sector = String(sectorPattern?.data?.sector ?? "");
  const sectorShare = Number(sectorPattern?.data?.sector_share ?? 0);
  const sectorChange = marketData?.sector_performance?.[sector]?.change_pct ?? null;
  if (sectorPattern && sectorShare > 0.6 && sectorChange != null && sectorChange < 0) {
    warnings.push({
      id: "sector-concentration",
      severity: "amber",
      priority: 1,
      title: `Your data shows heavy exposure to ${sector} (${Math.round(sectorShare * 100)}% of trades).`,
      detail: `${sector} is currently ${NUMBER_FORMATTER.format(sectorChange)}% today.`,
    });
  }

  return warnings
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2);
}

function isDifficultCapture(trade: CapturedTrade): boolean {
  const emotion = (trade.emotion_tag ?? "").toLowerCase();
  const { plan } = extractPlanMetadata(trade.notes);
  return (
    emotion.includes("revenge") ||
    emotion.includes("fearful") ||
    emotion.includes("fear") ||
    plan === "NO"
  );
}

export function buildRealtimeRiskAlerts(args: {
  patterns: PatternResponse[] | undefined;
  captureState: CaptureState | null;
  marketData: MarketDashboardData | null;
  seenTimeWarning: boolean;
}): RealtimeRiskAlert[] {
  const { patterns, captureState, seenTimeWarning } = args;
  const alerts: RealtimeRiskAlert[] = [];
  const captureStats = getCapturePerformanceStats(captureState);
  const session = getSessionContext();
  const trades = [...(captureState?.trades ?? [])].sort((a, b) => tradeSortValue(a) - tradeSortValue(b));

  const overtradingPattern = findPattern(patterns, "overtrading");
  const threshold = getOvertradingThreshold(overtradingPattern) ?? 4;
  if (captureStats.tradeCount >= threshold) {
    alerts.push({
      id: "overtrading",
      severity: captureStats.tradeCount >= threshold * 2 ? "red" : "amber",
      emoji: "📈",
      title: `You've taken ${captureStats.tradeCount} trades today.`,
      detail: `Your win rate historically drops after ${threshold}.`,
      priority: captureStats.tradeCount >= threshold * 2 ? 5 : 3,
    });
  }

  let difficultStreak = 0;
  for (let index = trades.length - 1; index >= 0; index -= 1) {
    if (isDifficultCapture(trades[index])) {
      difficultStreak += 1;
      continue;
    }
    break;
  }
  if (difficultStreak >= 2) {
    alerts.push({
      id: "consecutive-difficult",
      severity: difficultStreak >= 3 ? "red" : "amber",
      emoji: "⚠️",
      title: "Back-to-back difficult trades.",
      detail: "Your data shows losses compound during streaks.",
      priority: difficultStreak >= 3 ? 4 : 2,
    });
  }

  const timePattern = findPattern(patterns, "time_of_day");
  const currentBucket = getCurrentHourBucket(session);
  if (
    timePattern &&
    String(timePattern.data?.worst_bucket ?? "") === currentBucket &&
    !seenTimeWarning
  ) {
    alerts.push({
      id: `time-warning-${currentBucket}`,
      severity: "amber",
      emoji: "🕒",
      title: `Entering your historically weak trading window (${currentBucket}).`,
      detail: `Win rate: ${formatPercent(Number(timePattern.data?.worst_win_rate ?? 0), 0)}.`,
      priority: 1,
    });
  }

  if (captureStats.tradeCount > 6) {
    alerts.push({
      id: "high-activity",
      severity: "red",
      emoji: "🚨",
      title: "Very high trade frequency.",
      detail: "Consider stepping back to review.",
      priority: 6,
    });
  }

  return alerts.sort((a, b) => b.priority - a.priority).slice(0, 2);
}

export async function getCachedBehaviorPatterns(token: string | null): Promise<PatternsEnvelope | null> {
  if (!token) {
    return null;
  }
  if (
    patternsCache &&
    patternsCache.token === token &&
    Date.now() - patternsCache.cachedAt < PATTERN_CACHE_TTL_MS
  ) {
    return patternsCache.value;
  }
  try {
    const value = await getPatterns(token);
    patternsCache = {
      token,
      value,
      cachedAt: Date.now(),
    };
    return value;
  } catch {
    return null;
  }
}

export async function getCachedAnalyticsSummary(
  token: string | null
): Promise<AnalyticsSummaryResponse | null> {
  if (!token) {
    return null;
  }
  if (
    summaryCache &&
    summaryCache.token === token &&
    Date.now() - summaryCache.cachedAt < SUMMARY_CACHE_TTL_MS
  ) {
    return summaryCache.value;
  }
  try {
    const value = await getAnalyticsSummary(token);
    summaryCache = {
      token,
      value,
      cachedAt: Date.now(),
    };
    return value;
  } catch {
    return null;
  }
}
