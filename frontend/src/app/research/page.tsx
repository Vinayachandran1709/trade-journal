"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import {
  askResearch,
  getDailyBrief,
  getResearchSuggestions,
  type DailyBriefResponse,
  type ResearchResponse,
  type SuggestionsResponse,
} from "@/lib/research";
import { isAuthenticated } from "@/lib/auth";

type Category = keyof SuggestionsResponse;

const CATEGORY_LABELS: Record<Category, string> = {
  my_trades: "My Trades",
  stock_research: "Stock Research",
  market_context: "Market Context",
  strategy_check: "Strategy Check",
  portfolio: "Portfolio",
};

const CATEGORY_BADGES: Record<Category, string> = {
  my_trades: "badge-indigo",
  stock_research: "badge-emerald",
  market_context: "badge-indigo",
  strategy_check: "badge-rose",
  portfolio: "badge-indigo",
};

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|₹[\d,.]+(?:\.\d+)?)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("₹")) {
      return (
        <code key={index} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-900">
          {part}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function ResearchMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter(Boolean);
  return (
    <div className="space-y-4 text-sm leading-7 text-slate-700 sm:text-base">
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter(Boolean);
        const bullets = lines.filter((line) => /^[-*]\s+/.test(line.trim()));
        if (bullets.length === lines.length && bullets.length > 0) {
          return (
            <ul key={index} className="list-disc space-y-2 pl-5">
              {bullets.map((line) => (
                <li key={line}>{renderInline(line.replace(/^[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{renderInline(block)}</p>;
      })}
    </div>
  );
}

function BriefCard({ brief, loading }: { brief: DailyBriefResponse | null; loading: boolean }) {
  if (loading) {
    return <div className="h-44 animate-pulse rounded-2xl bg-slate-800" />;
  }

  return (
    <aside className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-white shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-300">Today&apos;s Brief</h2>
        {brief?.confidence_score != null ? (
          <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-bold text-indigo-200">
            {brief.confidence_score}/100
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-300">
        {brief?.market_status === "closed" ? "Brief updates at market open. " : ""}
        {brief?.brief || "Your personalized brief will appear here once market context is available."}
      </p>
    </aside>
  );
}

function ResearchContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [activeCategory, setActiveCategory] = useState<Category>("my_trades");
  const [suggestions, setSuggestions] = useState<SuggestionsResponse | null>(null);
  const [brief, setBrief] = useState<DailyBriefResponse | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [result, setResult] = useState<ResearchResponse | null>(null);
  const [history, setHistory] = useState<ResearchResponse[]>([]);
  const [openHistory, setOpenHistory] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const [suggestionsResult, briefResult] = await Promise.allSettled([
        getResearchSuggestions(),
        getDailyBrief(),
      ]);
      if (!active) return;
      if (suggestionsResult.status === "fulfilled") setSuggestions(suggestionsResult.value);
      if (briefResult.status === "fulfilled") setBrief(briefResult.value);
      setBriefLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const visibleSuggestions = useMemo(
    () => suggestions?.[activeCategory] ?? [],
    [activeCategory, suggestions]
  );

  async function submitQuestion(nextQuery = query) {
    const trimmed = nextQuery.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await askResearch(trimmed);
      setResult(response);
      setHistory((items) => [response, ...items.filter((item) => item.query !== response.query)].slice(0, 5));
      setQuery("");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Unable to ask IndiaCircle";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion();
  }

  function askSuggestion(suggestion: string) {
    setQuery(suggestion);
    void submitQuestion(suggestion);
  }

  return (
    <main className="min-h-screen bg-gray-50 pt-16">
      <section className="bg-slate-950 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">Ask IndiaCircle</h1>
            <p className="mt-3 text-lg text-slate-400">
              Your AI research assistant, powered by your trading data
            </p>

            <form onSubmit={handleSubmit} className="research-search mt-8 max-w-3xl">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="research-input"
                placeholder="Ask anything about stocks, your trades, or the market..."
              />
              <button disabled={loading || !query.trim()} className="research-submit">
                Ask →
              </button>
            </form>

            <div className="research-tabs">
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`research-tab ${activeCategory === category ? "research-tab-active" : "research-tab-inactive"}`}
                >
                  {CATEGORY_LABELS[category]}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {visibleSuggestions.map((suggestion) => (
                <button key={suggestion} onClick={() => askSuggestion(suggestion)} className="suggestion-pill">
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          <BriefCard brief={brief} loading={briefLoading} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <div className="research-result">
            <div className="flex items-center gap-3">
              <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950">
                <span className="absolute h-5 w-5 animate-pulse rotate-45 rounded-md bg-indigo-500" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-white" />
              </span>
              <div>
                <div className="h-3 w-40 animate-pulse rounded bg-gray-100" />
                <div className="mt-2 h-3 w-64 animate-pulse rounded bg-gray-100" />
              </div>
            </div>
            <div className="mt-6 space-y-3">
              <div className="h-4 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="research-result border-rose-100 bg-rose-50">
            <h2 className="font-black text-rose-800">IndiaCircle could not answer that yet</h2>
            <p className="mt-2 text-sm text-rose-700">{error}</p>
            {error.toLowerCase().includes("quota") ? (
              <Link href="/pricing" className="btn-primary mt-5">
                Upgrade for more research
              </Link>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <article className="research-result">
            <span className={`badge ${CATEGORY_BADGES[result.category]}`}>
              {CATEGORY_LABELS[result.category]}
            </span>
            <div className="mt-5">
              <ResearchMarkdown text={result.response} />
            </div>
            <p className="mt-5 text-xs font-semibold text-gray-500">
              Queries remaining: {result.queries_remaining}/{result.queries_limit} today
              {result.cached ? " · Recently answered" : ""}
            </p>
            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-2 sm:flex-row">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-500 focus:bg-white"
                placeholder="Ask another question..."
              />
              <button disabled={loading || !query.trim()} className="btn-primary">
                Ask
              </button>
            </form>
          </article>
        ) : null}

        {history.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-lg font-black text-slate-950">This Session</h2>
            <div className="mt-4 space-y-3">
              {history.map((item, index) => (
                <article key={`${item.query}-${index}`} className="rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <button
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                    onClick={() => setOpenHistory(openHistory === index ? null : index)}
                  >
                    <span className="font-bold text-slate-800">{item.query}</span>
                    <span className="text-sm font-black text-indigo-600">{openHistory === index ? "−" : "+"}</span>
                  </button>
                  {openHistory === index ? (
                    <div className="border-t border-gray-100 px-5 py-4">
                      <ResearchMarkdown text={item.response} />
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function ResearchPreview() {
  const previewQuestions = [
    "Why is TCS down today?",
    "Why are PSU banks trending?",
    "Between INFY and TCS, which looks stronger today?",
    "How did I do this month?",
    "What mistake pattern is costing me money?",
  ];

  return (
    <main className="min-h-screen bg-gray-50 pt-16">
      <section className="bg-slate-950 px-4 py-12 text-white sm:px-6 lg:px-8">
        <div className="section-container">
          <span className="badge bg-white/10 text-white ring-1 ring-white/10">Research Preview</span>
          <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">
            Ask why a stock is moving — then connect it to your own trading history.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
            IndiaCircle turns market context into reviewable intelligence and connects it to your own trade behavior after import or auto-capture.
          </p>
          <Link href="/signup" className="btn-primary mt-8">
            Sign up to connect your trade history
          </Link>
          <p className="mt-4 max-w-3xl text-sm text-slate-400">
            Public examples are for product preview. Personalized answers unlock after trade import or auto-capture.
          </p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="section-container grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {previewQuestions.map((question) => (
            <article key={question} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">Example question</div>
              <h2 className="mt-3 text-xl font-black text-slate-950">{question}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Sample research preview: IndiaCircle can connect market narrative, trade review, and behavioral context in one answer.
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-padding bg-gray-50">
        <div className="section-container grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-500">Market Intelligence Feed</div>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Example output: sector narratives, FII/DII context, earnings reactions, and retail attention previews.
            </p>
          </article>
          <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-rose-500">Behavioral Analytics</div>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Sample insight: your late-session entries are the costliest repeat behavior in low-conviction markets.
            </p>
          </article>
          <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">Trade History Context</div>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Personalized answers become stronger once IndiaCircle can read your own imported or auto-captured history.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

export default function ResearchPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setLoggedIn(isAuthenticated());
  }, []);

  if (loggedIn == null) {
    return <div className="min-h-screen bg-gray-50 pt-28" />;
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 pt-28" />}>
      {loggedIn ? <ResearchContent /> : <ResearchPreview />}
    </Suspense>
  );
}
