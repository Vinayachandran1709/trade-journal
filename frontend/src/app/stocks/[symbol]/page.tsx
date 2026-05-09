"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isAuthenticated } from "@/lib/auth";
import { getEarningsCalendar, getTickerIntelligence, whyIsMoving, type EarningsEvent, type TickerIntelligence, type WhyMovingResponse } from "@/lib/market";
import { getCompletedTrades } from "@/lib/trades";
import { addToWatchlist } from "@/lib/watchlist";
import type { CompletedTrade } from "@/types/trade";

const RELATED_BY_SECTOR: Record<string, string[]> = {
  Technology: ["INFY", "TCS", "WIPRO", "HCLTECH", "TECHM"],
  "Information Technology": ["INFY", "TCS", "WIPRO", "HCLTECH", "TECHM"],
  Financial: ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK"],
  "Financial Services": ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK"],
  Energy: ["RELIANCE", "ONGC", "BPCL", "IOC", "COALINDIA"],
  "Consumer Defensive": ["ITC", "HINDUNILVR", "NESTLEIND", "BRITANNIA", "DABUR"],
  Healthcare: ["SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "APOLLOHOSP"],
  Industrials: ["LT", "SIEMENS", "ABB", "BEL", "HAL"],
  "Consumer Cyclical": ["TATAMOTORS", "MARUTI", "M&M", "BAJAJ-AUTO", "EICHERMOT"],
};

function formatCurrency(value: number | null | undefined) {
  if (value == null) return "N/A";
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatCompact(value: number | null | undefined) {
  if (value == null) return "N/A";
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function changeClass(value: number | null | undefined) {
  if ((value ?? 0) >= 0) return "text-emerald-400";
  return "text-rose-400";
}

function HistorySummary({ trades }: { trades: CompletedTrade[] }) {
  if (!trades.length) return null;
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const winRate = Math.round((wins / trades.length) * 100);
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black text-slate-950">Your History With This Stock</h2>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        {trades.length} trades · Win rate: <strong>{winRate}%</strong> · Total P&amp;L:{" "}
        <strong className={totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"}>{formatCurrency(totalPnl)}</strong> · Last:{" "}
        {trades[0]?.exit_date}
      </p>
    </section>
  );
}

function StockPageContent() {
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(params.symbol || "").toUpperCase();
  const authed = isAuthenticated();
  const [ticker, setTicker] = useState<TickerIntelligence | null>(null);
  const [why, setWhy] = useState<WhyMovingResponse | null>(null);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [history, setHistory] = useState<CompletedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [whyLoading, setWhyLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const [tickerResult, earningsResult, historyResult] = await Promise.allSettled([
        getTickerIntelligence(symbol),
        getEarningsCalendar(),
        authed ? getCompletedTrades(500, 0) : Promise.resolve([] as CompletedTrade[]),
      ]);
      if (!active) return;
      if (tickerResult.status === "fulfilled") setTicker(tickerResult.value);
      else setError(tickerResult.reason instanceof Error ? tickerResult.reason.message : "Unable to load stock data");
      if (earningsResult.status === "fulfilled") {
        setEarnings((earningsResult.value.upcoming || []).filter((event) => event.symbol === symbol));
      }
      if (historyResult.status === "fulfilled") {
        setHistory(historyResult.value.filter((trade) => trade.stock_symbol.toUpperCase() === symbol));
      }
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [authed, symbol]);

  useEffect(() => {
    if (!authed) return;
    let active = true;
    async function loadWhy() {
      setWhyLoading(true);
      try {
        const result = await whyIsMoving(symbol);
        if (active) setWhy(result);
      } catch {
        if (active) setWhy(null);
      } finally {
        if (active) setWhyLoading(false);
      }
    }
    void loadWhy();
    return () => {
      active = false;
    };
  }, [authed, symbol]);

  const related = useMemo(() => {
    const sector = ticker?.sector || "";
    const candidates = RELATED_BY_SECTOR[sector] || RELATED_BY_SECTOR[Object.keys(RELATED_BY_SECTOR).find((key) => sector.includes(key)) || ""] || ["RELIANCE", "TCS", "HDFCBANK", "INFY", "SBIN"];
    return candidates.filter((item) => item !== symbol).slice(0, 5);
  }, [symbol, ticker?.sector]);

  async function handleAddToWatchlist() {
    if (!authed) return;
    setMessage("");
    try {
      const result = await addToWatchlist(symbol);
      setMessage(result.already_exists ? `${symbol} is already in your watchlist.` : `${symbol} added to your watchlist.`);
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : "Unable to update watchlist");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 pt-16">
        <section className="stock-hero">
          <div className="mx-auto max-w-6xl">
            <div className="h-8 w-32 animate-pulse rounded bg-slate-800" />
            <div className="mt-5 h-12 w-56 animate-pulse rounded bg-slate-800" />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pt-16">
      <section className="stock-hero">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-5xl font-black tracking-tight">{symbol}</h1>
              <p className="mt-2 text-lg text-slate-400">{ticker?.company_name || ticker?.exchange || "NSE stock research"}</p>
              <div className="mt-7 flex flex-wrap items-end gap-4">
                <span className="stock-price">{formatCurrency(ticker?.price)}</span>
                <span className={`pb-1 text-lg font-black ${changeClass(ticker?.change_pct)}`}>
                  {ticker?.change != null && ticker.change >= 0 ? "+" : ""}
                  {formatCurrency(ticker?.change)} ({ticker?.change_pct != null && ticker.change_pct >= 0 ? "+" : ""}
                  {ticker?.change_pct?.toFixed(2) ?? "0.00"}%)
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-400">
                Volume: {formatCompact(ticker?.volume)} ({ticker?.volume_vs_avg || "trend unavailable"}) · {ticker?.sentiment_line}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {authed ? (
                <button onClick={handleAddToWatchlist} className="btn-primary">
                  Add to Watchlist
                </button>
              ) : (
                <Link href="/login" className="btn-primary">
                  Sign in to Watchlist
                </Link>
              )}
              <Link href={`/research?q=${encodeURIComponent(`Why is ${symbol} moving?`)}`} className="btn-secondary">
                Ask IndiaCircle about {symbol}
              </Link>
            </div>
          </div>
          {message ? <p className="mt-5 text-sm font-semibold text-indigo-200">{message}</p> : null}
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {error ? <div className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["52-Week High", formatCurrency(ticker?.high_52w)],
            ["52-Week Low", formatCurrency(ticker?.low_52w)],
            ["Market Cap", ticker?.market_cap || "N/A"],
            ["Sector", ticker?.sector || "N/A"],
          ].map(([label, value]) => (
            <article key={label} className="stat-card">
              <p className="text-sm font-bold text-gray-500">{label}</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
            </article>
          ))}
        </div>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black text-slate-950">Why Is It Moving?</h2>
            {why?.confidence ? <span className="badge badge-indigo">{why.confidence} confidence</span> : null}
          </div>
          {authed ? (
            whyLoading ? (
              <div className="mt-5 space-y-3">
                <div className="h-4 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
              </div>
            ) : (
              <p className="mt-4 text-sm leading-7 text-gray-600">{why?.explanation || "No specific catalyst identified from the latest sampled data."}</p>
            )
          ) : (
            <div className="mt-4 rounded-2xl bg-indigo-50 p-5">
              <p className="text-sm font-semibold text-indigo-900">Sign in for personalized analysis and AI movement context.</p>
              <Link href="/login" className="btn-primary mt-4">
                Sign in
              </Link>
            </div>
          )}
        </section>

        {authed ? <HistorySummary trades={history} /> : null}

        {earnings.length > 0 ? (
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Upcoming Events</h2>
            <div className="mt-4 space-y-3">
              {earnings.map((event) => (
                <a key={`${event.title}-${event.date}`} href={event.link} target="_blank" rel="noreferrer" className="block rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-700 hover:bg-indigo-50">
                  Upcoming: {event.title} · {event.date || "date unavailable"}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-950">Related Stocks</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {related.map((item) => (
              <Link key={item} href={`/stocks/${item}`} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-indigo-600 hover:text-white">
                {item}
              </Link>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

export default function StockPage() {
  return <StockPageContent />;
}
