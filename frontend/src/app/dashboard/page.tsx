"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { getAnalyticsSummary, getPatterns, type AnalyticsSummaryResponse, type PatternResponse, type PatternsEnvelope } from "@/lib/analytics";
import { getMe } from "@/lib/auth";
import { exportCompletedTradesCSV, getCompletedTrades, getTrades, getTradeSetups } from "@/lib/trades";
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

function formatCurrency(value: number | null | undefined): string {
  const amount = value ?? 0;
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "0.0%";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatSignedCurrency(value: number | null | undefined): string {
  const amount = value ?? 0;
  return `${amount >= 0 ? "+" : "-"}${formatCurrency(Math.abs(amount))}`;
}

function emotionClass(emotion?: string | null) {
  const value = (emotion || "").toLowerCase();
  if (value.includes("confident") || value.includes("calm")) return "badge-emerald";
  if (value.includes("fear") || value.includes("revenge") || value.includes("fomo")) return "badge-rose";
  return "badge-indigo";
}

function pnlClass(value: number) {
  return value >= 0 ? "text-emerald-600" : "text-rose-600";
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
  return new Date(`${value}T00:00:00`);
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isThisWeek(date: Date, now: Date) {
  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return date >= monday && date < sunday;
}

function buildRecentReview(rawTrades: Trade[], completedTrades: CompletedTrade[]) {
  const now = new Date();
  const todayRaw = rawTrades.filter((trade) => isSameDay(getTradeDay(trade.trade_date), now));
  const weekRaw = rawTrades.filter((trade) => isThisWeek(getTradeDay(trade.trade_date), now));
  const todayCompleted = completedTrades.filter((trade) => isSameDay(getTradeDay(trade.exit_date), now));
  const weekCompleted = completedTrades.filter((trade) => isThisWeek(getTradeDay(trade.exit_date), now));

  const build = (title: string, trades: Trade[], completed: CompletedTrade[]) => ({
    title,
    count: trades.length,
    pnl: completed.reduce((sum, trade) => sum + trade.pnl, 0),
    emotions: [...new Set(trades.map((trade) => trade.emotion_tag).filter(Boolean) as string[])],
    ruleBreaks: trades.filter((trade) => {
      const value = (trade.emotion_tag || "").toLowerCase();
      return value.includes("revenge") || value.includes("fomo");
    }).length,
  });

  if (todayRaw.length > 0 || todayCompleted.length > 0) {
    return build("Today's Session", todayRaw, todayCompleted);
  }
  if (weekRaw.length > 0 || weekCompleted.length > 0) {
    return build("This Week", weekRaw, weekCompleted);
  }
  return null;
}

function getTradingStyle(avgHoldingDays: number | null | undefined) {
  if (avgHoldingDays == null) return "—";
  if (avgHoldingDays < 1) return "Intraday";
  if (avgHoldingDays <= 7) return "Swing";
  return "Positional";
}

function getSectorStats(completedTrades: CompletedTrade[]) {
  const stats = new Map<string, { total: number; wins: number }>();
  const sectorMap: Record<string, string> = {
    TCS: "IT",
    INFY: "IT",
    WIPRO: "IT",
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
    bestSector: ranked[0]?.[0] ?? "—",
  };
}

function buildMistakeCosts(patterns: PatternResponse[], summary: AnalyticsSummaryResponse | null) {
  const avgPnl = Math.abs(summary?.avg_pnl_per_trade ?? 0);
  const items: Array<{ label: string; amount: number }> = [];

  const revenge = getPattern(patterns, "revenge_trading");
  const revengeLoss = Number(revenge?.data?.revenge_trade_pnl ?? 0);
  if (revenge && revengeLoss < 0) {
    items.push({ label: "Revenge trades", amount: revengeLoss });
  }

  const timeOfDay = getPattern(patterns, "time_of_day");
  if (timeOfDay) {
    const diff =
      Number(timeOfDay.data?.best_win_rate ?? 0) - Number(timeOfDay.data?.worst_win_rate ?? 0);
    const sample = Number(timeOfDay.data?.sample_size ?? 0);
    const estimated = -Math.abs(diff * Math.max(avgPnl, 1) * Math.max(sample / 2, 1));
    if (estimated < 0) {
      items.push({ label: "Weak-hour trades", amount: estimated });
    }
  }

  const overtrading = getPattern(patterns, "overtrading");
  if (overtrading) {
    const diff =
      Number(overtrading.data?.normal_day_win_rate ?? 0) -
      Number(overtrading.data?.high_volume_day_win_rate ?? 0);
    const sample = Number(overtrading.data?.sample_size ?? 0);
    const estimated = -Math.abs(diff * Math.max(avgPnl, 1) * Math.max(sample / 3, 1));
    if (estimated < 0) {
      items.push({ label: "Overtrading days", amount: estimated });
    }
  }

  return items;
}

function getRMultiple(trade: CompletedTrade) {
  const riskBase = trade.entry_price * trade.quantity * 0.02;
  if (!riskBase) return null;
  return trade.pnl / riskBase;
}

function getImprovementPlan(patterns: PatternResponse[]) {
  const suggestions: string[] = [];
  const timeOfDay = getPattern(patterns, "time_of_day");
  if (timeOfDay) {
    suggestions.push(
      `Limit new entries after ${String(timeOfDay.data?.worst_bucket ?? "your weaker hours")} — your win rate drops to ${formatPercent(Number(timeOfDay.data?.worst_win_rate ?? 0))}`
    );
  }

  const overtrading = getPattern(patterns, "overtrading");
  if (overtrading) {
    const threshold = Math.max(1, Math.ceil(Number(overtrading.data?.average_trades_per_day ?? 0) * 2));
    suggestions.push(`Aim for max ${threshold} trades per day`);
  }

  if (getPattern(patterns, "revenge_trading")) {
    suggestions.push("Wait 30 minutes after a loss before entering");
  }

  const sectorConcentration = getPattern(patterns, "sector_concentration");
  if (sectorConcentration) {
    suggestions.push(`Explore setups outside ${String(sectorConcentration.data?.sector ?? "your concentrated sector")}`);
  }

  const holding = getPattern(patterns, "holding_period");
  if (holding) {
    suggestions.push(`Your sweet spot is ${String(holding.data?.best_bucket ?? "your strongest")} holds — align your targets`);
  }

  if (getPattern(patterns, "losing_streak_tilt")) {
    suggestions.push("After 2 consecutive losses, reduce position size by 50%");
  }

  return suggestions.slice(0, 4);
}

function SetupStatus({
  setup,
  linkedTrade,
}: {
  setup: TradeSetup;
  linkedTrade: CompletedTrade | null;
}) {
  if (!linkedTrade) {
    return <span className="badge badge-indigo">⏳ Pending — awaiting trade capture</span>;
  }

  const target = setup.target_price ?? 0;
  const followed = target > 0 && Math.abs(linkedTrade.exit_price - target) / target <= 0.02;
  return (
    <div className="flex flex-wrap gap-2">
      <span className="badge badge-emerald">{`✓ Linked to trade · P&L: ${formatSignedCurrency(linkedTrade.pnl)}`}</span>
      <span className={`badge ${followed ? "badge-emerald" : "badge-indigo"}`}>
        {followed ? "Plan followed" : "Deviated from plan"}
      </span>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="command-center pt-28">
      <div className="h-36 animate-pulse rounded-3xl bg-white" />
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-2xl bg-white" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-3xl bg-white" />
        <div className="h-64 animate-pulse rounded-3xl bg-white" />
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
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      const [
        userResult,
        summaryResult,
        patternsResult,
        completedResult,
        rawTradesResult,
        setupsResult,
      ] = await Promise.allSettled([
        getMe(),
        getAnalyticsSummary(),
        getPatterns(),
        getCompletedTrades(10, 0),
        getTrades({ limit: 5, offset: 0 }),
        getTradeSetups(5, 0),
      ]);

      if (!active) return;

      if (userResult.status === "rejected") {
        setError(userResult.reason instanceof Error ? userResult.reason.message : "Failed to load dashboard");
        setLoading(false);
        return;
      }

      setUser(userResult.value);
      if (summaryResult.status === "fulfilled") setSummary(summaryResult.value);
      if (patternsResult.status === "fulfilled") setPatternsEnvelope(patternsResult.value);
      if (completedResult.status === "fulfilled") setCompletedTrades(completedResult.value);
      if (rawTradesResult.status === "fulfilled") setRawTrades(rawTradesResult.value);
      if (setupsResult.status === "fulfilled") setSetups(setupsResult.value);
      setLoading(false);
    }

    void loadDashboard();
    return () => {
      active = false;
    };
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
  const emotionCoverage = rawTrades.length > 0
    ? rawTrades.filter((trade) => Boolean(trade.emotion_tag)).length / rawTrades.length
    : 0;
  const recentReview = buildRecentReview(rawTrades, completedTrades);
  const sectorStats = getSectorStats(completedTrades);
  const worstPattern = [...visiblePatterns].sort((a, b) => {
    const severityRank = { high: 0, medium: 1, low: 2 };
    return (severityRank[a.severity as keyof typeof severityRank] ?? 99) - (severityRank[b.severity as keyof typeof severityRank] ?? 99);
  })[0] ?? null;
  const mistakes = buildMistakeCosts(visiblePatterns, summary);
  const improvementPlan = getImprovementPlan(visiblePatterns);
  const tradeCountForDna = patternsEnvelope?.total_completed_trades ?? summary?.total_trades ?? 0;
  const bestDayPattern = getPattern(visiblePatterns, "day_of_week");
  const timePattern = getPattern(visiblePatterns, "time_of_day");
  const holdingPattern = getPattern(visiblePatterns, "holding_period");

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
          <div className="text-sm font-bold text-gray-500">This Month P&amp;L</div>
          <div className={`mt-3 text-3xl font-black ${pnlClass(monthPnl.current)}`}>
            {formatCurrency(monthPnl.current)}
          </div>
          <p className="mt-3 text-sm text-gray-500">
            vs last month: <span className={pnlClass(monthPnl.current - monthPnl.previous)}>{formatSignedCurrency(monthPnl.current - monthPnl.previous)}</span>
          </p>
        </article>

        <article className="glass-card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-sm font-bold text-gray-500">Win Rate</div>
          <div className="mt-3 text-3xl font-black text-slate-950">{formatPercent(summary?.win_rate)}</div>
          <div className="mt-3 h-2 rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min((summary?.win_rate ?? 0) * 100, 100)}%` }} />
          </div>
          <p className="mt-3 text-sm text-gray-500">across {summary?.total_trades ?? 0} trades</p>
        </article>

        <article className="glass-card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-sm font-bold text-gray-500">Avg Trade</div>
          <div className={`mt-3 text-3xl font-black ${pnlClass(summary?.avg_pnl_per_trade ?? 0)}`}>
            {formatCurrency(summary?.avg_pnl_per_trade)}
          </div>
          <p className="mt-3 text-sm text-gray-500">
            Best: {formatCurrency(summary?.best_trade.pnl)} · Worst: {formatCurrency(summary?.worst_trade.pnl)}
          </p>
        </article>

        <article className="glass-card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-sm font-bold text-gray-500">Discipline Score</div>
          <div className="mt-3 text-3xl font-black text-slate-950">
            {(emotionCoverage * 100).toFixed(1)}%
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${emotionCoverage * 100}%` }} />
          </div>
          <p className="mt-3 text-sm text-gray-500">
            Emotion tagged on {(emotionCoverage * 100).toFixed(1)}% of trades
          </p>
        </article>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="glass-card p-6">
          {recentReview ? (
            <>
              <h2 className="text-xl font-black text-slate-950">{recentReview.title}</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Trades</div>
                  <div className="mt-2 text-2xl font-black text-slate-950">{recentReview.count}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">P&amp;L</div>
                  <div className={`mt-2 text-2xl font-black ${pnlClass(recentReview.pnl)}`}>{formatCurrency(recentReview.pnl)}</div>
                </div>
              </div>
              <div className="mt-5">
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Emotions</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {recentReview.emotions.length ? recentReview.emotions.map((emotion) => (
                    <span key={emotion} className={`badge ${emotionClass(emotion)}`}>
                      {emotion}
                    </span>
                  )) : (
                    <span className="badge badge-indigo">No emotion tags</span>
                  )}
                </div>
              </div>
              <p className="mt-5 text-sm text-gray-500">Rule breaks: {recentReview.ruleBreaks}</p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-black text-slate-950">This Week</h2>
              <p className="mt-3 text-sm leading-6 text-gray-500">
                No recent activity. Import trades via CSV or open your broker with the extension.
              </p>
            </>
          )}
        </section>

        <section className="glass-card p-6">
          <h2 className="text-xl font-black text-slate-950">Quick Actions</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              { icon: "📥", label: "Import Trades", href: "/import" },
              { icon: "📊", label: "View Patterns", href: "/dashboard/analytics" },
              { icon: "🔍", label: "Review Mistakes", href: "/dashboard/analytics#patterns" },
              { icon: "⚙️", label: "Extension Settings", href: "/download" },
            ].map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="rounded-2xl border border-gray-100 bg-white px-4 py-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-100 hover:bg-indigo-50/40"
              >
                <span className="mr-2">{action.icon}</span>
                {action.label}
              </Link>
            ))}
            <button
              onClick={() => void handleExport()}
              disabled={exporting}
              className="rounded-2xl border border-gray-100 bg-white px-4 py-4 text-left text-sm font-semibold text-slate-700 transition hover:border-indigo-100 hover:bg-indigo-50/40 disabled:opacity-60"
            >
              <span className="mr-2">📤</span>
              {exporting ? "Exporting..." : "Export Journal"}
            </button>
          </div>
        </section>
      </div>

      <section className="mt-6">
        {tradeCountForDna >= 20 ? (
          <div className="dna-card">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">Your Trader DNA</div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div><span className="text-sm text-gray-500">Best Day</span><div className="mt-1 font-black text-slate-950">{String(bestDayPattern?.data?.best_bucket ?? "—")}</div></div>
                  <div><span className="text-sm text-gray-500">Worst Day</span><div className="mt-1 font-black text-slate-950">{String(bestDayPattern?.data?.worst_bucket ?? "—")}</div></div>
                  <div><span className="text-sm text-gray-500">Best Hours</span><div className="mt-1 font-black text-slate-950">{String(timePattern?.data?.best_bucket ?? "—")}</div></div>
                  <div><span className="text-sm text-gray-500">Weak Hours</span><div className="mt-1 font-black text-slate-950">{String(timePattern?.data?.worst_bucket ?? "—")}</div></div>
                  <div><span className="text-sm text-gray-500">Sweet Spot</span><div className="mt-1 font-black text-slate-950">{String(holdingPattern?.data?.best_bucket ?? "—")}</div></div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><span className="text-sm text-gray-500">Best Sector</span><div className="mt-1 font-black text-slate-950">{sectorStats.bestSector}</div></div>
                <div><span className="text-sm text-gray-500">Worst Pattern</span><div className="mt-1 font-black text-slate-950">{worstPattern?.title ?? "—"}</div></div>
                <div><span className="text-sm text-gray-500">Trading Style</span><div className="mt-1 font-black text-slate-950">{getTradingStyle(summary?.avg_holding_days)}</div></div>
                <div><span className="text-sm text-gray-500">Total P&amp;L</span><div className={`mt-1 font-black ${pnlClass(summary?.total_pnl ?? 0)}`}>{formatCurrency(summary?.total_pnl)}</div></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card p-6">
            <h2 className="text-xl font-black text-slate-950">Trader DNA</h2>
            <p className="mt-3 text-sm text-gray-500">
              Trader DNA unlocks at 20 completed trades. You have {tradeCountForDna}/20.
            </p>
            <div className="mt-4 h-3 rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min((tradeCountForDna / 20) * 100, 100)}%` }} />
            </div>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="mistakes-card">
          <h2 className="text-xl font-black text-slate-950">Avoidable Losses This Month</h2>
          {mistakes.length ? (
            <div className="mt-5 grid gap-3">
              {mistakes.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                  <span className="font-semibold text-slate-700">{item.label}</span>
                  <span className="font-black text-rose-600">{formatSignedCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">✅ No major behavioral losses detected. Keep it up.</p>
          )}
        </section>

        {improvementPlan.length > 0 ? (
          <section className="glass-card border-l-4 border-l-indigo-500 p-6">
            <h2 className="text-xl font-black text-slate-950">This Week&apos;s Focus</h2>
            <div className="mt-4">
              {improvementPlan.map((item) => (
                <label key={item} className="improvement-item">
                  <input type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600" />
                  <span className="text-sm leading-6 text-slate-700">{item}</span>
                </label>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <section className="mt-6 glass-card p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-black text-slate-950">Recent Trades</h2>
          <Link href="/dashboard/trades" className="text-sm font-bold text-indigo-600">
            View all trades →
          </Link>
        </div>

        <div className="mt-5 overflow-x-auto">
          {completedTrades.length ? (
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="pb-3 pr-4">Symbol</th>
                  <th className="pb-3 pr-4">Side</th>
                  <th className="pb-3 pr-4">Qty</th>
                  <th className="pb-3 pr-4">Entry → Exit</th>
                  <th className="pb-3 pr-4">P&amp;L</th>
                  <th className="pb-3 pr-4">R Multiple</th>
                  <th className="pb-3 pr-4">Emotion</th>
                  <th className="pb-3">Holding Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {completedTrades.slice(0, 5).map((trade) => {
                  const rawTrade = rawTrades.find((item) => item.stock_symbol === trade.stock_symbol) ?? null;
                  const rMultiple = getRMultiple(trade);
                  return (
                    <tr key={trade.id}>
                      <td className="py-4 pr-4 font-black text-slate-950">{trade.stock_symbol}</td>
                      <td className="py-4 pr-4 text-slate-600">BUY/SELL</td>
                      <td className="py-4 pr-4 text-slate-600">{trade.quantity.toLocaleString("en-IN")}</td>
                      <td className="py-4 pr-4 text-slate-600">
                        ₹{trade.entry_price.toLocaleString("en-IN")} → ₹{trade.exit_price.toLocaleString("en-IN")}
                      </td>
                      <td className={`py-4 pr-4 font-bold ${pnlClass(trade.pnl)}`}>{formatCurrency(trade.pnl)}</td>
                      <td className="py-4 pr-4 text-slate-600">{rMultiple == null ? "—" : `${rMultiple.toFixed(2)}R`}</td>
                      <td className="py-4 pr-4">
                        <span className={`badge ${rawTrade?.emotion_tag ? emotionClass(rawTrade.emotion_tag) : "badge-indigo"}`}>
                          {rawTrade?.emotion_tag || "No tag"}
                        </span>
                      </td>
                      <td className="py-4 text-slate-600">{trade.holding_days}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-500">No completed trades yet. Import trades to unlock your command center.</p>
          )}
        </div>
      </section>

      {setups.length > 0 ? (
        <section className="mt-6 glass-card p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-black text-slate-950">Pre-Trade Setups</h2>
            <Link href="/dashboard/trades" className="text-sm font-bold text-indigo-600">
              View all setups →
            </Link>
          </div>
          <div className="mt-5 grid gap-4">
            {setups.slice(0, 3).map((setup) => {
              const linkedTrade = completedTrades.find((trade) => trade.id === setup.linked_trade_id) ?? null;
              return (
                <article key={setup.id} className="rounded-2xl border border-gray-100 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="font-black text-slate-950">{setup.symbol || "Setup"}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Entry {formatCurrency(setup.entry_price)} · SL {formatCurrency(setup.stop_loss_price)} · Target {formatCurrency(setup.target_price)}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        Conviction: {setup.conviction_score ?? "—"}/10 · Risk: {setup.risk_level || "Not scored"}
                      </p>
                    </div>
                    <SetupStatus setup={setup} linkedTrade={linkedTrade} />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
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
