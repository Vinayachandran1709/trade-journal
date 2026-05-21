"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { getMe } from "@/lib/auth";
import {
  getAnalyticsSummary,
  getPatterns,
  type AnalyticsSummaryResponse,
  type PatternResponse,
  type PatternsEnvelope,
} from "@/lib/analytics";
import {
  buildBeforeAfter,
  buildPerformanceScore,
  buildTraderProfile,
  estimatePatternImpact,
  formatCurrency,
  formatPercent,
  getConfidenceMeta,
  getPatternStatus,
  getPatternStatusLabel,
  getRuleLikeRecommendation,
  getTraderFacingPatternDescription,
  getTraderFacingPatternTitle,
  severityBadgeClass,
  severityBorderColor,
} from "@/lib/behavioral-insights";
import { getCompletedTrades, getTrades } from "@/lib/trades";
import type { CompletedTrade, Trade } from "@/types/trade";
import type { User } from "@/types/user";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function formatPatternStat(key: string, value: unknown): string {
  if (typeof value !== "number") {
    return value == null ? "--" : String(value);
  }
  if (key.includes("win_rate") || key.includes("share")) {
    return formatPercent(value);
  }
  if (key.includes("pnl")) {
    return formatCurrency(value);
  }
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function sortPatterns(patterns: PatternResponse[]): PatternResponse[] {
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...patterns].sort((a, b) => (order[a.severity] ?? 99) - (order[b.severity] ?? 99));
}

function getConfidenceExplanation(pattern: PatternResponse) {
  const sampleSize = Number(pattern.data?.sample_size ?? pattern.data?.trade_count ?? 0);
  if (sampleSize >= 30 || pattern.severity === "high") {
    return `Strong statistical evidence across ${sampleSize || "multiple"} trades.`;
  }
  if (sampleSize >= 12 || pattern.severity === "medium") {
    return "Pattern emerging, needs more trades for strong conclusion.";
  }
  return "Early signal — may change as more data comes in.";
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-950">Equity curve</h2>
          <p className="mt-1 text-sm text-gray-500">Your realized P&amp;L path across completed trades.</p>
        </div>
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
        <path
          d={path}
          fill="none"
          stroke="url(#equity)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {points.map((point) => (
          <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="2" fill="#4f46e5" />
        ))}
      </svg>
    </div>
  );
}

function AnalyticsContent() {
  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [patterns, setPatterns] = useState<PatternsEnvelope | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([]);
  const [trackedPatterns, setTrackedPatterns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAnalytics() {
      const userResult = await getMe()
        .then((value) => ({ ok: true as const, value }))
        .catch((reason) => ({ ok: false as const, reason }));

      if (!active) return;

      if (!userResult.ok) {
        setError(
          userResult.reason instanceof Error ? userResult.reason.message : "Failed to load analytics"
        );
        setLoading(false);
        return;
      }

      setUser(userResult.value);

      const [summaryResult, patternsResult, tradesResult, completedResult] = await Promise.allSettled([
        getAnalyticsSummary(),
        getPatterns(),
        getTrades({ limit: 500 }),
        getCompletedTrades(500),
      ]);

      if (!active) return;

      if (summaryResult.status === "fulfilled") setSummary(summaryResult.value);
      if (patternsResult.status === "fulfilled") setPatterns(patternsResult.value);
      if (tradesResult.status === "fulfilled") setTrades(tradesResult.value);
      if (completedResult.status === "fulfilled") setCompletedTrades(completedResult.value);

      const backgroundFailure = [
        summaryResult,
        patternsResult,
        tradesResult,
        completedResult,
      ].find((result) => result.status === "rejected");

      if (backgroundFailure?.status === "rejected") {
        setError(
          backgroundFailure.reason instanceof Error
            ? backgroundFailure.reason.message
            : "Some analytics sections could not be loaded."
        );
      }

      setLoading(false);
    }

    void loadAnalytics();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem("trackedPatterns") ?? "[]");
      if (Array.isArray(stored)) {
        setTrackedPatterns(stored.filter((value): value is string => typeof value === "string"));
      }
    } catch {
      setTrackedPatterns([]);
    }
  }, []);

  function toggleTrackedPattern(patternType: string) {
    setTrackedPatterns((current) => {
      const next = current.includes(patternType)
        ? current.filter((value) => value !== patternType)
        : [...current, patternType];
      if (typeof window !== "undefined") {
        window.localStorage.setItem("trackedPatterns", JSON.stringify(next));
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-28">
        <div className="section-container">
          <div className="h-10 w-72 animate-pulse rounded-xl bg-gray-200" />
          <div className="mt-8 grid gap-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-56 animate-pulse rounded-3xl bg-white" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!summary || !patterns) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-28">
        <div className="section-container rounded-2xl bg-rose-50 p-5 text-sm font-semibold text-rose-700">
          {error || "Analytics unavailable"}
        </div>
      </div>
    );
  }

  const sortedPatterns = sortPatterns(patterns.patterns.filter((pattern) => !pattern.locked));
  const progress = Math.min(100, (patterns.total_completed_trades / patterns.threshold) * 100);
  const profile = buildTraderProfile({
    user,
    trades,
    completedTrades,
    patterns: sortedPatterns,
  });
  const beforeAfter = buildBeforeAfter(completedTrades);
  const performanceScore = buildPerformanceScore({ summary, completedTrades, trades });

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
          <span className="text-indigo-600">Patterns</span>
          <span>•</span>
          <Link href="/dashboard/mistakes" className="hover:text-indigo-600">
            Mistakes
          </Link>
        </div>

        <div className="flex flex-col gap-6 rounded-[2rem] bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="badge badge-indigo">Analytics</span>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">
                Behavioral analytics for your trading edge
              </h1>
              <p className="mt-2 max-w-2xl text-gray-600">
                Your data shows where your discipline, timing, and consistency are helping or hurting.
              </p>
            </div>
            <div className="flex flex-col items-center gap-3 rounded-3xl bg-slate-50 px-8 py-6">
              <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">
                Performance Score
              </div>
              <div
                className="score-ring"
                style={{
                  background: `conic-gradient(#4f46e5 0% ${performanceScore.totalScore}%, #e2e8f0 ${performanceScore.totalScore}% 100%)`,
                }}
              >
                <div className="score-ring-inner">{performanceScore.totalScore}</div>
              </div>
              <p className="max-w-[220px] text-center text-xs text-slate-500">
                Built from win rate, consistency, risk discipline, and emotional awareness.
              </p>
            </div>
          </div>

          {!patterns.unlocked && (
            <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-black text-indigo-950">
                    Pattern analysis unlocks at {patterns.threshold} completed trades
                  </h2>
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
        </div>

        <section className="analytics-profile-card mt-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="analytics-section-kicker">Your Trader Profile</div>
              <h2 className="text-3xl font-black text-slate-950">Your trading DNA profile</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                A live profile built from your completed trades, journaling habits, and behavioral patterns.
              </p>
            </div>
            <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700">
              Discipline Score {profile.disciplineScore}/100
            </div>
          </div>

          <div className="analytics-profile-grid mt-8">
            <div className="analytics-profile-stat">
              <span>Trading Style</span>
              <strong>{profile.tradingStyle}</strong>
            </div>
            <div className="analytics-profile-stat">
              <span>Strongest Sector</span>
              <strong>{profile.strongestSector}</strong>
            </div>
            <div className="analytics-profile-stat">
              <span>Best Trading Hours</span>
              <strong>{profile.bestTradingHours}</strong>
            </div>
            <div className="analytics-profile-stat">
              <span>Emotional Pattern</span>
              <strong>{profile.emotionalPattern}</strong>
            </div>
            <div className="analytics-profile-stat">
              <span>Discipline Score</span>
              <strong>{profile.disciplineScore}/100</strong>
            </div>
            <div className="analytics-profile-stat">
              <span>Member Since</span>
              <strong>
                {profile.memberSince ? DATE_FORMATTER.format(new Date(profile.memberSince)) : "Recently joined"}
              </strong>
            </div>
          </div>
        </section>

        {beforeAfter ? (
          <section className="mt-8 rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="analytics-section-kicker">Progress Check</div>
                <h2 className="text-3xl font-black text-slate-950">Your recent performance vs earlier</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Comparing the first 50% of your completed trades with the most recent 50%.
                </p>
              </div>
              <div
                className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                  beforeAfter.improved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {beforeAfter.improved ? "↗ Improving trend" : "↘ Mixed recent trend"}
              </div>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl bg-slate-50 p-5">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">First 50%</div>
                <div className="mt-4 grid gap-3 text-sm text-slate-600">
                  <div className="flex justify-between gap-4">
                    <span>Win rate</span>
                    <strong className="text-slate-950">{formatPercent(beforeAfter.earlierStats.winRate)}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Avg P&amp;L</span>
                    <strong className="text-slate-950">{formatCurrency(beforeAfter.earlierStats.avgPnl)}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Avg holding period</span>
                    <strong className="text-slate-950">{beforeAfter.earlierStats.avgHolding.toFixed(1)} days</strong>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl bg-indigo-50 p-5">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">Recent 50%</div>
                <div className="mt-4 grid gap-3 text-sm text-slate-600">
                  <div className="flex justify-between gap-4">
                    <span>Win rate</span>
                    <strong className="text-slate-950">{formatPercent(beforeAfter.recentStats.winRate)}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Avg P&amp;L</span>
                    <strong className="text-slate-950">{formatCurrency(beforeAfter.recentStats.avgPnl)}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Avg holding period</span>
                    <strong className="text-slate-950">{beforeAfter.recentStats.avgHolding.toFixed(1)} days</strong>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <EquityCurve summary={summary} />
          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="analytics-section-kicker">Score Breakdown</div>
            <h2 className="mt-2 text-2xl font-black text-slate-950">What the score is reading</h2>
            <div className="mt-6 grid gap-4 text-sm">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="font-semibold text-slate-500">Win rate contribution</div>
                <div className="mt-2 text-2xl font-black text-slate-950">
                  {performanceScore.winRateScore.toFixed(1)}/30
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="font-semibold text-slate-500">Consistency</div>
                <div className="mt-2 text-2xl font-black text-slate-950">
                  {performanceScore.consistencyScore.toFixed(1)}/20
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="font-semibold text-slate-500">Risk discipline</div>
                <div className="mt-2 text-2xl font-black text-slate-950">
                  {performanceScore.riskDisciplineScore.toFixed(1)}/25
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="font-semibold text-slate-500">Emotional awareness</div>
                <div className="mt-2 text-2xl font-black text-slate-950">
                  {performanceScore.emotionalAwarenessScore.toFixed(1)}/25
                </div>
              </div>
            </div>
          </div>
        </div>

        <section id="patterns" className="mt-8 rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="analytics-section-kicker">Behavioral Patterns</div>
              <h2 className="text-3xl font-black text-slate-950">What your trading history is repeating</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                See what is helping, what is costing, and which repeat behaviors deserve a rule on your dashboard.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-5">
            {sortedPatterns.length ? (
              sortedPatterns.map((pattern) => {
                const confidence = getConfidenceMeta(pattern);
                const impact = estimatePatternImpact(pattern, summary);
                const tracked = trackedPatterns.includes(pattern.pattern_type);
                const sampleSize = Number(pattern.data?.sample_size ?? pattern.data?.trade_count ?? 0);

                return (
                  <article
                    key={pattern.pattern_type}
                    className="rounded-[1.5rem] border border-gray-100 bg-white p-6 shadow-sm"
                    style={{ borderLeft: `4px solid ${severityBorderColor(pattern.severity)}` }}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-3xl">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={`badge ${severityBadgeClass(pattern.severity)}`}>{pattern.severity}</span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              getPatternStatus(pattern, summary) === "costing"
                                ? "bg-rose-50 text-rose-700"
                                : getPatternStatus(pattern, summary) === "helping"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {getPatternStatusLabel(getPatternStatus(pattern, summary))}
                          </span>
                          <span className={`insight-confidence ${confidence.className}`}>
                            {confidence.text}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            {sampleSize || 0} trades
                          </span>
                        </div>
                        <h3 className="mt-4 text-2xl font-black text-slate-950">
                          {getTraderFacingPatternTitle(pattern)}
                        </h3>
                        <p className="mt-3 text-sm leading-7 text-slate-600">
                          {getTraderFacingPatternDescription(pattern)}
                        </p>
                        <p className="confidence-explanation">{getConfidenceExplanation(pattern)}</p>
                      </div>
                      <div className="flex min-w-[220px] flex-col items-start gap-3">
                        {impact ? (
                          <div
                            className={`w-full rounded-3xl px-5 py-4 text-lg font-black ${
                              impact.amount >= 0
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {impact.text}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => toggleTrackedPattern(pattern.pattern_type)}
                          className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                            tracked
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {tracked ? "Tracking ✓" : "📌 Track this"}
                        </button>
                      </div>
                    </div>

                    <div className="pattern-action-card">
                      <span className="mr-2">💡</span>
                      {getRuleLikeRecommendation(pattern)}
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {Object.entries(pattern.data ?? {}).map(([key, value]) => (
                        <div key={key} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                            {key.replace(/_/g, " ")}
                          </div>
                          <div className="mt-2 font-bold text-slate-950">
                            {formatPatternStat(key, value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="rounded-2xl bg-gray-50 p-6 text-sm font-semibold text-gray-500">
                No patterns detected yet. Keep journaling completed trades.
              </p>
            )}
          </div>
        </section>
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
