"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { getTrades, getTradesSummary } from "@/lib/trades";
import type { Trade, TradesSummary } from "@/types/trade";

const PAGE_SIZE = 20;

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
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
    </div>
  );
}

function emotionClass(emotion?: string | null) {
  const value = (emotion || "").toLowerCase();
  if (value.includes("calm") || value.includes("confident")) return "badge-emerald";
  if (value.includes("fear") || value.includes("revenge") || value.includes("fomo")) return "badge-rose";
  return "badge-indigo";
}

function TradesContent() {
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<TradesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

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

  const fetchTrades = useCallback(
    async (currentFilters: typeof appliedFilters, currentPage: number) => {
      setLoading(true);
      setError("");
      try {
        const [tradesData, summaryData] = await Promise.all([
          getTrades({
            ...(currentFilters.symbol ? { symbol: currentFilters.symbol } : {}),
            ...(currentFilters.start_date ? { start_date: currentFilters.start_date } : {}),
            ...(currentFilters.end_date ? { end_date: currentFilters.end_date } : {}),
            limit: PAGE_SIZE,
            offset: currentPage * PAGE_SIZE,
          }),
          getTradesSummary(),
        ]);
        setTrades(tradesData);
        setSummary(summaryData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load trades");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchTrades(appliedFilters, page);
  }, [appliedFilters, page, fetchTrades]);

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

  if (loading && trades.length === 0) return <Spinner />;

  return (
    <div className="min-h-screen bg-gray-50 px-4 pb-16 pt-28 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="badge badge-indigo">Journal</span>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">Your Trades</h1>
            <p className="mt-2 text-gray-600">View, filter, and tag the raw material of your trading edge.</p>
          </div>
          <button onClick={() => router.push("/import")} className="btn-primary">
            + Import Trades
          </button>
        </div>

        {summary && (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="stat-card">
              <p className="text-sm font-bold text-gray-500">Total Trades</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{summary.total_trades.toLocaleString("en-IN")}</p>
            </div>
            <div className="stat-card">
              <p className="text-sm font-bold text-gray-500">Total Invested</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{formatCurrency(summary.total_invested)}</p>
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

        {error && (
          <div className="mt-6 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-6">
          {trades.length === 0 && !loading ? (
            <div className="rounded-3xl border border-gray-100 bg-white p-12 text-center shadow-sm">
              <p className="text-xl font-black text-slate-950">No trades yet</p>
              <p className="mt-2 text-sm text-gray-500">Import your first trades to get started.</p>
              <button className="btn-primary mt-6" onClick={() => router.push("/import")}>
                Import Trades
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-3xl border border-gray-100 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-slate-950 text-white">
                    <tr>
                      {["Date", "Symbol", "Type", "Qty", "Price", "Total", "Emotion", "Broker", "Source"].map((col) => (
                        <th key={col} className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-300">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {trades.map((trade) => {
                      const total = trade.quantity * trade.price;
                      const isBuy = trade.trade_type === "BUY";
                      return (
                        <tr key={trade.id} className="transition hover:bg-gray-50">
                          <td className="whitespace-nowrap px-5 py-4 font-medium text-gray-600">{formatDate(trade.trade_date)}</td>
                          <td className="px-5 py-4 font-black text-slate-950">{trade.stock_symbol}</td>
                          <td className="px-5 py-4">
                            <span className={`badge ${isBuy ? "badge-emerald" : "badge-rose"}`}>{trade.trade_type}</span>
                          </td>
                          <td className="px-5 py-4 font-semibold text-gray-700">{trade.quantity.toLocaleString("en-IN")}</td>
                          <td className="px-5 py-4 font-semibold text-gray-700">{formatCurrency(trade.price)}</td>
                          <td className={`px-5 py-4 font-black ${isBuy ? "text-emerald-600" : "text-rose-600"}`}>{formatCurrency(total)}</td>
                          <td className="px-5 py-4">
                            <span className={`badge ${emotionClass(trade.emotion_tag)}`}>{trade.emotion_tag || "untagged"}</span>
                          </td>
                          <td className="px-5 py-4 text-gray-600">{trade.broker || "—"}</td>
                          <td className="px-5 py-4 text-gray-500">{trade.import_source || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-gray-500">
                  Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + trades.length} trades
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
                    disabled={trades.length < PAGE_SIZE || loading}
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
  return (
    <AuthGuard>
      <TradesContent />
    </AuthGuard>
  );
}
