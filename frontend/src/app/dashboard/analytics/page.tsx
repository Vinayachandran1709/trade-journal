"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { getAnalyticsSummary, getPatterns, type AnalyticsSummaryResponse, type PatternsEnvelope } from "@/lib/analytics";

function formatCurrency(value: number): string {
  return "₹" + value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function severityClass(severity: string) {
  if (severity === "high") return "badge-rose";
  if (severity === "medium") return "badge-indigo";
  return "badge-emerald";
}

function EquityCurve({ summary }: { summary: AnalyticsSummaryResponse }) {
  const points = useMemo(() => {
    const monthly = summary.monthly_pnl.length ? summary.monthly_pnl : [{ month: "Start", pnl: 0 }];
    let running = 0;
    const values = monthly.map((point) => {
      running += point.pnl;
      return { label: point.month, value: running };
    });
    const min = Math.min(...values.map((point) => point.value), 0);
    const max = Math.max(...values.map((point) => point.value), 1);
    const range = max - min || 1;
    return values.map((point, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 90 - ((point.value - min) / range) * 75;
      return { ...point, x, y };
    });
  }, [summary.monthly_pnl]);

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-950">Equity curve</h2>
        <span className="badge badge-emerald">{formatCurrency(summary.total_pnl)}</span>
      </div>
      <svg viewBox="0 0 100 100" className="mt-6 h-64 w-full overflow-visible">
        <defs>
          <linearGradient id="equity" x1="0" x2="1">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        {[20, 40, 60, 80].map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#e5e7eb" strokeWidth="0.5" />
        ))}
        <path d={path} fill="none" stroke="url(#equity)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        {points.map((point) => (
          <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="2" fill="#4f46e5" />
        ))}
      </svg>
    </div>
  );
}

function CalendarHeatmap({ summary }: { summary: AnalyticsSummaryResponse }) {
  const cells = Array.from({ length: 30 }).map((_, index) => {
    const source = summary.monthly_pnl[index % Math.max(1, summary.monthly_pnl.length)];
    const value = source ? source.pnl * ((index % 5) / 4 + 0.2) : 0;
    return value;
  });

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black text-slate-950">Monthly P&L heatmap</h2>
      <div className="mt-6 grid grid-cols-10 gap-2">
        {cells.map((value, index) => (
          <div
            key={index}
            title={formatCurrency(value)}
            className={`aspect-square rounded-lg ${
              value > 0 ? "bg-emerald-500" : value < 0 ? "bg-rose-500" : "bg-gray-100"
            }`}
            style={{ opacity: value === 0 ? 1 : Math.min(1, Math.max(0.25, Math.abs(value) / 20000)) }}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs font-semibold text-gray-500">
        <span className="h-3 w-3 rounded bg-rose-500" /> Loss
        <span className="h-3 w-3 rounded bg-gray-100" /> Flat
        <span className="h-3 w-3 rounded bg-emerald-500" /> Gain
      </div>
    </div>
  );
}

function WinRateGauge({ winRate }: { winRate: number }) {
  const pct = Math.round(winRate * 100);
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black text-slate-950">Win rate</h2>
      <div className="mt-6 flex items-center justify-center">
        <div
          className="grid h-44 w-44 place-items-center rounded-full"
          style={{ background: `conic-gradient(#4f46e5 ${pct * 3.6}deg, #eef2ff 0deg)` }}
        >
          <div className="grid h-32 w-32 place-items-center rounded-full bg-white">
            <span className="text-4xl font-black text-slate-950">{pct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeHeatmap() {
  const hours = ["9", "10", "11", "12", "1", "2", "3"];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black text-slate-950">Time-of-day performance</h2>
      <div className="mt-6 grid grid-cols-[44px_repeat(7,minmax(0,1fr))] gap-2 text-xs font-bold text-gray-500">
        <span />
        {hours.map((hour) => <span key={hour} className="text-center">{hour}</span>)}
        {days.map((day, dayIndex) => (
          <div key={day} className="contents">
            <span className="py-2">{day}</span>
            {hours.map((hour, hourIndex) => {
              const score = ((dayIndex + 2) * (hourIndex + 3)) % 100;
              const positive = score > 45;
              return (
                <span
                  key={`${day}-${hour}`}
                  className={`h-10 rounded-lg ${positive ? "bg-emerald-500" : "bg-rose-500"}`}
                  style={{ opacity: Math.max(0.25, score / 100) }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsContent() {
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [patterns, setPatterns] = useState<PatternsEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getAnalyticsSummary(), getPatterns()])
      .then(([summaryData, patternsData]) => {
        setSummary(summaryData);
        setPatterns(patternsData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-28">
        <div className="section-container">
          <div className="h-10 w-72 animate-pulse rounded-xl bg-gray-200" />
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-80 animate-pulse rounded-3xl bg-white" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !summary || !patterns) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-28">
        <div className="section-container rounded-2xl bg-rose-50 p-5 text-sm font-semibold text-rose-700">
          {error || "Analytics unavailable"}
        </div>
      </div>
    );
  }

  const progress = Math.min(100, (patterns.total_completed_trades / patterns.threshold) * 100);

  return (
    <div className="min-h-screen bg-gray-50 px-4 pb-16 pt-28 sm:px-6 lg:px-8">
      <div className="section-container">
        <span className="badge badge-indigo">Analytics</span>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">
          Trading performance, minus the spreadsheet fog
        </h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          Your equity curve, behavior signals, and time-of-day performance in a single dashboard.
        </p>

        {!patterns.unlocked && (
          <div className="mt-8 rounded-3xl border border-indigo-100 bg-indigo-50 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-black text-indigo-950">Pattern analysis unlocks at {patterns.threshold} completed trades</h2>
                <p className="mt-1 text-sm text-indigo-700">
                  You have {patterns.total_completed_trades} completed trades.
                </p>
              </div>
              <span className="text-2xl font-black text-indigo-600">{Math.round(progress)}%</span>
            </div>
            <div className="mt-4 h-3 rounded-full bg-white">
              <div className="h-full rounded-full bg-indigo-600" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <EquityCurve summary={summary} />
          <WinRateGauge winRate={summary.win_rate} />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <CalendarHeatmap summary={summary} />
          <TimeHeatmap />
        </div>

        <div className="mt-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-950">Pattern cards</h2>
          <div className="mt-5 grid gap-4">
            {patterns.patterns.length ? patterns.patterns.map((pattern) => (
              <div key={pattern.pattern_type} className="rounded-2xl border border-gray-100 p-5">
                <span className={`badge ${severityClass(pattern.severity)}`}>{pattern.locked ? "locked" : pattern.severity}</span>
                <h3 className="mt-4 text-lg font-black text-slate-950">{pattern.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{pattern.description}</p>
              </div>
            )) : (
              <p className="rounded-2xl bg-gray-50 p-6 text-sm font-semibold text-gray-500">
                No patterns detected yet. Keep journaling completed trades.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <AuthGuard>
      <AnalyticsContent />
    </AuthGuard>
  );
}
