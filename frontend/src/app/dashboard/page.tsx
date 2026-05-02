"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { getMe } from "@/lib/auth";
import { getAnalyticsSummary, getPatterns, type AnalyticsSummaryResponse, type PatternResponse } from "@/lib/analytics";
import { getTrades } from "@/lib/trades";
import type { Trade } from "@/types/trade";
import type { User } from "@/types/user";

function formatCurrency(value: number | null | undefined): string {
  const amount = value ?? 0;
  return "₹" + amount.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function emotionClass(emotion?: string | null) {
  const value = (emotion || "").toLowerCase();
  if (value.includes("confident") || value.includes("calm")) return "badge-emerald";
  if (value.includes("fear") || value.includes("revenge")) return "badge-rose";
  return "badge-indigo";
}

function DashboardContent() {
  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [patterns, setPatterns] = useState<PatternResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      getMe(),
      getAnalyticsSummary().catch(() => null),
      getTrades({ limit: 5, offset: 0 }).catch(() => []),
      getPatterns().catch(() => null),
    ])
      .then(([userData, summaryData, tradesData, patternsData]) => {
        setUser(userData);
        setSummary(summaryData);
        setTrades(tradesData);
        setPatterns(patternsData?.patterns.slice(0, 2) ?? []);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load dashboard")
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pb-16 pt-28">
        <div className="section-container">
          <div className="h-10 w-64 animate-pulse rounded-xl bg-gray-200" />
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-28">
        <div className="section-container rounded-2xl bg-rose-50 p-5 text-sm font-semibold text-rose-700">
          {error}
        </div>
      </div>
    );
  }

  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "Trader";
  const pnlPositive = (summary?.total_pnl ?? 0) >= 0;

  return (
    <div className="min-h-screen bg-gray-50 px-4 pb-16 pt-28 sm:px-6 lg:px-8">
      <div className="section-container">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <span className="badge badge-indigo">Web dashboard</span>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">
              Welcome back, {firstName}
            </h1>
            <p className="mt-2 text-gray-600">
              Your journal, patterns, and trading pulse in one clean workspace.
            </p>
          </div>
          <Link href="/dashboard/analytics" className="btn-primary">
            View Analytics
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            ["Total Trades", summary?.total_trades.toLocaleString("en-IN") ?? "0"],
            ["Win Rate", `${Math.round((summary?.win_rate ?? 0) * 100)}%`],
            ["Total P&L", formatCurrency(summary?.total_pnl)],
            ["Best Trade", summary?.best_trade.symbol ? `${summary.best_trade.symbol} · ${formatCurrency(summary.best_trade.pnl)}` : "No trades"],
          ].map(([label, value], index) => (
            <div key={label} className="stat-card">
              <p className="text-sm font-bold text-gray-500">{label}</p>
              <p
                className={`mt-3 text-2xl font-black ${
                  label === "Total P&L" ? pnlPositive ? "text-emerald-600" : "text-rose-600" : "text-slate-950"
                }`}
              >
                {value}
              </p>
              <div className="mt-4 h-1.5 rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-indigo-600"
                  style={{ width: `${[78, Math.max(8, (summary?.win_rate ?? 0) * 100), 58, 42][index]}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Quick actions</h2>
            <div className="mt-5 grid gap-3">
              {[
                ["/import", "Import Trades", "Upload CSV or email data from Indian brokers."],
                ["/dashboard/analytics", "View Patterns", "See behavior signals from completed trades."],
                ["/download", "Open Extension", "Install or pin IndiaCircle in your browser."],
              ].map(([href, title, desc]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-2xl border border-gray-100 p-5 transition hover:border-indigo-100 hover:bg-indigo-50/40"
                >
                  <p className="font-black text-slate-950">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-gray-500">{desc}</p>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-950">Recent trades</h2>
              <Link href="/dashboard/trades" className="text-sm font-bold text-indigo-600">
                View all
              </Link>
            </div>
            <div className="mt-5 divide-y divide-gray-100">
              {trades.length ? trades.map((trade) => (
                <div key={trade.id} className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="font-black text-slate-950">{trade.stock_symbol}</p>
                    <p className="mt-1 text-xs font-semibold text-gray-500">
                      {trade.trade_type} · {trade.quantity.toLocaleString("en-IN")} qty · {trade.broker || "Broker"}
                    </p>
                  </div>
                  <span className={`badge ${emotionClass(trade.emotion_tag)}`}>
                    {trade.emotion_tag || "untagged"}
                  </span>
                </div>
              )) : (
                <div className="py-10 text-center">
                  <p className="font-black text-slate-950">No trades yet</p>
                  <p className="mt-2 text-sm text-gray-500">Import trades to unlock your dashboard.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {patterns.length > 0 && (
          <div className="mt-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Top detected patterns</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {patterns.map((pattern) => (
                <div key={pattern.pattern_type} className="rounded-2xl border border-gray-100 p-5">
                  <span className={`badge ${pattern.severity === "high" ? "badge-rose" : pattern.severity === "medium" ? "badge-indigo" : "badge-emerald"}`}>
                    {pattern.severity}
                  </span>
                  <h3 className="mt-4 font-black text-slate-950">{pattern.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{pattern.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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
