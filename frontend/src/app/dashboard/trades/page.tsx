"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
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
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center">
      <svg className="h-8 w-8 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
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
    <div className="mx-auto max-w-7xl px-4 py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Your Trades</h1>
          <p className="mt-1 text-gray-500">View and filter your imported trades</p>
        </div>
        <Button onClick={() => router.push("/import")}>
          + Import Trades
        </Button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-sm font-medium text-gray-500">Total Trades</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {summary.total_trades.toLocaleString("en-IN")}
            </p>
          </Card>
          <Card>
            <p className="text-sm font-medium text-gray-500">Total Invested</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {formatCurrency(summary.total_invested)}
            </p>
          </Card>
          <Card>
            <p className="text-sm font-medium text-gray-500">Unique Symbols</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {summary.unique_symbols}
            </p>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="mt-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Filters</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Symbol
            </label>
            <input
              type="text"
              placeholder="e.g. INFY"
              value={filters.symbol}
              onChange={(e) =>
                setFilters((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Start Date
            </label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) =>
                setFilters((f) => ({ ...f, start_date: e.target.value }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              End Date
            </label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) =>
                setFilters((f) => ({ ...f, end_date: e.target.value }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <Button onClick={applyFilters} loading={loading}>
            Apply Filters
          </Button>
          <Button variant="outline" onClick={clearFilters}>
            Clear Filters
          </Button>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Trades table */}
      <div className="mt-6">
        {trades.length === 0 && !loading ? (
          <Card>
            <div className="flex flex-col items-center py-16 text-center">
              <div className="rounded-full bg-gray-100 p-4">
                <svg
                  className="h-8 w-8 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                No trades yet
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Import your first trades to get started.
              </p>
              <Button className="mt-6" onClick={() => router.push("/import")}>
                Import Trades
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Date", "Symbol", "Type", "Quantity", "Price", "Total", "Broker", "Source"].map(
                      (col) => (
                        <th
                          key={col}
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                        >
                          {col}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {trades.map((trade) => {
                    const total = trade.quantity * trade.price;
                    return (
                      <tr key={trade.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                          {formatDate(trade.trade_date)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {trade.stock_symbol}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              trade.trade_type === "BUY"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {trade.trade_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {trade.quantity.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {formatCurrency(trade.price)}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {formatCurrency(total)}
                        </td>
                        <td className="px-4 py-3">
                          {trade.broker ? (
                            <span className="inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                              {trade.broker}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {trade.import_source || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {page * PAGE_SIZE + 1}–
                {page * PAGE_SIZE + trades.length} trades
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ← Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={trades.length < PAGE_SIZE || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next →
                </Button>
              </div>
            </div>
          </>
        )}
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
