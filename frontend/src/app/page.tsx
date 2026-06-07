"use client";

import { FormEvent, useMemo, useState } from "react";

import {
  BROKER_OPTIONS,
  type BrokerOption,
  submitWaitlist,
} from "@/lib/waitlist";

const ROADMAP_ITEMS = [
  "✅ Dhan Integration Built",
  "🔄 Private Beta",
  "⏳ Zerodha",
  "⏳ Groww",
  "⏳ Angel One",
];

const DEFAULT_FORM = {
  name: "",
  email: "",
  broker: "Dhan" as BrokerOption,
  early_access: true,
};

export default function HomePage() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successBroker, setSuccessBroker] = useState<BrokerOption | null>(null);

  const successCopy = useMemo(() => {
    if (!successBroker) return null;
    return successBroker === "Dhan"
      ? "You’ll be prioritized for the Dhan beta."
      : "We’ll notify you when your broker integration opens.";
  }, [successBroker]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await submitWaitlist({
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        source: "homepage",
      });
      setSuccessBroker(form.broker);
      setForm(DEFAULT_FORM);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to join the waitlist right now."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="overflow-hidden bg-[#f7f1e8]">
      <section className="relative overflow-hidden px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(180,83,9,0.14),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(20,83,45,0.14),transparent_34%)]" />
        <div className="section-container relative grid gap-10 lg:grid-cols-[1fr_0.95fr] lg:items-center">
          <div>
            <span className="inline-flex rounded-full border border-amber-200 bg-white/80 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-amber-800 shadow-sm">
              Waitlist now open
            </span>
            <h1 className="mt-6 max-w-4xl text-5xl font-black tracking-tight text-slate-950 sm:text-6xl">
              Stop repeating the trade that already cost you money.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-700 sm:text-lg">
              IndiaCircle turns broker history into a review layer that spots costly repeat
              behavior before it compounds. Join the waitlist to get early access as each broker
              integration opens.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                "Broker-linked trade review",
                "Pattern detection from your own history",
                "Analytics only, never execution",
              ].map((point) => (
                <div
                  key={point}
                  className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 text-sm font-semibold text-slate-700 shadow-sm"
                >
                  {point}
                </div>
              ))}
            </div>
            <div className="mt-8 rounded-3xl border border-emerald-100 bg-emerald-50/80 p-6 shadow-sm">
              <span className="badge badge-emerald">Why traders join</span>
              <p className="mt-4 text-sm leading-7 text-slate-700">
                Built for traders who already know the pain of one setup showing up again and
                again. IndiaCircle helps you review the pattern, not place the trade.
              </p>
            </div>
          </div>

          <div id="waitlist" className="glass-card p-8">
            {successBroker ? (
              <div className="rounded-2xl bg-emerald-50 p-6">
                <h2 className="text-xl font-black text-emerald-900">You’re on the IndiaCircle waitlist.</h2>
                <p className="mt-3 text-sm leading-7 text-emerald-800">
                  We’ll invite early users broker by broker as private beta access expands.
                </p>
                <p className="mt-2 text-sm font-semibold text-emerald-900">{successCopy}</p>
              </div>
            ) : (
              <>
                <div className="max-w-md">
                  <span className="badge badge-rose">Join waitlist</span>
                  <h2 className="mt-4 text-3xl font-black text-slate-950">Get invited broker by broker</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    Tell us which broker you use and we’ll prioritize invites as each integration
                    becomes production-ready.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                  {error ? (
                    <div className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">
                      {error}
                    </div>
                  ) : null}

                  <div>
                    <label htmlFor="waitlist-name" className="text-sm font-bold text-gray-700">
                      Name
                    </label>
                    <input
                      id="waitlist-name"
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="Your name"
                      className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="waitlist-email" className="text-sm font-bold text-gray-700">
                      Email
                    </label>
                    <input
                      id="waitlist-email"
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, email: event.target.value }))
                      }
                      placeholder="you@example.com"
                      className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="waitlist-broker" className="text-sm font-bold text-gray-700">
                      Broker
                    </label>
                    <select
                      id="waitlist-broker"
                      value={form.broker}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          broker: event.target.value as BrokerOption,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                    >
                      {BROKER_OPTIONS.map((broker) => (
                        <option key={broker} value={broker}>
                          {broker}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.early_access}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          early_access: event.target.checked,
                        }))
                      }
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      I want early access as soon as IndiaCircle opens for my broker.
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full disabled:opacity-60"
                  >
                    {loading ? "Joining waitlist..." : "Join Waitlist"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="section-container rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <span className="badge badge-rose">Example Graveyard Setup</span>
              <h2 className="mt-4 text-4xl font-black text-slate-950">
                The Trade That Keeps Costing You
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
                IndiaCircle automatically detects patterns like this from your broker history.
              </p>
            </div>
            <div className="rounded-[1.75rem] bg-slate-950 p-6 text-white shadow-xl">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">
                Example Graveyard Setup
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/5 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    Repeats
                  </div>
                  <div className="mt-2 text-2xl font-black">14 similar trades</div>
                </div>
                <div className="rounded-2xl bg-white/5 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    Win rate
                  </div>
                  <div className="mt-2 text-2xl font-black">7%</div>
                </div>
                <div className="rounded-2xl bg-white/5 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    Lost
                  </div>
                  <div className="mt-2 text-2xl font-black">₹22,040</div>
                </div>
              </div>
              <p className="mt-4 rounded-2xl bg-rose-400/10 px-4 py-4 text-sm leading-7 text-rose-50">
                One repeating trade can quietly drain months of progress. The goal is to spot it
                early, review it clearly, and stop paying the same tuition twice.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="section-container rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <span className="badge badge-indigo">Roadmap</span>
          <h2 className="mt-4 text-3xl font-black text-slate-950">What opens next</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {ROADMAP_ITEMS.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-5 text-sm font-semibold text-slate-800"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-6 pb-16 sm:px-6 lg:px-8">
        <div className="section-container rounded-[2rem] border border-emerald-100 bg-emerald-50/70 p-8 shadow-sm">
          <span className="badge badge-emerald">Founder note</span>
          <h2 className="mt-4 text-3xl font-black text-slate-950">Built for traders who keep repeating mistakes</h2>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <p className="text-sm leading-7 text-slate-700">
              IndiaCircle is being built for traders who want clearer review, fewer blind spots,
              and less repetition of the same expensive setup. It is analytics only, it never
              places orders, and it never gives buy or sell recommendations.
            </p>
            <div className="grid gap-3">
              {[
                "Built for traders who keep repeating mistakes",
                "Analytics only",
                "Never places orders",
                "Never gives buy/sell recommendations",
              ].map((point) => (
                <div
                  key={point}
                  className="rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-slate-800 shadow-sm"
                >
                  {point}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
