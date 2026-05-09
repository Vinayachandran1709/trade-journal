"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { addToWatchlist, getWatchlist, removeFromWatchlist, setWatchlistAlerts, type WatchlistItem } from "@/lib/watchlist";

function DashboardNav() {
  const links = [
    ["Dashboard", "/dashboard"],
    ["Trades", "/dashboard/trades"],
    ["Patterns", "/dashboard/analytics"],
    ["Mistakes", "/dashboard/analytics#patterns"],
    ["Earnings", "/dashboard/earnings"],
    ["Watchlist", "/dashboard/watchlist"],
  ];
  return (
    <nav className="flex gap-2 overflow-x-auto pb-2">
      {links.map(([label, href]) => (
        <Link key={href} href={href} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${href === "/dashboard/watchlist" ? "bg-indigo-600 text-white" : "bg-white text-slate-700 hover:bg-indigo-50"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return "N/A";
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function changeClass(value: number | null | undefined) {
  if ((value ?? 0) >= 0) return "text-emerald-600";
  return "text-rose-600";
}

function WatchlistContent() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [alertDrafts, setAlertDrafts] = useState<Record<number, { above: string; below: string }>>({});

  async function load() {
    setError("");
    const response = await getWatchlist();
    setItems(response.items);
    setAlertDrafts(
      Object.fromEntries(
        response.items.map((item) => [
          item.id,
          {
            above: item.alerts.alert_price_above || "",
            below: item.alerts.alert_price_below || "",
          },
        ])
      )
    );
  }

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const response = await getWatchlist();
        if (!active) return;
        setItems(response.items);
        setAlertDrafts(
          Object.fromEntries(
            response.items.map((item) => [
              item.id,
              {
                above: item.alerts.alert_price_above || "",
                below: item.alerts.alert_price_below || "",
              },
            ])
          )
        );
      } catch (nextError) {
        if (active) setError(nextError instanceof Error ? nextError.message : "Unable to load watchlist");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, []);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSymbol = symbol.trim().toUpperCase();
    if (!nextSymbol || saving) return;
    setSaving(true);
    try {
      await addToWatchlist(nextSymbol);
      setSymbol("");
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to add stock");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(itemId: number) {
    await removeFromWatchlist(itemId);
    setItems((current) => current.filter((item) => item.id !== itemId));
  }

  async function handleSetAlert(item: WatchlistItem) {
    const draft = alertDrafts[item.id] || { above: "", below: "" };
    await setWatchlistAlerts(item.id, {
      alert_price_above: draft.above || null,
      alert_price_below: draft.below || null,
    });
    await load();
  }

  const popular = ["TCS", "RELIANCE", "HDFCBANK", "INFY", "SBIN"];

  return (
    <main className="min-h-screen bg-gray-50 px-4 pb-16 pt-28 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <DashboardNav />
        <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950">Your Watchlist</h1>
            <p className="mt-2 text-gray-600">Track prices, alerts, and your trading context.</p>
          </div>
          <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              placeholder="Add stock, e.g. TCS"
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500"
            />
            <button disabled={saving || !symbol.trim()} className="btn-primary">
              Add Stock
            </button>
          </form>
        </div>

        {error ? <div className="mt-6 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}

        {loading ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-44 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Add your first stock to start tracking</h2>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {popular.map((item) => (
                <button key={item} onClick={() => setSymbol(item)} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-indigo-600 hover:text-white">
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!loading && items.length > 0 ? (
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {items.map((item) => {
              const alertHit = item.alerts.above_triggered || item.alerts.below_triggered;
              const draft = alertDrafts[item.id] || { above: "", below: "" };
              return (
                <article key={item.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-black text-slate-950">{item.symbol}</h2>
                      <p className="mt-2 text-3xl font-black text-slate-900">{formatCurrency(item.quote.price)}</p>
                      <p className={`mt-1 text-sm font-bold ${changeClass(item.quote.change_pct)}`}>
                        {item.quote.change_pct != null && item.quote.change_pct >= 0 ? "+" : ""}
                        {item.quote.change_pct?.toFixed(2) ?? "0.00"}%
                      </p>
                    </div>
                    <span className={`badge ${alertHit ? "badge-rose" : "badge-indigo"}`}>
                      {alertHit ? "Alert triggered" : "Watching"}
                    </span>
                  </div>

                  {item.trading_history ? (
                    <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                      You&apos;ve traded {item.symbol} {item.trading_history.total_trades} times · Win rate:{" "}
                      {Math.round(item.trading_history.win_rate * 100)}%
                    </p>
                  ) : null}

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <input
                      value={draft.above}
                      onChange={(event) => setAlertDrafts((current) => ({ ...current, [item.id]: { ...draft, above: event.target.value } }))}
                      placeholder="Alert above"
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                    <input
                      value={draft.below}
                      onChange={(event) => setAlertDrafts((current) => ({ ...current, [item.id]: { ...draft, below: event.target.value } }))}
                      placeholder="Alert below"
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => void handleSetAlert(item)} className="btn-secondary">
                      Set Alert
                    </button>
                    <button onClick={() => void handleRemove(item.id)} className="btn-secondary text-rose-600">
                      Remove
                    </button>
                    <Link href={`/stocks/${item.symbol}`} className="btn-primary">
                      View Research
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default function WatchlistPage() {
  return (
    <AuthGuard>
      <WatchlistContent />
    </AuthGuard>
  );
}
