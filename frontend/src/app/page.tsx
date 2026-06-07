"use client";

import { FormEvent, useMemo, useState } from "react";

import {
  BROKER_OPTIONS,
  type BrokerOption,
  submitWaitlist,
} from "@/lib/waitlist";

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
    <main className="relative min-h-screen overflow-hidden bg-[#f6e7e7] text-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.78),transparent_28%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.55),transparent_26%)]" />
      <div className="pointer-events-none absolute left-[10%] top-[18%] h-28 w-28 rounded-full bg-white/45 blur-3xl float-soft" />
      <div className="pointer-events-none absolute right-[12%] top-[24%] h-24 w-24 rounded-full bg-[#f5c9a5]/45 blur-3xl float-soft-delayed" />
      <div className="pointer-events-none absolute inset-x-[12%] bottom-36 h-48 rounded-full border border-slate-400/30 opacity-60 drift-soft" />
      <div className="pointer-events-none absolute inset-x-[23%] bottom-28 h-36 rounded-full border border-slate-400/20 opacity-70 drift-soft-delayed" />
      <div className="pointer-events-none absolute inset-x-[32%] bottom-24 h-28 rounded-full border border-slate-400/20 opacity-60 drift-soft" />

      <div className="relative flex min-h-screen flex-col">
        <div className="fade-in flex items-start justify-between px-6 pb-6 pt-6 sm:px-8 lg:px-12">
          <div>
            <div className="text-xl font-black tracking-tight">IndiaCircle</div>
          </div>
        </div>

        <div className="relative z-10 flex flex-1 items-center px-4 pb-28 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl rounded-[2rem] bg-[#f8ecec]/72 px-5 py-8 shadow-[0_18px_70px_rgba(15,23,42,0.06)] backdrop-blur-[2px] sm:px-8 sm:py-10 lg:px-12 lg:py-12">
            <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
              <h1 className="fade-in fade-in-delay-1 max-w-[1100px] text-[2.8rem] font-black leading-[0.95] tracking-[-0.05em] sm:text-[4rem] lg:text-[4.9rem]">
                <span className="block md:whitespace-nowrap">Stop repeating the trade that</span>
                <span className="mt-2 block md:whitespace-nowrap">already cost you money.</span>
              </h1>

              <p className="fade-in fade-in-delay-2 mt-6 max-w-3xl text-base font-medium leading-7 text-slate-700 sm:text-lg">
                Most traders lose to the same 2-3 setups. Every month.
                <br className="hidden sm:block" />
                <span className="sm:ml-1">
                  IndiaCircle shows you exactly which ones — before you take that trade again.
                </span>
              </p>

              <div id="waitlist" className="fade-in fade-in-delay-3 mt-8 w-full max-w-5xl">
                {successBroker ? (
                  <div className="mx-auto max-w-2xl rounded-[1.75rem] border-[2px] border-slate-950 bg-white px-6 py-8 shadow-[0_14px_40px_rgba(15,23,42,0.08)]">
                    <h2 className="text-2xl font-black">You’re on the IndiaCircle waitlist.</h2>
                    <p className="mt-3 text-sm font-medium leading-7 text-slate-700 sm:text-base">
                      We’ll invite traders broker by broker.
                    </p>
                    <p className="mt-2 text-sm font-bold text-slate-950 sm:text-base">{successCopy}</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="mx-auto max-w-5xl">
                    {error ? (
                      <div className="mx-auto mb-4 max-w-2xl rounded-2xl border-2 border-rose-900 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                        {error}
                      </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-[1.05fr_1.2fr_0.9fr_auto]">
                      <label className="sr-only" htmlFor="waitlist-name">
                        Name
                      </label>
                      <input
                        id="waitlist-name"
                        value={form.name}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="Name"
                        className="h-14 rounded-2xl border-2 border-slate-950 bg-white px-4 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-500 focus:bg-slate-50"
                        required
                      />

                      <label className="sr-only" htmlFor="waitlist-email">
                        Email
                      </label>
                      <input
                        id="waitlist-email"
                        type="email"
                        value={form.email}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, email: event.target.value }))
                        }
                        placeholder="Email"
                        className="h-14 rounded-2xl border-2 border-slate-950 bg-white px-4 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-500 focus:bg-slate-50"
                        required
                      />

                      <label className="sr-only" htmlFor="waitlist-broker">
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
                        className="h-14 rounded-2xl border-2 border-slate-950 bg-white px-4 text-sm font-medium text-slate-950 outline-none transition focus:bg-slate-50"
                      >
                        {BROKER_OPTIONS.map((broker) => (
                          <option key={broker} value={broker}>
                            {broker}
                          </option>
                        ))}
                      </select>

                      <button
                        type="submit"
                        disabled={loading}
                        className="h-14 rounded-2xl border-2 border-slate-950 bg-slate-950 px-6 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loading ? "Joining..." : "Join Waitlist"}
                      </button>
                    </div>
                  </form>
                )}

                <p className="mt-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 sm:text-[0.78rem]">
                  Read-only access. We never touch your trades.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 sm:h-52">
          <div className="absolute inset-x-0 bottom-0 h-24 bg-[#d77731]" />
          <div className="absolute inset-x-0 bottom-20 h-7 bg-[#efbe45]" />
          <div className="absolute inset-x-0 bottom-[6.2rem] h-px bg-slate-950/70" />
          <div className="absolute bottom-0 left-1/2 h-44 w-px -translate-x-1/2 bg-slate-950/65" />
          <div className="absolute bottom-0 left-[18%] h-44 w-px origin-bottom rotate-[70deg] bg-slate-950/70" />
          <div className="absolute bottom-0 left-[30%] h-44 w-px origin-bottom rotate-[38deg] bg-slate-950/70" />
          <div className="absolute bottom-0 right-[18%] h-44 w-px origin-bottom -rotate-[70deg] bg-slate-950/70" />
          <div className="absolute bottom-0 right-[30%] h-44 w-px origin-bottom -rotate-[38deg] bg-slate-950/70" />
        </div>
      </div>
    </main>
  );
}
