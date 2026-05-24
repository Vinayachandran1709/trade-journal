"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAnalyticsSummary, getPatterns, type AnalyticsSummaryResponse, type PatternsEnvelope } from "@/lib/analytics";
import { readSessionCache, writeSessionCache } from "@/lib/client-cache";
import { getCompletedTrades, getTradeSetups, getTrades } from "@/lib/trades";
import {
  formatCurrency,
  getAvoidableLossEstimate,
  getBiggestLeakSummary,
  getMostExpensiveBehavior,
  getRecommendation,
  getTopMistakeToWatch,
} from "@/lib/behavioral-insights";
import type { CompletedTrade, Trade, TradeSetup } from "@/types/trade";

const MISTAKES_CACHE_KEY = "dashboard-mistakes-cache";

type MistakeCategory = {
  name: string;
  count: number;
  totalPnl: number;
  avgLoss: number;
  shareOfLosses: number;
  href: string;
};

type Snapshot = {
  summary: AnalyticsSummaryResponse | null;
  patterns: PatternsEnvelope | null;
  completedTrades: CompletedTrade[];
  rawTrades: Trade[];
  setups: TradeSetup[];
};

function dateKey(value: string) {
  return value.slice(0, 10);
}

function matchRawTrade(rawTrades: Trade[], trade: CompletedTrade) {
  return (
    rawTrades.find(
      (raw) =>
        raw.stock_symbol.toUpperCase() === trade.stock_symbol.toUpperCase() &&
        dateKey(raw.trade_date) === dateKey(trade.entry_date)
    ) ?? null
  );
}

function parseBucketHour(bucket: unknown): number | null {
  const text = String(bucket ?? "");
  const bucketHour = parseInt(text.split(/[-: ]/)[0], 10);
  if (!Number.isFinite(bucketHour)) return null;
  return bucketHour < 12 && /\bPM\b/i.test(text) ? bucketHour + 12 : bucketHour;
}

function getTradeHour(rawTrade: Trade | null) {
  if (!rawTrade?.trade_time) return null;
  const directHour = parseInt(rawTrade.trade_time.split(":")[0] ?? "", 10);
  return Number.isFinite(directHour) ? directHour : null;
}

function getWeakHourMatcher(patterns: PatternsEnvelope | null) {
  const todPattern = patterns?.patterns?.find((pattern) => pattern.pattern_type === "time_of_day" && !pattern.locked);
  const bucketHour = parseBucketHour(todPattern?.data?.worst_bucket);
  return {
    label: String(todPattern?.data?.worst_bucket ?? ""),
    matches(rawTrade: Trade | null) {
      const tradeHour = getTradeHour(rawTrade);
      if (bucketHour == null || tradeHour == null) return false;
      return Math.abs(tradeHour - bucketHour) <= 1;
    },
  };
}

function getWeakWeekdayMatcher(patterns: PatternsEnvelope | null) {
  const pattern = patterns?.patterns?.find((item) => item.pattern_type === "day_of_week" && !item.locked);
  const label = String(pattern?.data?.worst_bucket ?? "");
  return {
    label,
    matches(trade: CompletedTrade) {
      if (!label) return false;
      const weekday = new Date(`${dateKey(trade.exit_date)}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long" });
      return weekday.toLowerCase().includes(label.toLowerCase().slice(0, 3));
    },
  };
}

function getWeakHoldingMatcher(patterns: PatternsEnvelope | null) {
  const pattern = patterns?.patterns?.find((item) => item.pattern_type === "holding_period" && !item.locked);
  const label = String(pattern?.data?.worst_bucket ?? "").toLowerCase();
  return {
    label,
    matches(trade: CompletedTrade) {
      if (!label) return false;
      if (label.includes("intra")) return trade.holding_days <= 1;
      if (label.includes("swing")) return trade.holding_days > 1 && trade.holding_days <= 7;
      if (label.includes("week") || label.includes("position")) return trade.holding_days > 7;
      return false;
    },
  };
}

function getOvertradingDays(completedTrades: CompletedTrade[]) {
  const perDay = new Map<string, number>();
  for (const trade of completedTrades) {
    const key = dateKey(trade.exit_date);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  if (!perDay.size) return new Set<string>();
  const average = [...perDay.values()].reduce((sum, count) => sum + count, 0) / perDay.size;
  return new Set([...perDay.entries()].filter(([, count]) => count > average * 2 && average > 0).map(([key]) => key));
}

function isChasedEntry(setup: TradeSetup | null, trade: CompletedTrade) {
  if (!setup?.entry_price) return false;
  return trade.entry_price > setup.entry_price * 1.02;
}

function buildMistakeCategories(
  completedTrades: CompletedTrade[],
  rawTrades: Trade[],
  setups: TradeSetup[],
  patterns: PatternsEnvelope | null
): MistakeCategory[] {
  const losingTrades = completedTrades.filter((trade) => trade.pnl < 0);
  const totalLosingPnl = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.pnl, 0));
  const weakHour = getWeakHourMatcher(patterns);
  const weakWeekday = getWeakWeekdayMatcher(patterns);
  const weakHolding = getWeakHoldingMatcher(patterns);
  const overtradingDays = getOvertradingDays(completedTrades);
  const categories = new Map<string, { count: number; totalPnl: number; href: string }>();

  function add(name: string, pnl: number, href: string) {
    const current = categories.get(name) ?? { count: 0, totalPnl: 0, href };
    current.count += 1;
    current.totalPnl += pnl;
    categories.set(name, current);
  }

  for (const trade of losingTrades) {
    const rawMatch = matchRawTrade(rawTrades, trade);
    const setupMatch = setups.find((setup) => setup.linked_trade_id === trade.id) ?? null;
    const emotion = (rawMatch?.emotion_tag ?? "").toLowerCase();

    if (!setupMatch) add("Unplanned trades", trade.pnl, "/dashboard/trades");
    if (emotion.includes("revenge")) add("Revenge trades", trade.pnl, "/dashboard/trades?review=losers-missing-emotion");
    if (emotion.includes("fomo")) add("FOMO entries", trade.pnl, "/dashboard/trades?review=losers-missing-emotion");
    if (weakHour.matches(rawMatch)) add("Weak-hour trades", trade.pnl, "/dashboard/analytics#patterns");
    if (weakWeekday.matches(trade)) add("Weak-weekday trades", trade.pnl, "/dashboard/analytics#patterns");
    if (weakHolding.matches(trade) || trade.holding_days === 0) add("Intraday drift / weak holding-bucket trades", trade.pnl, "/dashboard/analytics#patterns");
    if (isChasedEntry(setupMatch, trade)) add("Chased entries", trade.pnl, "/dashboard/trades");
    if (!rawMatch?.emotion_tag) add("Missing emotion on losers", trade.pnl, "/dashboard/trades?review=losers-missing-emotion");
    if (overtradingDays.has(dateKey(trade.exit_date))) add("Overtrading days", trade.pnl, "/dashboard/mistakes");
  }

  return [...categories.entries()]
    .map(([name, value]) => ({
      name,
      count: value.count,
      totalPnl: value.totalPnl,
      avgLoss: value.totalPnl / Math.max(value.count, 1),
      shareOfLosses: totalLosingPnl > 0 ? Math.abs(value.totalPnl) / totalLosingPnl : 0,
      href: value.href,
    }))
    .sort((left, right) => left.totalPnl - right.totalPnl);
}

function getAvoidableLosses(categories: MistakeCategory[]) {
  return categories.reduce((sum, item) => sum + item.totalPnl, 0);
}

function MistakesSkeleton() {
  return (
    <div className="section-container py-10">
      <div className="neutral-shell-card h-40 animate-pulse" />
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="neutral-shell-card h-32 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function MistakesPage() {
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [patterns, setPatterns] = useState<PatternsEnvelope | null>(null);
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([]);
  const [rawTrades, setRawTrades] = useState<Trade[]>([]);
  const [setups, setSetups] = useState<TradeSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [hydratedFromCache, setHydratedFromCache] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const cached = readSessionCache<Snapshot>(MISTAKES_CACHE_KEY);
    if (cached) {
      setSummary(cached.summary);
      setPatterns(cached.patterns);
      setCompletedTrades(cached.completedTrades);
      setRawTrades(cached.rawTrades);
      setSetups(cached.setups);
      setHydratedFromCache(true);
      setLoading(false);
    }

    let active = true;
    async function load() {
      try {
        const [summaryResult, patternsResult, completedResult, rawTradesResult, setupsResult] = await Promise.allSettled([
          getAnalyticsSummary(),
          getPatterns(),
          getCompletedTrades(200, 0),
          getTrades({ limit: 200 }),
          getTradeSetups(100, 0),
        ]);

        if (!active) return;

        const nextSummary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
        const nextPatterns = patternsResult.status === "fulfilled" ? patternsResult.value : null;
        const nextCompleted = completedResult.status === "fulfilled" ? completedResult.value : [];
        const nextTrades = rawTradesResult.status === "fulfilled" ? rawTradesResult.value : [];
        const nextSetups = setupsResult.status === "fulfilled" ? setupsResult.value : [];

        setSummary(nextSummary);
        setPatterns(nextPatterns);
        setCompletedTrades(nextCompleted);
        setRawTrades(nextTrades);
        setSetups(nextSetups);
        setError("");
        writeSessionCache(MISTAKES_CACHE_KEY, {
          summary: nextSummary,
          patterns: nextPatterns,
          completedTrades: nextCompleted,
          rawTrades: nextTrades,
          setups: nextSetups,
        });
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : "Unable to load mistake review");
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

  const mistakeCategories = useMemo(
    () => buildMistakeCategories(completedTrades, rawTrades, setups, patterns),
    [completedTrades, patterns, rawTrades, setups]
  );

  if (loading && !hydratedFromCache) {
    return <MistakesSkeleton />;
  }

  const avoidableLosses = getAvoidableLosses(mistakeCategories);
  const worstTrade = completedTrades.filter((trade) => trade.pnl < 0).sort((left, right) => left.pnl - right.pnl)[0] ?? null;
  const worstTrades = completedTrades.filter((trade) => trade.pnl < 0).sort((left, right) => left.pnl - right.pnl).slice(0, 4);
  const linkedSetups = setups.filter((setup) => setup.linked_trade_id).slice(0, 4);
  const biggestLeak = getBiggestLeakSummary((patterns?.patterns ?? []).filter((pattern) => !pattern.locked), summary);
  const avoidableEstimate = getAvoidableLossEstimate({
    categories: mistakeCategories,
    trades: rawTrades,
    completedTrades,
    summary,
  });
  const mostExpensiveBehavior = getMostExpensiveBehavior(mistakeCategories);
  const topMistakeToWatch = getTopMistakeToWatch({
    patterns: (patterns?.patterns ?? []).filter((pattern) => !pattern.locked),
    categories: mistakeCategories,
    trades: rawTrades,
  });
  const correctionPlan = mistakeCategories.slice(0, 3).map((item) => ({
    leak: item.name,
    rule: biggestLeak.patternType ? biggestLeak.action : "Write one rule before the next similar trade.",
    why: `${formatCurrency(Math.abs(item.totalPnl))} lost across ${item.count} trades.`,
    status:
      item.name.toLowerCase().includes("missing")
        ? "Pending"
        : Math.abs(item.totalPnl) > Math.abs(avoidableLosses) / 4
          ? "Improving"
          : "Fixed",
  }));

  return (
    <div className="section-container py-10">
      {error ? <div className="mb-6 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}

      <section className="rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
        <span className="badge badge-rose">Correction Workflow</span>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">Where did you lose money unnecessarily?</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">This page turns avoidable losses into fixes you can actually act on in the journal.</p>
      </section>

      <section className="mt-8 glass-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span className="badge badge-rose">Top mistake to watch today</span>
            <h2 className="mt-4 text-2xl font-black text-slate-950">{topMistakeToWatch}</h2>
            <p className="mt-2 text-sm text-slate-600">Use this as a behavioral reminder, not a trade call.</p>
          </div>
          <Link href="/dashboard/analytics#patterns" className="btn-secondary">
            Review patterns
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="mistake-summary-card">
          <div className="text-sm font-bold text-gray-500">Estimated Avoidable Loss</div>
          <div className="mt-3 text-3xl font-black text-rose-600">
            {avoidableEstimate.state === "ready" ? formatCurrency(avoidableEstimate.amount) : "Unavailable"}
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-800">{avoidableEstimate.label}</p>
          <p className="mt-1 text-sm text-gray-500">{avoidableEstimate.detail}</p>
        </article>
        <article className="mistake-summary-card">
          <div className="text-sm font-bold text-gray-500">Most expensive behavior</div>
          <div className="mt-3 text-2xl font-black text-slate-950">{mostExpensiveBehavior}</div>
          <p className="mt-2 text-sm text-gray-500">This is the behavior cluster costing the most in the current review window.</p>
        </article>
        <article className="mistake-summary-card">
          <div className="text-sm font-bold text-gray-500">Worst trade</div>
          <div className="mt-3 text-2xl font-black text-rose-600">{worstTrade ? `${worstTrade.stock_symbol} · ${formatCurrency(Math.abs(worstTrade.pnl))}` : "No losing trade yet"}</div>
          <p className="mt-2 text-sm text-gray-500">{worstTrade ? new Date(worstTrade.exit_date).toLocaleDateString("en-IN") : "Your biggest loss will appear here."}</p>
        </article>
        <article className="mistake-summary-card">
          <div className="text-sm font-bold text-gray-500">Trades without plan</div>
          <div className="mt-3 text-3xl font-black text-slate-950">{completedTrades.filter((trade) => !setups.find((setup) => setup.linked_trade_id === trade.id)).length}</div>
          <p className="mt-2 text-sm text-gray-500">No-checklist losers count as avoidable until proven otherwise.</p>
        </article>
      </section>

      <section className="mt-8 rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-black text-slate-950">Mistake categories</h2>
        {mistakeCategories.length ? (
          <div className="mt-6 overflow-x-auto">
            <table className="mistake-category-table">
              <thead>
                <tr>
                  <th>Mistake</th>
                  <th>Count</th>
                  <th>Rupee impact</th>
                  <th>Avg loss</th>
                  <th>Share of losing P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {mistakeCategories.map((category, index) => (
                  <tr key={category.name} className={index % 2 === 1 ? "bg-slate-50/60" : ""}>
                    <td><Link href={category.href} className="font-semibold text-slate-900 hover:text-indigo-600">{category.name}</Link></td>
                    <td>{category.count}</td>
                    <td className="font-semibold text-rose-600">-{formatCurrency(Math.abs(category.totalPnl))}</td>
                    <td className="font-semibold text-slate-700">-{formatCurrency(Math.abs(category.avgLoss))}</td>
                    <td>{Math.round(category.shareOfLosses * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">No clear mistake cluster yet. Keep tagging emotions and logging setups so avoidable losses become measurable.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-black text-slate-950">Worst trades review</h2>
        <div className="mt-5 grid gap-4">
          {worstTrades.length ? (
            worstTrades.map((trade) => {
              const rawMatch = matchRawTrade(rawTrades, trade);
              const setupMatch = setups.find((setup) => setup.linked_trade_id === trade.id) ?? null;
              const reasons = [
                !setupMatch ? "No plan existed" : null,
                !rawMatch?.emotion_tag ? "Missing emotion tag" : null,
                rawMatch?.emotion_tag?.toLowerCase().includes("revenge") ? "Revenge trade" : null,
                rawMatch?.emotion_tag?.toLowerCase().includes("fomo") ? "FOMO entry" : null,
                trade.holding_days === 0 ? "Intraday drift" : null,
                isChasedEntry(setupMatch, trade) ? "Chased entry" : null,
              ].filter((value): value is string => Boolean(value));

              return (
                <article key={trade.id} className="worst-trade-card">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-black text-slate-950">{trade.stock_symbol} · -{formatCurrency(Math.abs(trade.pnl))}</h3>
                    <span className="badge badge-rose">{rawMatch?.emotion_tag ? rawMatch.emotion_tag : "Not tagged"}</span>
                  </div>
                  {reasons.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {reasons.map((reason) => (
                        <span key={reason} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{reason}</span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <div>Why this was avoidable: {reasons[0] ?? "The plan and execution drifted apart."}</div>
                    <div>Holding: {trade.holding_days} days</div>
                    <div>Entry {formatCurrency(trade.entry_price)} → Exit {formatCurrency(trade.exit_price)}</div>
                    <div>Date: {new Date(trade.exit_date).toLocaleDateString("en-IN")}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href="/dashboard/trades?emotion=missing" className="btn-secondary">Add emotion</Link>
                    <Link href="/dashboard/trades?review=notes-missing" className="btn-secondary">Add note</Link>
                    <Link href="/dashboard#pre-trade-setups" className="btn-secondary">Review setup</Link>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">No losing trades to review yet.</p>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-black text-slate-950">Plan vs Actual Comparison</h2>
        {linkedSetups.length ? (
          <div className="mt-5 grid gap-4">
            {linkedSetups.map((setup) => {
              const trade = completedTrades.find((item) => item.id === setup.linked_trade_id);
              if (!trade) return null;
              return (
                <article key={setup.id} className="plan-comparison-card">
                  <h3 className="text-lg font-black text-slate-950">{setup.symbol || trade.stock_symbol} setup review</h3>
                  <div className="overflow-x-auto">
                    <table className="plan-comparison-table">
                      <thead>
                        <tr><th /><th>Planned</th><th>Actual</th></tr>
                      </thead>
                      <tbody>
                        <tr><td>Entry</td><td>{setup.entry_price ? formatCurrency(setup.entry_price) : "—"}</td><td>{formatCurrency(trade.entry_price)}</td></tr>
                        <tr><td>Exit</td><td>{setup.target_price ? formatCurrency(setup.target_price) : "No target existed"}</td><td>{formatCurrency(trade.exit_price)}</td></tr>
                        <tr><td>SL</td><td>{setup.stop_loss_price ? formatCurrency(setup.stop_loss_price) : "No stop existed"}</td><td>—</td></tr>
                        <tr><td>Finding</td><td>{setup.id ? "Plan existed" : "No plan existed"}</td><td>{isChasedEntry(setup, trade) ? "Chased entry" : trade.pnl < 0 ? "Loss absorbed" : "Held plan"}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">
                    {isChasedEntry(setup, trade) ? "Chased entry callout" : trade.pnl < 0 ? "No plan existed — this is the review finding" : "Plan vs actual still worth reviewing"}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">No plan-vs-actual data yet. Use the pre-trade checklist in the extension to start tracking.</p>
        )}
      </section>

      <section className="mt-8 correction-plan-card">
        <h2 className="text-2xl font-black text-slate-950">Correction plan</h2>
        <div className="mt-4">
          {correctionPlan.length ? correctionPlan.map((item, index) => (
            <div key={`${item.leak}-${index}`} className="correction-item">
              <span className="correction-number">{index + 1}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-950">
                  <span>Leak: {item.leak}</span>
                  <span className={`badge ${item.status === "Pending" ? "badge-rose" : item.status === "Improving" ? "badge-indigo" : "badge-emerald"}`}>
                    {item.status}
                  </span>
                </div>
                <div>Corrective rule: {item.rule}</div>
                <div>Why it matters: {item.why}</div>
              </div>
            </div>
          )) : (
            <div className="text-sm text-slate-600">No evidence-linked correction items yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
