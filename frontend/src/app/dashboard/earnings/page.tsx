"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { getEarningsCalendar, type EarningsEvent } from "@/lib/market";

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
        <Link key={href} href={href} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${href === "/dashboard/earnings" ? "bg-indigo-600 text-white" : "bg-white text-slate-700 hover:bg-indigo-50"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function EventCard({ event, highlighted }: { event: EarningsEvent; highlighted?: boolean }) {
  return (
    <article className={`rounded-2xl border bg-white p-5 shadow-sm ${highlighted ? "border-indigo-300 ring-2 ring-indigo-50" : "border-gray-100"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="badge badge-indigo">{event.symbol || "NSE"}</span>
          <h3 className="mt-3 font-black text-slate-950">{event.title}</h3>
          <p className="mt-2 text-sm text-gray-500">{event.date || "Date unavailable"}</p>
        </div>
        {event.link ? (
          <a href={event.link} target="_blank" rel="noreferrer" className="text-sm font-bold text-indigo-600">
            Article →
          </a>
        ) : null}
      </div>
    </article>
  );
}

function EarningsContent() {
  const [events, setEvents] = useState<EarningsEvent[]>([]);
  const [onlyRelevant, setOnlyRelevant] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await getEarningsCalendar();
        if (active) setEvents(response.upcoming || []);
      } catch (nextError) {
        if (active) setError(nextError instanceof Error ? nextError.message : "Unable to load earnings");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const relevant = useMemo(() => events.filter((event) => event.relevant_to_user), [events]);
  const remaining = useMemo(() => events.filter((event) => !event.relevant_to_user), [events]);
  const visibleRemaining = onlyRelevant ? [] : remaining;

  return (
    <main className="min-h-screen bg-gray-50 px-4 pb-16 pt-28 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <DashboardNav />
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950">Earnings Calendar</h1>
            <p className="mt-2 text-gray-600">Upcoming results for stocks you trade</p>
          </div>
          <button onClick={() => setOnlyRelevant((value) => !value)} className={onlyRelevant ? "btn-primary" : "btn-secondary"}>
            Your stocks
          </button>
        </div>

        {loading ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : null}

        {error ? <div className="mt-6 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}

        {!loading && relevant.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-xl font-black text-slate-950">Your Stocks</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {relevant.map((event) => (
                <EventCard key={`${event.title}-${event.date}`} event={event} highlighted />
              ))}
            </div>
          </section>
        ) : null}

        {!loading && visibleRemaining.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-xl font-black text-slate-950">All Upcoming</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {visibleRemaining.map((event) => (
                <EventCard key={`${event.title}-${event.date}`} event={event} />
              ))}
            </div>
          </section>
        ) : null}

        {!loading && events.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-black text-slate-950">No upcoming earnings found</h2>
            <p className="mt-2 text-sm text-gray-500">Check back after the next market data refresh.</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default function EarningsPage() {
  return (
    <AuthGuard>
      <EarningsContent />
    </AuthGuard>
  );
}
