"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getMe } from "@/lib/auth";
import { getAnalyticsSummary, getPatterns, type AnalyticsSummaryResponse, type PatternResponse, type PatternsEnvelope } from "@/lib/analytics";
import { readSessionCache, writeSessionCache } from "@/lib/client-cache";
import {
  buildBeforeAfter,
  buildPerformanceScore,
  buildTraderProfile,
  estimatePatternImpact,
  formatCurrency,
  formatPercent,
  getBiggestLeakSummary,
  getStrongestEdgeSummary,
  getPatternMetricTiles,
  getPatternProofTrades,
  getPatternStatus,
  getPatternStatusGroupTitle,
  getPatternStatusLabel,
  getRuleLikeRecommendation,
  getTraderFacingPatternDescription,
  getTraderFacingPatternTitle,
  severityBadgeClass,
  severityBorderColor,
  getConfidenceMeta,
  getScoreFraming,
  getAvoidableImpactSummary,
} from "@/lib/behavioral-insights";
import { getCompletedTrades, getTrades } from "@/lib/trades";
import type { CompletedTrade, Trade } from "@/types/trade";
import type { User } from "@/types/user";

const ANALYTICS_CACHE_KEY = "dashboard-analytics-cache";

type AnalyticsSnapshot = {
  user: User | null;
  summary: AnalyticsSummaryResponse | null;
  patterns: PatternsEnvelope | null;
  trades: Trade[];
  completedTrades: CompletedTrade[];
};

function sortPatterns(patterns: PatternResponse[]): PatternResponse[] {
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...patterns].sort((left, right) => (order[left.severity] ?? 99) - (order[right.severity] ?? 99));
}

function AnalyticsSkeleton() {
  return (
    <div className="section-container py-10">
      <div className="neutral-shell-card h-40 animate-pulse" />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="neutral-shell-card h-32 animate-pulse" />
        ))}
      </div>
      <div className="mt-6 neutral-shell-card h-96 animate-pulse" />
    </div>
  );
}

export default function AnalyticsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [patterns, setPatterns] = useState<PatternsEnvelope | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([]);
  const [trackedPatterns, setTrackedPatterns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [hydratedFromCache, setHydratedFromCache] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const cached = readSessionCache<AnalyticsSnapshot>(ANALYTICS_CACHE_KEY);
    if (cached) {
      setUser(cached.user);
      setSummary(cached.summary);
      setPatterns(cached.patterns);
      setTrades(cached.trades);
      setCompletedTrades(cached.completedTrades);
      setHydratedFromCache(true);
      setLoading(false);
    }

    let active = true;
    async function load() {
      try {
        const resolvedUser = await getMe();
        const [summaryResult, patternsResult, tradesResult, completedResult] = await Promise.allSettled([
          getAnalyticsSummary(),
          getPatterns(),
          getTrades({ limit: 500 }),
          getCompletedTrades(500),
        ]);

        if (!active) return;

        const nextSummary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
        const nextPatterns = patternsResult.status === "fulfilled" ? patternsResult.value : null;
        const nextTrades = tradesResult.status === "fulfilled" ? tradesResult.value : [];
        const nextCompleted = completedResult.status === "fulfilled" ? completedResult.value : [];

        setUser(resolvedUser);
        setSummary(nextSummary);
        setPatterns(nextPatterns);
        setTrades(nextTrades);
        setCompletedTrades(nextCompleted);
        setError("");
        writeSessionCache(ANALYTICS_CACHE_KEY, {
          user: resolvedUser,
          summary: nextSummary,
          patterns: nextPatterns,
          trades: nextTrades,
          completedTrades: nextCompleted,
        });
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : "Unable to load analytics");
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

  if (loading && !hydratedFromCache) {
    return <AnalyticsSkeleton />;
  }

  if (!summary || !patterns) {
    return (
      <div className="section-container py-10">
        <div className="rounded-2xl bg-rose-50 p-5 text-sm font-semibold text-rose-700">{error || "Analytics unavailable"}</div>
      </div>
    );
  }

  const sortedPatterns = sortPatterns(patterns.patterns.filter((pattern) => !pattern.locked));
  const progress = Math.min(100, (patterns.total_completed_trades / patterns.threshold) * 100);
  const profile = buildTraderProfile({ user, trades, completedTrades, patterns: sortedPatterns });
  const beforeAfter = buildBeforeAfter(completedTrades);
  const performanceScore = buildPerformanceScore({ summary, completedTrades, trades });
  const biggestLeak = getBiggestLeakSummary(sortedPatterns, summary);
  const strongestEdge = getStrongestEdgeSummary(sortedPatterns, summary);
  const scoreFraming = getScoreFraming({ summary, trades, patterns: sortedPatterns });
  const groupedPatterns = [
    {
      title: getPatternStatusGroupTitle("costing"),
      items: sortedPatterns.filter((pattern) => getPatternStatus(pattern, summary) === "costing"),
    },
    {
      title: getPatternStatusGroupTitle("helping"),
      items: sortedPatterns.filter((pattern) => getPatternStatus(pattern, summary) === "helping"),
    },
    {
      title: getPatternStatusGroupTitle("monitoring"),
      items: sortedPatterns.filter((pattern) => getPatternStatus(pattern, summary) === "monitoring"),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="section-container py-10">
      {error ? <div className="mb-6 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}

      <div className="flex flex-col gap-6 rounded-[2rem] bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="badge badge-indigo">Patterns</span>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">Behavioral analytics for your trading edge</h1>
            <p className="mt-2 max-w-2xl text-gray-600">See the biggest leak, the strongest edge, and the next rule worth protecting this month.</p>
          </div>
          <div className="rounded-3xl bg-slate-50 px-8 py-6 text-center">
            <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Performance score</div>
            <div className="mt-3 text-4xl font-black text-slate-950">{performanceScore.totalScore}</div>
            <p className="mt-2 max-w-[220px] text-xs text-slate-500">Main drag: {scoreFraming.drag}. Next fix: {scoreFraming.nextFix}</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl bg-rose-50 p-5">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-rose-500">Biggest leak</div>
            <h2 className="mt-3 text-xl font-black text-slate-950">{biggestLeak.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{biggestLeak.detail}</p>
            <p className="mt-3 text-sm font-semibold text-slate-900">{biggestLeak.action}</p>
          </div>
          <div className="rounded-3xl bg-emerald-50 p-5">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-500">Strongest edge</div>
            <h2 className="mt-3 text-xl font-black text-slate-950">{strongestEdge.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{strongestEdge.detail}</p>
            <p className="mt-3 text-sm font-semibold text-slate-900">{strongestEdge.action}</p>
          </div>
          <div className="rounded-3xl bg-indigo-50 p-5">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">Monthly swing</div>
            <h2 className="mt-3 text-xl font-black text-slate-950">{getAvoidableImpactSummary(sortedPatterns, summary)}</h2>
            <p className="mt-2 text-sm text-slate-600">Use this as a money-first reminder of why the next rule matters.</p>
          </div>
        </div>

        {!patterns.unlocked ? (
          <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-black text-indigo-950">Pattern analysis unlocks at {patterns.threshold} completed trades</h2>
                <p className="mt-1 text-sm text-indigo-700">You have {patterns.total_completed_trades} completed trades.</p>
              </div>
              <span className="text-2xl font-black text-indigo-600">{Math.round(progress)}%</span>
            </div>
            <div className="mt-4 h-3 rounded-full bg-white">
              <div className="h-full rounded-full bg-indigo-600" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      <section className="analytics-profile-card mt-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="analytics-section-kicker">Trader Profile</div>
            <h2 className="text-3xl font-black text-slate-950">Your trading DNA profile</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">A live profile built from completed trades, journaling habits, and behavioral patterns.</p>
          </div>
          <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700">Discipline score {profile.disciplineScore}/100</div>
        </div>
        <div className="analytics-profile-grid mt-8">
          <div className="analytics-profile-stat"><span>Trading style</span><strong>{profile.tradingStyle}</strong></div>
          <div className="analytics-profile-stat"><span>Strongest sector</span><strong>{profile.strongestSector}</strong></div>
          <div className="analytics-profile-stat"><span>Best trading hours</span><strong>{profile.bestTradingHours}</strong></div>
          <div className="analytics-profile-stat"><span>Emotional pattern</span><strong>{profile.emotionalPattern}</strong></div>
          <div className="analytics-profile-stat"><span>Main drag</span><strong>{scoreFraming.drag}</strong></div>
          <div className="analytics-profile-stat"><span>Next fix</span><strong>{scoreFraming.nextFix}</strong></div>
        </div>
      </section>

      {beforeAfter ? (
        <section className="mt-8 rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="analytics-section-kicker">Progress Check</div>
              <h2 className="text-3xl font-black text-slate-950">Your recent performance vs earlier</h2>
              <p className="mt-2 text-sm text-slate-600">Comparing the first half of your completed trades with the most recent half.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl bg-slate-50 p-5">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">First half</div>
              <div className="mt-4 grid gap-3 text-sm text-slate-600">
                <div className="flex justify-between gap-4"><span>Win rate</span><strong className="text-slate-950">{formatPercent(beforeAfter.earlierStats.winRate)}</strong></div>
                <div className="flex justify-between gap-4"><span>Avg P&amp;L</span><strong className="text-slate-950">{formatCurrency(beforeAfter.earlierStats.avgPnl)}</strong></div>
              </div>
            </div>
            <div className="rounded-3xl bg-indigo-50 p-5">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">Recent half</div>
              <div className="mt-4 grid gap-3 text-sm text-slate-600">
                <div className="flex justify-between gap-4"><span>Win rate</span><strong className="text-slate-950">{formatPercent(beforeAfter.recentStats.winRate)}</strong></div>
                <div className="flex justify-between gap-4"><span>Avg P&amp;L</span><strong className="text-slate-950">{formatCurrency(beforeAfter.recentStats.avgPnl)}</strong></div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section id="patterns" className="mt-8 rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="analytics-section-kicker">Behavioral Patterns</div>
            <h2 className="text-3xl font-black text-slate-950">What your trading history is repeating</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">Each card shows the money signal, the rule, and a couple of proof trades instead of a raw data dump.</p>
          </div>
        </div>

        <div className="mt-8 grid gap-8">
          {groupedPatterns.map((group) => (
            <section key={group.title}>
              <div className="mb-4 flex items-center gap-3">
                <h3 className="text-xl font-black text-slate-950">{group.title}</h3>
                <span className="text-sm font-semibold text-slate-500">{group.items.length} patterns</span>
              </div>
              <div className="grid gap-5">
                {group.items.map((pattern) => {
                  const confidence = getConfidenceMeta(pattern);
                  const impact = estimatePatternImpact(pattern, summary);
                  const tracked = trackedPatterns.includes(pattern.pattern_type);
                  const metricTiles = getPatternMetricTiles(pattern);
                  const proofTrades = getPatternProofTrades(pattern, completedTrades);

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
                            <span className={`badge ${getPatternStatus(pattern, summary) === "costing" ? "badge-rose" : getPatternStatus(pattern, summary) === "helping" ? "badge-emerald" : "badge-indigo"}`}>
                              {getPatternStatusLabel(getPatternStatus(pattern, summary))}
                            </span>
                            <span className={`insight-confidence ${confidence.className}`}>{confidence.text}</span>
                          </div>
                          <h3 className="mt-4 text-2xl font-black text-slate-950">{getTraderFacingPatternTitle(pattern)}</h3>
                          <p className="mt-3 text-sm leading-7 text-slate-600">{getTraderFacingPatternDescription(pattern)}</p>
                          <div className="pattern-action-card mt-4">
                            <span className="mr-2">Rule:</span>
                            {getRuleLikeRecommendation(pattern)}
                          </div>
                        </div>
                        <div className="flex min-w-[220px] flex-col items-start gap-3">
                          {impact ? (
                            <div className={`w-full rounded-3xl px-5 py-4 text-lg font-black ${impact.amount >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                              {impact.text}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => toggleTrackedPattern(pattern.pattern_type)}
                            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${tracked ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                          >
                            {tracked ? "Tracking ✓" : "Track this"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        {metricTiles.map((tile) => (
                          <div key={`${pattern.pattern_type}-${tile.label}`} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                            <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{tile.label}</div>
                            <div className="mt-2 font-bold text-slate-950">{tile.value}</div>
                          </div>
                        ))}
                      </div>

                      {proofTrades.length ? (
                        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Proof trades</div>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            {proofTrades.map((trade) => (
                              <div key={trade.id} className="rounded-2xl bg-white p-4 text-sm">
                                <div className="font-black text-slate-950">{trade.stock_symbol}</div>
                                <div className="mt-1 text-slate-500">{new Date(trade.exit_date).toLocaleDateString("en-IN")}</div>
                                <div className={`mt-2 font-black ${trade.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatCurrency(trade.pnl)}</div>
                                <div className="mt-1 text-slate-500">{trade.holding_days} day hold</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
