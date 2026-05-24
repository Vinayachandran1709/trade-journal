"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getCompletedTrades,
  getTrades,
  getTradesSummary,
  updateTradeAnnotations,
} from "@/lib/trades";
import type { CompletedTrade, Trade, TradesSummary } from "@/types/trade";

const PAGE_SIZE = 20;
const QUICK_EMOTIONS = ["confident", "fearful", "greedy", "revenge", "fomo", "neutral"] as const;

function formatCurrency(value: number): string {
  return "₹" + value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function Spinner() {
  return (
    <div className="section-container py-10">
      <div className="neutral-shell-card p-10 text-center text-sm font-semibold text-slate-500">
        Loading your trade review...
      </div>
    </div>
  );
}

function emotionClass(emotion?: string | null) {
  const value = (emotion || "").toLowerCase();
  if (value.includes("calm") || value.includes("confident")) return "badge-emerald";
  if (value.includes("fear") || value.includes("revenge") || value.includes("fomo")) return "badge-rose";
  return "badge-indigo";
}

function emotionLabel(emotion?: string | null) {
  return emotion ? emotion.replace(/_/g, " ") : "untagged";
}

function tradeReviewKey(trade: Pick<Trade, "stock_symbol" | "trade_date">) {
  return `${trade.stock_symbol.toUpperCase()}-${trade.trade_date.slice(0, 10)}`;
}

function completedTradeReviewKey(trade: Pick<CompletedTrade, "stock_symbol" | "entry_date">) {
  return `${trade.stock_symbol.toUpperCase()}-${trade.entry_date.slice(0, 10)}`;
}

function TradesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([]);
  const [summary, setSummary] = useState<TradesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [savingTradeId, setSavingTradeId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, { emotion_tag: string; note: string }>>({});

  const [filters, setFilters] = useState({
    symbol: "",
    start_date: "",
    end_date: "",
  });
  const [appliedFilters, setAppliedFilters] = useState({
    symbol: "",
    start_date: "",
    end_date: "",
  });

  const isMissingEmotionMode = searchParams.get("emotion") === "missing";
  const isLosersMissingEmotionMode = searchParams.get("review") === "losers-missing-emotion";
  const isNotesMissingMode = searchParams.get("review") === "notes-missing";
  const targetedTradeId = Number(searchParams.get("tradeId") ?? "");
  const isResolutionMode = isMissingEmotionMode || isLosersMissingEmotionMode || isNotesMissingMode;

  const fetchTradesPage = useCallback(
    async (currentFilters: typeof appliedFilters, currentPage: number) => {
      setLoading(true);
      setError("");
      try {
        const requestLimit = isResolutionMode ? 500 : PAGE_SIZE;
        const requestOffset = isResolutionMode ? 0 : currentPage * PAGE_SIZE;

        const [tradesData, summaryData, completedData] = await Promise.all([
          getTrades({
            ...(currentFilters.symbol ? { symbol: currentFilters.symbol } : {}),
            ...(currentFilters.start_date ? { start_date: currentFilters.start_date } : {}),
            ...(currentFilters.end_date ? { end_date: currentFilters.end_date } : {}),
            ...(isMissingEmotionMode ? { emotion: "missing" as const } : {}),
            ...(isLosersMissingEmotionMode ? { review: "losers-missing-emotion" as const } : {}),
            ...(isNotesMissingMode ? { review: "notes-missing" as const } : {}),
            limit: requestLimit,
            offset: requestOffset,
          }),
          getTradesSummary(),
          isLosersMissingEmotionMode ? getCompletedTrades(500, 0) : Promise.resolve([]),
        ]);

        setTrades(tradesData);
        setSummary(summaryData);
        setCompletedTrades(completedData);
        setDrafts(
          Object.fromEntries(
            tradesData.map((trade) => [
              trade.id,
              { emotion_tag: trade.emotion_tag ?? "", note: trade.notes ?? "" },
            ])
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load trades");
      } finally {
        setLoading(false);
      }
    },
    [isLosersMissingEmotionMode, isMissingEmotionMode, isNotesMissingMode, isResolutionMode]
  );

  useEffect(() => {
    fetchTradesPage(appliedFilters, page);
  }, [appliedFilters, page, fetchTradesPage]);

  function applyFilters() {
    setPage(0);
    setAppliedFilters({ ...filters });
  }

  function clearFilters() {
    const empty = { symbol: "", start_date: "", end_date: "" };
    setFilters(empty);
    setAppliedFilters(empty);
    setPage(0);
  }

  const visibleTrades = useMemo(() => {
    if (isNotesMissingMode) {
      return trades.filter((trade) => !(trade.notes ?? "").trim());
    }

    if (!isLosersMissingEmotionMode) {
      return trades;
    }

    const losingTradeKeys = new Set(
      completedTrades
        .filter((trade) => trade.pnl < 0)
        .map((trade) => completedTradeReviewKey(trade))
    );

    return trades.filter(
      (trade) => losingTradeKeys.has(tradeReviewKey(trade)) && !trade.emotion_tag
    );
  }, [completedTrades, isLosersMissingEmotionMode, isNotesMissingMode, trades]);

  const pagedTrades = useMemo(() => {
    if (!isResolutionMode) {
      return visibleTrades;
    }

    const start = page * PAGE_SIZE;
    return visibleTrades.slice(start, start + PAGE_SIZE);
  }, [isResolutionMode, page, visibleTrades]);

  useEffect(() => {
    if (!Number.isFinite(targetedTradeId) || targetedTradeId <= 0) {
      return;
    }

    const targetIndex = visibleTrades.findIndex((trade) => trade.id === targetedTradeId);
    if (targetIndex < 0) {
      return;
    }

    const targetPage = Math.floor(targetIndex / PAGE_SIZE);
    if (targetPage !== page) {
      setPage(targetPage);
    }
  }, [page, targetedTradeId, visibleTrades]);

  useEffect(() => {
    if (!Number.isFinite(targetedTradeId) || targetedTradeId <= 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const row = document.getElementById(`trade-row-${targetedTradeId}`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [page, pagedTrades, targetedTradeId]);

  async function handleQuickSave(tradeId: number) {
    const draft = drafts[tradeId];
    if (!draft) return;

    setSavingTradeId(tradeId);
    setError("");
    try {
      const updatedTrade = await updateTradeAnnotations(tradeId, {
        emotion_tag: draft.emotion_tag || null,
        note: draft.note || null,
      });
      setTrades((current) => current.map((trade) => (trade.id === tradeId ? updatedTrade : trade)));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save trade annotation");
    } finally {
      setSavingTradeId(null);
    }
  }

  if (loading && trades.length === 0) return <Spinner />;

  return (
    <div className="min-h-screen bg-gray-50 px-4 pb-16 pt-28 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="badge badge-indigo">Trade Review</span>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">Your Trades</h1>
            <p className="mt-2 text-gray-600">
              {isLosersMissingEmotionMode
                ? "Review losing trades with missing emotions and close the review gap quickly."
                : isNotesMissingMode
                  ? "Add a short follow-up note so the lesson survives after the trade is gone."
                : isMissingEmotionMode
                  ? "Quick-tag missing emotions and add a short follow-up note."
                  : "View, filter, and update the raw material behind your trading edge."}
            </p>
          </div>
          <button onClick={() => router.push("/import")} className="btn-primary">
            + Import Trades
          </button>
        </div>

        {summary && (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="stat-card">
              <p className="text-sm font-bold text-gray-500">Total Trades</p>
              <p className="mt-2 text-3xl font-black text-slate-950">
                {summary.total_trades.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="stat-card">
              <p className="text-sm font-bold text-gray-500">Total Invested</p>
              <p className="mt-2 text-3xl font-black text-slate-950">
                {formatCurrency(summary.total_invested)}
              </p>
            </div>
            <div className="stat-card">
              <p className="text-sm font-bold text-gray-500">Unique Symbols</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{summary.unique_symbols}</p>
            </div>
          </div>
        )}

        <div className="mt-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <label className="text-xs font-black uppercase tracking-wide text-gray-500">Symbol</label>
              <input
                type="text"
                placeholder="INFY"
                value={filters.symbol}
                onChange={(e) => setFilters((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <label className="text-xs font-black uppercase tracking-wide text-gray-500">Start Date</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <label className="text-xs font-black uppercase tracking-wide text-gray-500">End Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
            </div>
            <button onClick={applyFilters} disabled={loading} className="btn-primary disabled:opacity-60">
              Apply
            </button>
            <button onClick={clearFilters} className="btn-secondary">
              Clear
            </button>
          </div>
        </div>

        {isResolutionMode ? (
          <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
            <div className="font-bold">
              {isLosersMissingEmotionMode
                ? "Losers missing emotion review"
                : isNotesMissingMode
                  ? "Missing notes review"
                  : "Missing emotion review"}
            </div>
            <div className="mt-1">
              Use quick emotion tags and a short note to resolve review gaps directly from this table.
            </div>
          </div>
        ) : null}

        {error && (
          <div className="mt-6 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-6">
          {visibleTrades.length === 0 && !loading ? (
            <div className="rounded-3xl border border-gray-100 bg-white p-12 text-center shadow-sm">
              <p className="text-xl font-black text-slate-950">
                {isResolutionMode ? "Nothing to resolve right now" : "No trades yet"}
              </p>
              <p className="mt-2 text-sm text-gray-500">
                {isResolutionMode
                      ? "Your current filters did not find any unresolved review items."
                  : "Import your first trades to get started."}
              </p>
              {!isResolutionMode ? (
                <button className="btn-primary mt-6" onClick={() => router.push("/import")}>
                  Import Trades
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-3xl border border-gray-100 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-slate-950 text-white">
                    <tr>
                      {[
                        "Date",
                        "Symbol",
                        "Type",
                        "Qty",
                        "Price",
                        "Total",
                        "Emotion",
                        "Broker",
                        "Source",
                        "Resolution",
                      ].map((col) => (
                        <th
                          key={col}
                          className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-300"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedTrades.map((trade) => {
                      const total = trade.quantity * trade.price;
                      const isBuy = trade.trade_type === "BUY";
                      const draft = drafts[trade.id] ?? {
                        emotion_tag: trade.emotion_tag ?? "",
                        note: trade.notes ?? "",
                      };
                      const showResolution = isResolutionMode || !trade.emotion_tag;

                      return (
                        <tr
                          id={`trade-row-${trade.id}`}
                          key={trade.id}
                          className={`transition hover:bg-gray-50 ${
                            trade.id === targetedTradeId ? "bg-indigo-50/80" : ""
                          }`}
                        >
                          <td className="whitespace-nowrap px-5 py-4 font-medium text-gray-600">
                            {formatDate(trade.trade_date)}
                          </td>
                          <td className="px-5 py-4 font-black text-slate-950">{trade.stock_symbol}</td>
                          <td className="px-5 py-4">
                            <span className={`badge ${isBuy ? "badge-emerald" : "badge-rose"}`}>
                              {trade.trade_type}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-semibold text-gray-700">
                            {trade.quantity.toLocaleString("en-IN")}
                          </td>
                          <td className="px-5 py-4 font-semibold text-gray-700">{formatCurrency(trade.price)}</td>
                          <td className={`px-5 py-4 font-black ${isBuy ? "text-emerald-600" : "text-rose-600"}`}>
                            {formatCurrency(total)}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`badge ${emotionClass(draft.emotion_tag || trade.emotion_tag)}`}>
                              {emotionLabel(draft.emotion_tag || trade.emotion_tag)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-gray-600">{trade.broker || "—"}</td>
                          <td className="px-5 py-4 text-gray-500">{trade.import_source || "—"}</td>
                          <td className="px-5 py-4">
                            {showResolution ? (
                              <div className="min-w-[220px] space-y-3">
                                <div className="flex flex-wrap gap-2">
                                  {QUICK_EMOTIONS.map((emotion) => (
                                    <button
                                      key={emotion}
                                      type="button"
                                      onClick={() =>
                                        setDrafts((current) => ({
                                          ...current,
                                          [trade.id]: { ...draft, emotion_tag: emotion },
                                        }))
                                      }
                                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                                        draft.emotion_tag === emotion
                                          ? "bg-indigo-600 text-white"
                                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                      }`}
                                    >
                                      {emotion}
                                    </button>
                                  ))}
                                </div>
                                <input
                                  type="text"
                                  value={draft.note}
                                  onChange={(event) =>
                                    setDrafts((current) => ({
                                      ...current,
                                      [trade.id]: { ...draft, note: event.target.value },
                                    }))
                                  }
                                  placeholder="Short review note"
                                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-indigo-500 focus:bg-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleQuickSave(trade.id)}
                                  disabled={savingTradeId === trade.id}
                                  className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                                >
                                  {savingTradeId === trade.id ? "Saving..." : "Save"}
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">No action needed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-gray-500">
                  Showing {visibleTrades.length === 0 ? 0 : page * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE + pagedTrades.length, visibleTrades.length)} trades
                </p>
                <div className="flex gap-2">
                  <button
                    className="btn-secondary disabled:opacity-50"
                    disabled={page === 0 || loading}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    ← Previous
                  </button>
                  <button
                    className="btn-secondary disabled:opacity-50"
                    disabled={page * PAGE_SIZE + pagedTrades.length >= visibleTrades.length || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TradesPage() {
  return <TradesContent />;
}
