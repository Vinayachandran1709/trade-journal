"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getAnalyticsSummary,
  getPatterns,
  type AnalyticsSummaryResponse,
  type PatternResponse,
  type PatternsEnvelope,
} from "@/lib/analytics";
import { readSessionCache, writeSessionCache } from "@/lib/client-cache";
import { getMe } from "@/lib/auth";
import {
  getCompletedTrades,
  getTrades,
  getTradeSetups,
  exportCompletedTradesCSV,
} from "@/lib/trades";
import {
  formatCurrency,
  formatPercent,
  getBiggestLeakSummary,
  getStrongestEdgeSummary,
  getScoreFraming,
  getPatternProofTrades,
} from "@/lib/behavioral-insights";
import type { CompletedTrade, Trade, TradeSetup } from "@/types/trade";
import type { User } from "@/types/user";

const DASHBOARD_CACHE_KEY = "dashboard-home-cache";
const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const DAY_FORMATTER = new Intl.DateTimeFormat("en-IN", { weekday: "long" });
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

type DashboardSnapshot = {
  user: User | null;
  summary: AnalyticsSummaryResponse | null;
  patternsEnvelope: PatternsEnvelope | null;
  completedTrades: CompletedTrade[];
  rawTrades: Trade[];
  setups: TradeSetup[];
};

type AttentionItem = {
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  priority: "high" | "medium" | "low";
};

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function matchRawTrade(rawTrades: Trade[], trade: CompletedTrade) {
  return (
    rawTrades.find(
      (item) =>
        item.stock_symbol.toUpperCase() === trade.stock_symbol.toUpperCase() &&
        item.trade_date.slice(0, 10) === trade.entry_date.slice(0, 10)
    ) ?? null
  );
}

function emotionLabel(emotion?: string | null) {
  if (!emotion) return "No tag";
  return emotion.replace(/_/g, " ");
}

function emotionClass(emotion?: string | null) {
  const value = (emotion ?? "").toLowerCase();
  if (value.includes("confident") || value.includes("calm")) return "badge-emerald";
  if (value.includes("fear") || value.includes("revenge") || value.includes("fomo")) return "badge-rose";
  return "badge-indigo";
}

function pnlClass(value: number) {
  return value >= 0 ? "text-emerald-600" : "text-rose-600";
}

function isWithinLastDays(value: string, days: number) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  const threshold = new Date();
  threshold.setHours(0, 0, 0, 0);
  threshold.setDate(threshold.getDate() - days);
  return date >= threshold;
}

function getScoreGradient(score: number) {
  const color = score > 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  return `conic-gradient(${color} 0% ${score}%, #e2e8f0 ${score}% 100%)`;
}

function getWeekSummary(
  completedTrades: CompletedTrade[],
  rawTrades: Trade[],
  setups: TradeSetup[],
  ruleText: string
) {
  const weekTrades = completedTrades.filter((trade) => isWithinLastDays(trade.exit_date, 7));
  const weekRawTrades = rawTrades.filter((trade) => isWithinLastDays(trade.trade_date, 7));
  const pendingSetups = setups.filter((setup) => !setup.linked_trade_id).length;
  const missingEmotions = weekRawTrades.filter((trade) => !trade.emotion_tag).length;
  const missingNotes = weekRawTrades.filter((trade) => !(trade.notes ?? "").trim()).length;

  if (!weekTrades.length) {
    return {
      title: "This Week",
      primary: "No completed trades this week yet",
      secondary: "One thing to fix: close one journaling gap before the next live trade.",
      tertiary: `One setup task: ${pendingSetups > 0 ? `${pendingSetups} pending setup${pendingSetups === 1 ? "" : "s"} need follow-through.` : "Open one pre-trade setup before your next session."}`,
      route: pendingSetups > 0 ? "/dashboard#pre-trade-setups" : "/import",
      routeLabel: pendingSetups > 0 ? "Open pending setups" : "Import or capture trades",
      focus: ruleText,
    };
  }

  const pnl = weekTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const wins = weekTrades.filter((trade) => trade.pnl > 0).length;
  const losses = weekTrades.filter((trade) => trade.pnl < 0).length;

  return {
    title: "This Week",
    primary: `${weekTrades.length} completed trades · ${formatCurrency(pnl)} · ${wins}W / ${losses}L`,
    secondary: `Journal gaps this week: ${missingEmotions} missing emotion tags · ${missingNotes} missing notes`,
    tertiary: pendingSetups > 0 ? `${pendingSetups} setup${pendingSetups === 1 ? "" : "s"} still waiting for capture.` : "No pending setups right now.",
    route: missingNotes > 0 ? "/dashboard/trades?review=notes-missing" : "/dashboard/trades",
    routeLabel: missingNotes > 0 ? "Review journaling gaps" : "Open trade journal",
    focus: ruleText,
  };
}

function getNeedsAttention(
  rawTrades: Trade[],
  completedTrades: CompletedTrade[],
  setups: TradeSetup[],
  patterns: PatternResponse[],
  leakSummary: string
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const missingEmotion = rawTrades.filter((trade) => !trade.emotion_tag).length;
  const missingNotes = rawTrades.filter((trade) => !(trade.notes ?? "").trim()).length;
  const pendingSetups = setups.filter((setup) => !setup.linked_trade_id).length;
  const highSeverity = patterns.filter((pattern) => pattern.severity === "high");
  const losersMissingEmotion = completedTrades.filter(
    (trade) => trade.pnl < 0 && !matchRawTrade(rawTrades, trade)?.emotion_tag
  ).length;

  if (highSeverity.length > 0) {
    items.push({
      title: "High-severity pattern is still active",
      detail: leakSummary,
      href: "/dashboard/analytics#patterns",
      actionLabel: "Review leak",
      priority: "high",
    });
  }
  if (missingEmotion > 0) {
    items.push({
      title: `${missingEmotion} trades need emotion tags`,
      detail: "Resolve missing tags so the next pattern read is based on real behavior, not blanks.",
      href: "/dashboard/trades?emotion=missing",
      actionLabel: "Tag trades",
      priority: "medium",
    });
  }
  if (losersMissingEmotion > 0) {
    items.push({
      title: `${losersMissingEmotion} losing trades are missing context`,
      detail: "Close the loser-review gap before the lesson disappears.",
      href: "/dashboard/trades?review=losers-missing-emotion",
      actionLabel: "Review losers",
      priority: "medium",
    });
  }
  if (missingNotes > 0) {
    items.push({
      title: `${missingNotes} trades still need a follow-up note`,
      detail: "Keep the journal lightweight, but leave one sentence you can learn from later.",
      href: "/dashboard/trades?review=notes-missing",
      actionLabel: "Add notes",
      priority: "medium",
    });
  }
  if (pendingSetups > 0) {
    items.push({
      title: `${pendingSetups} setups are waiting for follow-through`,
      detail: "A setup without follow-through becomes dead research instead of usable feedback.",
      href: "/dashboard#pre-trade-setups",
      actionLabel: "Open setups",
      priority: "low",
    });
  }

  return items.sort((left, right) => SEVERITY_ORDER[left.priority] - SEVERITY_ORDER[right.priority]).slice(0, 5);
}

function DashboardHeroSkeleton() {
  return (
    <div className="command-center py-10">
      <div className="neutral-shell-card h-40 animate-pulse" />
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="neutral-shell-card h-32 animate-pulse" />
        ))}
      </div>
      <div className="mt-6 neutral-shell-card h-28 animate-pulse" />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="neutral-shell-card h-64 animate-pulse" />
        <div className="neutral-shell-card h-64 animate-pulse" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return <DashboardHeroSkeleton />;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [hydratedFromCache, setHydratedFromCache] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [patternsEnvelope, setPatternsEnvelope] = useState<PatternsEnvelope | null>(null);
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([]);
  const [rawTrades, setRawTrades] = useState<Trade[]>([]);
  const [setups, setSetups] = useState<TradeSetup[]>([]);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const cached = readSessionCache<DashboardSnapshot>(DASHBOARD_CACHE_KEY);
    if (cached) {
      setUser(cached.user);
      setSummary(cached.summary);
      setPatternsEnvelope(cached.patternsEnvelope);
      setCompletedTrades(cached.completedTrades);
      setRawTrades(cached.rawTrades);
      setSetups(cached.setups);
      setHydratedFromCache(true);
      setLoading(false);
    }

    let active = true;
    async function load() {
      try {
        const resolvedUser = await getMe();
        const [summaryResult, patternsResult, completedResult, rawTradesResult, setupsResult] =
          await Promise.allSettled([
            getAnalyticsSummary(),
            getPatterns(),
            getCompletedTrades(50, 0),
            getTrades({ limit: 50, offset: 0 }),
            getTradeSetups(20, 0),
          ]);

        if (!active) return;

        const nextSummary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
        const nextPatterns = patternsResult.status === "fulfilled" ? patternsResult.value : null;
        const nextCompleted = completedResult.status === "fulfilled" ? completedResult.value : [];
        const nextTrades = rawTradesResult.status === "fulfilled" ? rawTradesResult.value : [];
        const nextSetups = setupsResult.status === "fulfilled" ? setupsResult.value : [];

        setUser(resolvedUser);
        setSummary(nextSummary);
        setPatternsEnvelope(nextPatterns);
        setCompletedTrades(nextCompleted);
        setRawTrades(nextTrades);
        setSetups(nextSetups);
        setError("");
        writeSessionCache(DASHBOARD_CACHE_KEY, {
          user: resolvedUser,
          summary: nextSummary,
          patternsEnvelope: nextPatterns,
          completedTrades: nextCompleted,
          rawTrades: nextTrades,
          setups: nextSetups,
        });
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : "Unable to load dashboard");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const visiblePatterns = useMemo(
    () => (patternsEnvelope?.patterns ?? []).filter((pattern) => !pattern.locked),
    [patternsEnvelope]
  );

  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "Trader";
  const performanceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (summary?.win_rate ?? 0) * 30 +
          15 +
          (rawTrades.filter((trade) => Boolean(trade.emotion_tag)).length / Math.max(rawTrades.length, 1)) * 25 +
          20
      )
    )
  );
  const scoreFraming = getScoreFraming({
    summary,
    trades: rawTrades,
    patterns: visiblePatterns,
  });
  const biggestLeak = getBiggestLeakSummary(visiblePatterns, summary);
  const strongestEdge = getStrongestEdgeSummary(visiblePatterns, summary);
  const weekRule = biggestLeak.patternType ? biggestLeak.action : "Tag recent trades and keep the next rule simple.";
  const weekSummary = getWeekSummary(completedTrades, rawTrades, setups, weekRule);
  const needsAttention = getNeedsAttention(
    rawTrades,
    completedTrades,
    setups,
    visiblePatterns,
    biggestLeak.detail
  );
  const today = new Date();

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

  if (loading && !hydratedFromCache) {
    return <DashboardHeroSkeleton />;
  }

  return (
    <div className="command-center py-10">
      {error ? (
        <div className="mb-6 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>
      ) : null}

      <section className="glass-card flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <span className="badge badge-indigo">Trading cockpit</span>
          <h1 className="mt-4 text-3xl font-black text-slate-950">Welcome back, {firstName}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {DATE_FORMATTER.format(today)} · {DAY_FORMATTER.format(today)}
          </p>
          <div className="mt-4 text-sm text-slate-700">
            Main drag: <span className="font-semibold text-rose-600">{scoreFraming.drag}</span>
            <span className="mx-2 text-slate-300">•</span>
            Strength: <span className="font-semibold text-emerald-600">{scoreFraming.strength}</span>
            <span className="mx-2 text-slate-300">•</span>
            Next fix: <span className="font-semibold text-slate-900">{scoreFraming.nextFix}</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <div className="score-ring" style={{ background: getScoreGradient(performanceScore) }}>
            <div className="score-ring-inner">
              <span className="score-ring-value">{performanceScore}</span>
              <span className="score-ring-label">Score</span>
            </div>
          </div>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Performance score</span>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="glass-card p-5">
          <div className="text-sm font-bold text-gray-500">This month P&amp;L</div>
          <div className={`mt-3 text-3xl font-black ${pnlClass(summary?.total_pnl ?? 0)}`}>{formatCurrency(summary?.total_pnl ?? 0)}</div>
          <p className="mt-2 text-sm text-gray-500">Realized from completed trades already matched in the journal.</p>
        </article>
        <article className="glass-card p-5">
          <div className="text-sm font-bold text-gray-500">Win rate</div>
          <div className="mt-3 text-3xl font-black text-slate-950">{formatPercent(summary?.win_rate ?? 0)}</div>
          <p className="mt-2 text-sm text-gray-500">Across {summary?.total_trades ?? 0} completed trades.</p>
        </article>
        <article className="glass-card p-5">
          <div className="text-sm font-bold text-gray-500">Journal coverage</div>
          <div className="mt-3 text-3xl font-black text-slate-950">
            {rawTrades.length ? `${Math.round((rawTrades.filter((trade) => Boolean(trade.emotion_tag)).length / rawTrades.length) * 100)}%` : "--"}
          </div>
          <p className="mt-2 text-sm text-gray-500">Emotion tags on the trades feeding your behavioral reads.</p>
        </article>
        <article className="glass-card p-5">
          <div className="text-sm font-bold text-gray-500">Open setups</div>
          <div className="mt-3 text-3xl font-black text-slate-950">{setups.filter((setup) => !setup.linked_trade_id).length}</div>
          <p className="mt-2 text-sm text-gray-500">Plans still waiting for capture, execution, or review.</p>
        </article>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <article className="glass-card p-5">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-rose-500">Biggest leak</div>
          <h2 className="mt-3 text-xl font-black text-slate-950">{biggestLeak.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{biggestLeak.detail}</p>
          <p className="mt-3 text-sm font-semibold text-slate-900">{biggestLeak.action}</p>
        </article>
        <article className="glass-card p-5">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-500">Strongest edge</div>
          <h2 className="mt-3 text-xl font-black text-slate-950">{strongestEdge.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{strongestEdge.detail}</p>
          <p className="mt-3 text-sm font-semibold text-slate-900">{strongestEdge.action}</p>
        </article>
        <article className="glass-card p-5">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">Rule this week</div>
          <h2 className="mt-3 text-xl font-black text-slate-950">{weekRule}</h2>
          <p className="mt-2 text-sm text-slate-600">{biggestLeak.impactText ?? "Turn the main drag into one executable rule."}</p>
          <Link href="/dashboard/analytics#patterns" className="mt-3 inline-flex text-sm font-semibold text-indigo-600">
            Open patterns →
          </Link>
        </article>
      </section>

      {needsAttention.length ? (
        <section className="needs-attention-card mt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-black text-slate-950">Needs Attention</div>
              <p className="mt-1 text-sm text-slate-600">Resolve the next useful thing instead of scrolling for it.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {needsAttention.map((item) => (
              <div key={`${item.title}-${item.href}`} className="rounded-2xl border border-white/70 bg-white/80 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-black text-slate-950">{item.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{item.detail}</div>
                  </div>
                  <Link href={item.href} className="btn-secondary">
                    {item.actionLabel}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6 glass-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">{weekSummary.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{weekSummary.primary}</p>
          </div>
          <Link href={weekSummary.route} className="btn-secondary">
            {weekSummary.routeLabel}
          </Link>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">{weekSummary.secondary}</div>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">{weekSummary.tertiary}</div>
          <div className="rounded-2xl bg-indigo-50 p-4 text-sm font-semibold text-indigo-900">Weekly rule: {weekSummary.focus}</div>
        </div>
      </section>

      <section id="trader-dna" className="mt-6 glass-card p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">Trader DNA</div>
            <h2 className="mt-3 text-2xl font-black text-slate-950">Where your style is showing up</h2>
            <p className="mt-2 text-sm text-slate-600">
              A premium read on timing, hold style, and where your edge is clustering so far.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Trading style</div>
            <div className="mt-2 text-xl font-black text-slate-950">
              {summary ? (summary.avg_holding_days < 1 ? "Intraday" : summary.avg_holding_days <= 7 ? "Swing" : "Positional") : "Building sample"}
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Average trade</div>
            <div className="mt-2 text-xl font-black text-slate-950">{formatCurrency(summary?.avg_pnl_per_trade ?? 0)}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Most traded</div>
            <div className="mt-2 text-xl font-black text-slate-950">{summary?.most_traded_symbol ?? "Building sample"}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Pattern unlock</div>
            <div className="mt-2 text-xl font-black text-slate-950">
              {patternsEnvelope?.unlocked ? "Unlocked" : `${patternsEnvelope?.total_completed_trades ?? 0}/${patternsEnvelope?.threshold ?? 20}`}
            </div>
          </div>
        </div>
      </section>

      <section id="recent-trades" className="mt-6 glass-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black text-slate-950">Recent Trades</h2>
          <Link href="/dashboard/trades" className="text-sm font-bold text-indigo-600">View all trades →</Link>
        </div>
        <div className="mt-5 grid gap-3">
          {completedTrades.length ? (
            completedTrades.slice(0, 5).map((trade) => {
              const rawTrade = matchRawTrade(rawTrades, trade);
              const hasPlan = setups.some((setup) => setup.linked_trade_id === trade.id);
              return (
                <Link
                  key={trade.id}
                  href={!rawTrade?.emotion_tag ? "/dashboard/trades?emotion=missing" : !(rawTrade?.notes ?? "").trim() ? "/dashboard/trades?review=notes-missing" : "/dashboard/trades"}
                  className="rounded-2xl border border-gray-100 bg-white px-4 py-4 transition hover:border-indigo-100 hover:bg-indigo-50/30"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-black text-slate-950">{trade.stock_symbol}</span>
                      <span className="text-slate-500">{formatCurrency(trade.entry_price)} → {formatCurrency(trade.exit_price)}</span>
                      <span className={`font-bold ${pnlClass(trade.pnl)}`}>{formatCurrency(trade.pnl)}</span>
                      <span className={`badge ${rawTrade?.emotion_tag ? emotionClass(rawTrade.emotion_tag) : "badge-indigo"}`}>
                        {emotionLabel(rawTrade?.emotion_tag)}
                      </span>
                      <span className={`badge ${hasPlan ? "badge-emerald" : "badge-rose"}`}>{hasPlan ? "Planned" : "No plan"}</span>
                    </div>
                    <span className="text-sm font-semibold text-indigo-600">
                      {!rawTrade?.emotion_tag ? "Tag emotion →" : !(rawTrade?.notes ?? "").trim() ? "Add note →" : "Review trade →"}
                    </span>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">No completed trades yet. Import trades to start building your review loop.</div>
          )}
        </div>
      </section>

      <section id="pre-trade-setups" className="mt-6 glass-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black text-slate-950">Pre-Trade Setups</h2>
          <Link href="/dashboard#pre-trade-setups" className="text-sm font-bold text-indigo-600">Keep plans visible →</Link>
        </div>
        <div className="mt-5 grid gap-4">
          {setups.length ? (
            setups.slice(0, 4).map((setup) => {
              const linkedTrade = completedTrades.find((trade) => trade.id === setup.linked_trade_id) ?? null;
              return (
                <div key={setup.id} className="rounded-2xl border border-gray-100 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="font-black text-slate-950">{setup.symbol || "Setup"}</h3>
                      <p className="mt-2 text-sm text-slate-600">
                        {setup.entry_price != null ? `Entry ${formatCurrency(setup.entry_price)}` : "Entry pending"} ·{" "}
                        {setup.stop_loss_price != null ? `SL ${formatCurrency(setup.stop_loss_price)}` : "SL pending"} ·{" "}
                        {setup.target_price != null ? `Target ${formatCurrency(setup.target_price)}` : "Target pending"}
                      </p>
                      {setup.thesis ? <p className="mt-3 text-sm text-slate-500">{setup.thesis}</p> : null}
                    </div>
                    <div className="min-w-[220px] rounded-2xl bg-white px-4 py-3 text-sm">
                      <div className="font-semibold text-slate-800">{linkedTrade ? `Executed · ${formatCurrency(linkedTrade.pnl)}` : "Pending setup"}</div>
                      <div className="mt-2 text-slate-500">{linkedTrade ? "Compare with the captured trade in your journal." : "Next action: either capture the trade or delete the stale setup."}</div>
                      <Link href={linkedTrade ? "/dashboard/trades" : "/dashboard#pre-trade-setups"} className="mt-3 inline-flex font-semibold text-indigo-600">
                        {linkedTrade ? "Compare with trade →" : "Review pending setup →"}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">No setups logged yet. Add one pre-trade plan before your next session.</div>
          )}
        </div>
      </section>

      <section id="quick-actions" className="mt-6 glass-card p-6">
        <h2 className="text-xl font-black text-slate-950">Quick Actions</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Link href="/import" className="rounded-2xl border border-gray-100 bg-white px-4 py-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-100 hover:bg-indigo-50/40">Import trades</Link>
          <Link href="/dashboard/analytics#patterns" className="rounded-2xl border border-gray-100 bg-white px-4 py-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-100 hover:bg-indigo-50/40">Open patterns</Link>
          <Link href="/dashboard/mistakes" className="rounded-2xl border border-gray-100 bg-white px-4 py-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-100 hover:bg-indigo-50/40">Correction workflow</Link>
          <button onClick={() => void handleExport()} disabled={exporting} className="rounded-2xl border border-gray-100 bg-white px-4 py-4 text-left text-sm font-semibold text-slate-700 transition hover:border-indigo-100 hover:bg-indigo-50/40 disabled:opacity-60">
            {exporting ? "Exporting..." : "Export journal"}
          </button>
        </div>
      </section>
    </div>
  );
}
