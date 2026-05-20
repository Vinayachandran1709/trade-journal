"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { getAnalyticsSummary, getPatterns, type AnalyticsSummaryResponse, type PatternsEnvelope } from "@/lib/analytics";
import { getCompletedTrades, getTradeSetups, getTrades } from "@/lib/trades";
import type { CompletedTrade, Trade, TradeSetup } from "@/types/trade";

type MistakeCategory = {
  name: string;
  count: number;
  totalPnl: number;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function formatCurrency(value: number | null | undefined): string {
  const amount = toFiniteNumber(value) ?? 0;
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number | null | undefined): string {
  const amount = toFiniteNumber(value);
  if (amount == null) {
    return "0.0%";
  }
  return `${(amount * 100).toFixed(1)}%`;
}

function formatSignedCurrency(value: number | null | undefined): string {
  const amount = toFiniteNumber(value) ?? 0;
  return `${amount >= 0 ? "+" : "-"}${formatCurrency(Math.abs(amount))}`;
}

function formatSignedPercent(value: number | null | undefined): string {
  const amount = toFiniteNumber(value) ?? 0;
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(1)}%`;
}

function emotionClass(emotion?: string | null) {
  const value = (emotion || "").toLowerCase();
  if (value.includes("confident") || value.includes("calm")) return "badge-emerald";
  if (value.includes("fear") || value.includes("revenge") || value.includes("fomo")) return "badge-rose";
  return "badge-indigo";
}

function emotionLabel(emotion?: string | null) {
  const value = (emotion || "").trim();
  if (!value) return "Not tagged";
  const normalized = value.toLowerCase();
  if (normalized.includes("revenge")) return "😤 Revenge";
  if (normalized.includes("fomo")) return "😬 FOMO";
  if (normalized.includes("fear")) return "😟 Fear";
  if (normalized.includes("confident")) return "😎 Confident";
  return value;
}

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

function getAverageDailyTrades(completedTrades: CompletedTrade[]) {
  const perDay = new Map<string, number>();
  for (const trade of completedTrades) {
    const key = dateKey(trade.exit_date);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  if (!perDay.size) return 0;
  return [...perDay.values()].reduce((sum, count) => sum + count, 0) / perDay.size;
}

function getOvertradingDays(completedTrades: CompletedTrade[]) {
  const averageDailyTrades = getAverageDailyTrades(completedTrades);
  const threshold = averageDailyTrades * 2;
  const perDay = new Map<string, number>();
  for (const trade of completedTrades) {
    const key = dateKey(trade.exit_date);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  return new Set(
    [...perDay.entries()]
      .filter(([, count]) => count > threshold && threshold > 0)
      .map(([key]) => key)
  );
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

function calculateSetupRisk(setup: TradeSetup) {
  if (
    setup.risk_amount != null &&
    Number.isFinite(setup.risk_amount) &&
    setup.risk_amount > 0
  ) {
    return setup.risk_amount;
  }
  if (
    setup.entry_price == null ||
    setup.stop_loss_price == null ||
    setup.position_size == null
  ) {
    return null;
  }
  const riskPerUnit = Math.abs(setup.entry_price - setup.stop_loss_price);
  const quantity = setup.entry_price > 0 ? setup.position_size / setup.entry_price : 0;
  const totalRisk = riskPerUnit * quantity;
  return totalRisk > 0 ? totalRisk : null;
}

function calculateSetupRR(setup: TradeSetup) {
  if (
    setup.entry_price == null ||
    setup.stop_loss_price == null ||
    setup.target_price == null
  ) {
    return null;
  }
  const risk = Math.abs(setup.entry_price - setup.stop_loss_price);
  const reward = Math.abs(setup.target_price - setup.entry_price);
  if (!risk) return null;
  return reward / risk;
}

function buildMistakeCategories(
  completedTrades: CompletedTrade[],
  rawTrades: Trade[],
  setups: TradeSetup[],
  patterns: PatternsEnvelope | null
): MistakeCategory[] {
  const linkedSetups = new Map(setups.filter((setup) => setup.linked_trade_id).map((setup) => [setup.linked_trade_id as number, setup]));
  const overtradingDays = getOvertradingDays(completedTrades);
  const weakHour = getWeakHourMatcher(patterns);

  const categories = new Map<string, MistakeCategory>();

  function add(name: string, trade: CompletedTrade) {
    const current = categories.get(name) ?? { name, count: 0, totalPnl: 0 };
    current.count += 1;
    current.totalPnl += trade.pnl;
    categories.set(name, current);
  }

  for (const trade of completedTrades.filter((item) => item.pnl < 0)) {
    const rawMatch = matchRawTrade(rawTrades, trade);
    const setupMatch = linkedSetups.get(trade.id) ?? null;
    const emotion = (rawMatch?.emotion_tag ?? "").toLowerCase();

    if (emotion.includes("revenge")) add("Revenge trades", trade);
    if (emotion.includes("fomo")) add("FOMO entries", trade);
    if (!setupMatch) add("Unplanned trades", trade);
    if (weakHour.matches(rawMatch)) add("Weak-hour trades", trade);
    if (overtradingDays.has(dateKey(trade.exit_date))) add("Overtrading days", trade);

    const rr = setupMatch ? calculateSetupRR(setupMatch) : null;
    if (rr != null && rr < 1) add("Low R:R setups", trade);
  }

  return [...categories.values()].sort((a, b) => a.totalPnl - b.totalPnl);
}

function getAvoidableLosses(
  completedTrades: CompletedTrade[],
  rawTrades: Trade[],
  patterns: PatternsEnvelope | null
) {
  const overtradingDays = getOvertradingDays(completedTrades);
  const weakHour = getWeakHourMatcher(patterns);

  return completedTrades
    .filter((trade) => trade.pnl < 0)
    .filter((trade) => {
      const rawMatch = matchRawTrade(rawTrades, trade);
      const emotion = (rawMatch?.emotion_tag ?? "").toLowerCase();
      return (
        emotion.includes("revenge") ||
        emotion.includes("fomo") ||
        weakHour.matches(rawMatch) ||
        overtradingDays.has(dateKey(trade.exit_date))
      );
    })
    .reduce((sum, trade) => sum + trade.pnl, 0);
}

function getBiggestMistakeType(
  completedTrades: CompletedTrade[],
  rawTrades: Trade[],
  setups: TradeSetup[]
) {
  const candidates = [
    {
      name: "Revenge Trading",
      trades: completedTrades.filter((trade) => {
        const rawMatch = matchRawTrade(rawTrades, trade);
        return trade.pnl < 0 && (rawMatch?.emotion_tag ?? "").toLowerCase().includes("revenge");
      }),
    },
    {
      name: "FOMO Entries",
      trades: completedTrades.filter((trade) => {
        const rawMatch = matchRawTrade(rawTrades, trade);
        return trade.pnl < 0 && (rawMatch?.emotion_tag ?? "").toLowerCase().includes("fomo");
      }),
    },
    {
      name: "Unplanned Trades",
      trades: completedTrades.filter(
        (trade) => trade.pnl < 0 && !setups.find((setup) => setup.linked_trade_id === trade.id)
      ),
    },
  ];

  const biggestMistake =
    candidates
      .map((candidate) => ({
        name: candidate.name,
        count: candidate.trades.length,
        totalLoss: candidate.trades.reduce((sum, trade) => sum + Math.abs(trade.pnl), 0),
      }))
      .sort((a, b) => b.totalLoss - a.totalLoss || b.count - a.count)[0] ?? null;

  if (!biggestMistake || biggestMistake.count === 0) {
    return null;
  }

  return biggestMistake;
}

function getPlanAdherence(setup: TradeSetup, trade: CompletedTrade) {
  if (
    setup.target_price != null &&
    Math.abs(trade.exit_price - setup.target_price) / setup.target_price < 0.03
  ) {
    return { label: "✅ Exited near target", tone: "good" as const };
  }
  if (
    setup.stop_loss_price != null &&
    Math.abs(trade.exit_price - setup.stop_loss_price) / setup.stop_loss_price < 0.03
  ) {
    return { label: "⚠️ Stopped out", tone: "partial" as const };
  }
  if (
    trade.pnl < 0 &&
    setup.stop_loss_price != null &&
    trade.exit_price > Math.min(trade.entry_price, setup.stop_loss_price) &&
    trade.exit_price < Math.max(trade.entry_price, setup.stop_loss_price)
  ) {
    return { label: "❌ Early panic exit", tone: "poor" as const };
  }
  if (
    setup.entry_price != null &&
    trade.entry_price > setup.entry_price * 1.02
  ) {
    const deviation = ((trade.entry_price - setup.entry_price) / setup.entry_price) * 100;
    return { label: `⚠️ Chased entry (+${deviation.toFixed(1)}%)`, tone: "partial" as const };
  }
  return { label: "↔ Partial plan adherence", tone: "partial" as const };
}

function getCorrectionPlan(
  patterns: PatternsEnvelope | null,
  mistakeCategories: MistakeCategory[],
  rawTrades: Trade[]
) {
  const items: string[] = [];
  const activePatterns = patterns?.unlocked ? patterns.patterns.filter((pattern) => !pattern.locked) : [];

  const todPattern = activePatterns.find((pattern) => pattern.pattern_type === "time_of_day");
  if (todPattern?.data?.worst_bucket) {
    items.push(`Limit new entries during ${String(todPattern.data.worst_bucket)} — your weakest window.`);
  }

  const otPattern = activePatterns.find((pattern) => pattern.pattern_type === "overtrading");
  if (otPattern?.data?.threshold) {
    items.push(`Maximum ${String(otPattern.data.threshold)} trades per day.`);
  }

  const revengePattern = activePatterns.find((pattern) => pattern.pattern_type === "revenge_trading");
  if (revengePattern) {
    items.push("Wait 30 minutes after any loss before entering a new trade.");
  }

  if (mistakeCategories.find((item) => item.name === "Unplanned trades" && item.count > 3)) {
    items.push("No trade without a pre-trade checklist.");
  }

  const emotionPct =
    rawTrades.filter((trade) => Boolean(trade.emotion_tag)).length / Math.max(rawTrades.length, 1);
  if (emotionPct < 0.5) {
    items.push("Tag emotions immediately after each trade capture.");
  }

  if (items.length < 3) {
    items.push("Review your losing trades every evening.");
  }
  if (items.length < 3) {
    items.push("Use the position size calculator before every trade.");
  }

  return items.slice(0, 4);
}

function MistakesSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 pt-28">
      <div className="section-container">
        <div className="h-10 w-72 animate-pulse rounded-xl bg-gray-200" />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
        <div className="mt-8 h-72 animate-pulse rounded-3xl bg-white" />
      </div>
    </div>
  );
}

function MistakesContent() {
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [patterns, setPatterns] = useState<PatternsEnvelope | null>(null);
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([]);
  const [rawTrades, setRawTrades] = useState<Trade[]>([]);
  const [setups, setSetups] = useState<TradeSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadMistakes() {
      const [
        summaryResult,
        patternsResult,
        completedResult,
        rawTradesResult,
        setupsResult,
      ] = await Promise.allSettled([
        getAnalyticsSummary(),
        getPatterns(),
        getCompletedTrades(200, 0),
        getTrades({ limit: 200 }),
        getTradeSetups(100, 0),
      ]);

      if (!active) return;

      if (summaryResult.status === "fulfilled") setSummary(summaryResult.value);
      if (patternsResult.status === "fulfilled") setPatterns(patternsResult.value);
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
            : "Some mistake review sections could not be loaded."
        );
      }

      setLoading(false);
    }

    void loadMistakes();
    return () => {
      active = false;
    };
  }, []);

  const mistakeCategories = useMemo(
    () => buildMistakeCategories(completedTrades, rawTrades, setups, patterns),
    [completedTrades, patterns, rawTrades, setups]
  );

  if (loading) {
    return <MistakesSkeleton />;
  }

  if (error && !summary && !patterns && completedTrades.length === 0 && rawTrades.length === 0 && setups.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-28">
        <div className="section-container rounded-2xl bg-rose-50 p-5 text-sm font-semibold text-rose-700">
          {error}
        </div>
      </div>
    );
  }

  const avoidableLosses = getAvoidableLosses(completedTrades, rawTrades, patterns);
  const biggestMistake = getBiggestMistakeType(completedTrades, rawTrades, setups);
  const worstTrade =
    completedTrades.filter((trade) => trade.pnl < 0).sort((a, b) => a.pnl - b.pnl)[0] ?? null;
  const tradesWithoutPlan = completedTrades.filter(
    (trade) => !setups.find((setup) => setup.linked_trade_id === trade.id)
  ).length;
  const worstTrades = completedTrades
    .filter((trade) => trade.pnl < 0)
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 5);
  const linkedSetups = setups.filter((setup) => setup.linked_trade_id);
  const correctionPlan = getCorrectionPlan(patterns, mistakeCategories, rawTrades);
  const weakHour = getWeakHourMatcher(patterns);
  const activePatterns = patterns?.unlocked ? patterns.patterns.filter((pattern) => !pattern.locked) : [];
  const revengePattern = activePatterns.find((pattern) => pattern.pattern_type === "revenge_trading");

  return (
    <div className="min-h-screen bg-gray-50 px-4 pb-16 pt-28 sm:px-6 lg:px-8">
      <div className="section-container">
        {error ? (
          <div className="mb-6 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mb-6 flex flex-wrap gap-3 text-sm font-semibold text-slate-600">
          <Link href="/dashboard" className="hover:text-indigo-600">
            Dashboard
          </Link>
          <span>•</span>
          <Link href="/dashboard/trades" className="hover:text-indigo-600">
            Trades
          </Link>
          <span>•</span>
          <Link href="/dashboard/analytics" className="hover:text-indigo-600">
            Patterns
          </Link>
          <span>•</span>
          <span className="text-indigo-600">Mistakes</span>
        </div>

        <section className="rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
          <span className="badge badge-rose">Review Mistakes</span>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">
            Where did you lose money unnecessarily?
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            This page highlights avoidable losses, missing plans, and the corrections your data suggests you consider next.
          </p>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="mistake-summary-card">
            <div className="text-sm font-bold text-gray-500">Avoidable Losses</div>
            {avoidableLosses < 0 ? (
              <>
                <div className="mt-3 text-3xl font-black text-rose-600">{formatSignedCurrency(avoidableLosses)}</div>
                <p className="mt-2 text-sm text-gray-500">Behavior-linked losses this review can clearly identify.</p>
              </>
            ) : (
              <div className="mt-3 text-sm font-semibold text-emerald-700">
                ₹0 — No clear behavioral losses detected
              </div>
            )}
          </article>

          <article className="mistake-summary-card">
            <div className="text-sm font-bold text-gray-500">Biggest Mistake Type</div>
            <div className="mt-3 text-2xl font-black text-slate-950">
              {biggestMistake?.name ?? "No data yet"}
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {biggestMistake ? `${biggestMistake.count} instances` : "0 instances"}
            </p>
          </article>

          <article className="mistake-summary-card">
            <div className="text-sm font-bold text-gray-500">Worst Trade</div>
            <div className="mt-3 text-2xl font-black text-rose-600">
              {worstTrade ? `${worstTrade.stock_symbol} ${formatSignedCurrency(worstTrade.pnl)}` : "No losing trade yet"}
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {worstTrade ? new Date(worstTrade.exit_date).toLocaleDateString("en-IN") : "Your biggest loss will appear here for review."}
            </p>
          </article>

          <article className="mistake-summary-card">
            <div className="text-sm font-bold text-gray-500">Trades Without Plan</div>
            <div className="mt-3 text-3xl font-black text-slate-950">
              {tradesWithoutPlan} of {completedTrades.length}
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {completedTrades.length
                ? `${Math.round((tradesWithoutPlan / completedTrades.length) * 100)}% of trades had no pre-trade plan`
                : "No completed trades yet"}
            </p>
          </article>
        </section>

        <section className="mt-8 rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-black text-slate-950">Mistake Categories</h2>
          {mistakeCategories.length ? (
            <div className="mt-6 overflow-x-auto">
              <table className="mistake-category-table">
                <thead>
                  <tr>
                    <th>Mistake</th>
                    <th>Count</th>
                    <th>P&amp;L Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {mistakeCategories.map((category, index) => (
                    <tr key={category.name} className={index % 2 === 1 ? "bg-slate-50/60" : ""}>
                      <td>{category.name}</td>
                      <td>{category.count}</td>
                      <td className="font-semibold text-rose-600">{formatSignedCurrency(category.totalPnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">
              No clear mistake patterns yet. Keep tagging emotions and using checklists to enable mistake detection.
            </p>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-black text-slate-950">Worst Trades Review</h2>
          <div className="mt-5 grid gap-4">
            {worstTrades.length ? (
              worstTrades.map((trade) => {
                const rawMatch = matchRawTrade(rawTrades, trade);
                const emotion = rawMatch?.emotion_tag ?? null;
                const setupMatch = setups.find((setup) => setup.linked_trade_id === trade.id) ?? null;

                let lesson = "Review the setup quality and exit process for this trade.";
                if ((emotion ?? "").toLowerCase().includes("revenge")) {
                  lesson = `Revenge entry — your revenge trades historically have ${formatPercent(
                    Number(revengePattern?.data?.revenge_win_rate ?? 0)
                  )} win rate.`;
                } else if ((emotion ?? "").toLowerCase().includes("fomo")) {
                  lesson = "FOMO entry — consider waiting for confirmation next time.";
                } else if (!setupMatch) {
                  lesson = "No checklist used — trades with checklists show higher plan adherence.";
                } else if (trade.holding_days === 0) {
                  lesson = "Same-day exit — your intraday trades may underperform your swing trades.";
                } else if (weakHour.matches(rawMatch)) {
                  lesson = `Weak-hour trade — consider reducing activity during ${weakHour.label || "your weak window"}.`;
                }

                return (
                  <article key={trade.id} className="worst-trade-card">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-lg font-black text-slate-950">
                        {trade.stock_symbol} · {formatSignedCurrency(trade.pnl)} · {formatSignedPercent(trade.return_pct)}
                      </h3>
                      <span className={`badge ${emotionClass(emotion)}`}>{emotionLabel(emotion)}</span>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      <div>Plan: {setupMatch ? "Had checklist" : "No pre-trade plan"}</div>
                      <div>Holding: {trade.holding_days} days</div>
                      <div>
                        Entry {formatCurrency(trade.entry_price)} → Exit {formatCurrency(trade.exit_price)}
                      </div>
                      <div>Date: {new Date(trade.exit_date).toLocaleDateString("en-IN")}</div>
                    </div>
                    <p className="mt-4 text-sm font-medium text-rose-700">{lesson}</p>
                  </article>
                );
              })
            ) : (
              <p className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">
                No losing trades to review yet.
              </p>
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

                const adherence = getPlanAdherence(setup, trade);
                const toneClass =
                  adherence.tone === "good"
                    ? "border-emerald-100 bg-emerald-50/30"
                    : adherence.tone === "poor"
                      ? "border-rose-100 bg-rose-50/30"
                      : "border-amber-100 bg-amber-50/30";

                return (
                  <article key={setup.id} className={`plan-comparison-card ${toneClass}`}>
                    <h3 className="text-lg font-black text-slate-950">{setup.symbol || trade.stock_symbol} Setup Review</h3>
                    <div className="overflow-x-auto">
                      <table className="plan-comparison-table">
                        <thead>
                          <tr>
                            <th />
                            <th>Planned</th>
                            <th>Actual</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Entry</td>
                            <td>{formatCurrency(setup.entry_price)}</td>
                            <td>{formatCurrency(trade.entry_price)}</td>
                          </tr>
                          <tr>
                            <td>Exit</td>
                            <td>{formatCurrency(setup.target_price)} (target)</td>
                            <td>{formatCurrency(trade.exit_price)}</td>
                          </tr>
                          <tr>
                            <td>SL</td>
                            <td>{formatCurrency(setup.stop_loss_price)}</td>
                            <td>—</td>
                          </tr>
                          <tr>
                            <td>Conviction</td>
                            <td>{setup.conviction_score ?? "—"}/10</td>
                            <td>—</td>
                          </tr>
                          <tr>
                            <td>Result</td>
                            <td>—</td>
                            <td>{formatSignedCurrency(trade.pnl)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 text-sm font-semibold text-slate-700">{adherence.label}</div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">
              No plan-vs-actual data yet. Use the pre-trade checklist in the extension to start tracking.
            </p>
          )}
        </section>

        <section className="mt-8 correction-plan-card">
          <h2 className="text-2xl font-black text-slate-950">📋 Your Correction Plan</h2>
          <div className="mt-4">
            {correctionPlan.map((item, index) => (
              <div key={item} className="correction-item">
                <span className="correction-number">{index + 1}</span>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-block h-4 w-4 rounded border border-indigo-300 bg-white" />
                  <span>{item}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function MistakesPage() {
  return (
    <AuthGuard>
      <MistakesContent />
    </AuthGuard>
  );
}
