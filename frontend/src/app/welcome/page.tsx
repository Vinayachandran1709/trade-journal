"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { isAuthenticated } from "@/lib/auth";
import { getBrokerConnections, type BrokerConnection } from "@/lib/brokers";
import { demoActivationMeta } from "@/lib/demo-trader-data";
import {
  handoffWebsiteSessionToExtension,
  type ExtensionHandoffResult,
} from "@/lib/extension-handoff";

const WEBSTORE_FALLBACK_URL =
  process.env.NEXT_PUBLIC_CHROME_WEBSTORE_URL || "https://chrome.google.com/webstore";

function StatusBanner({
  result,
}: {
  result: ExtensionHandoffResult | null;
}) {
  if (!result) {
    return null;
  }

  const isSuccess = result.status === "success";
  return (
    <div
      className={`mt-8 rounded-2xl border p-4 text-sm font-medium ${
        isSuccess
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {result.message}
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeContent />
    </Suspense>
  );
}

function WelcomeContent() {
  const searchParams = useSearchParams();
  const source = searchParams.get("source") || "install";
  const [result, setResult] = useState<ExtensionHandoffResult | null>(null);
  const [opening, setOpening] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [brokerConnections, setBrokerConnections] = useState<BrokerConnection[]>([]);

  useEffect(() => {
    setLoggedIn(isAuthenticated());
  }, []);

  useEffect(() => {
    let active = true;
    if (!loggedIn) return;

    async function loadConnections() {
      try {
        const connections = await getBrokerConnections();
        if (active) {
          setBrokerConnections(connections);
        }
      } catch {
        if (active) {
          setBrokerConnections([]);
        }
      }
    }

    void loadConnections();
    return () => {
      active = false;
    };
  }, [loggedIn]);

  const loginHref = useMemo(() => {
    return `/login?redirect=${encodeURIComponent(`/welcome?source=${source}`)}`;
  }, [source]);

  async function handleOpenSidePanel() {
    setOpening(true);
    const nextResult = await handoffWebsiteSessionToExtension();
    setResult(nextResult);
    setOpening(false);
  }

  const shouldShowInstallButton =
    !loggedIn ||
    result?.status === "extension_missing" ||
    result?.status === "missing_extension_id" ||
    result?.status === "unsupported_browser";
  const hasDhanConnection = brokerConnections.some(
    (connection) => connection.broker_name === "dhan" && connection.is_active
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40 px-4 pb-20 pt-28 sm:px-6 lg:px-8">
      <div className="section-container max-w-4xl">
        <div className="text-center">
          <span className="badge badge-indigo">Setup</span>
          <h1 className="mt-5 text-5xl font-black tracking-tight text-slate-950">
            Your discipline layer is ready
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-gray-600">
            Stop repeating the trades that already cost you money. Explore the demo profile first, then connect Dhan to replace sample insights with your real trading behavior.
          </p>
        </div>

        <StatusBanner result={result} />

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "1",
              "Explore demo insights",
              "See the sample personality snapshot, graveyard setup, and session replay so the product feels useful from day one.",
            ],
            [
              "2",
              hasDhanConnection ? "Dhan connected" : "Connect Dhan",
              hasDhanConnection
                ? "Your broker connection is already active. The next sync will start replacing sample cards with your own profile."
                : "Connect Dhan to turn demo insights into your own broker-linked trading memory.",
            ],
            [
              "3",
              "Sync trades",
              "Your first synced trades unlock early signals. Around 30 completed trades gives IndiaCircle a much more reliable profile.",
            ],
            [
              "4",
              "Unlock your real personality snapshot",
              `Your strongest edge today is shown as a sample: ${demoActivationMeta.strongestEdge}. That becomes your real profile after sync and review.`,
            ],
          ].map(([num, title, desc]) => (
            <div key={num} className="relative rounded-3xl border border-gray-100 bg-white p-7 shadow-sm">
              <span className="gradient-text text-6xl font-black">{num}</span>
              <h2 className="mt-8 text-xl font-black text-slate-950">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-gray-600">{desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-3xl bg-slate-950 p-8 text-white shadow-xl">
          <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr] md:items-center">
            <div>
              <h2 id="connect-dhan" className="text-3xl font-black">Start with the demo, then connect your real trade memory</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                IndiaCircle now starts by showing what your discipline layer will look like. Dhan is the first real unlock step. The extension can still stay beside your broker, but it is secondary to getting your real history synced.
              </p>
              <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-300/10 p-4">
                <p className="text-sm font-bold text-amber-200">
                  Current sample profile
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-50/85">
                  {demoActivationMeta.traderType}: strongest edge in {demoActivationMeta.bestTimeWindow}, biggest leak in {demoActivationMeta.worstTimeWindow}.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-4 sm:flex-row">
                {loggedIn ? (
                  <>
                    <Link href="/dashboard" className="btn-primary">
                      Explore demo insights
                    </Link>
                    <Link
                      href={hasDhanConnection ? "/dashboard#demo-discipline-layer" : "/welcome#connect-dhan"}
                      className="btn-secondary border-white/20 bg-white text-slate-950 hover:bg-slate-100"
                    >
                      {hasDhanConnection ? "View Dhan progress" : "Connect Dhan"}
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href={loginHref} className="btn-primary">
                      Log in to explore demo
                    </Link>
                    <Link href="/signup" className="btn-secondary border-white/20 bg-white/5 text-white hover:bg-white/10">
                      Create free account
                    </Link>
                  </>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                {loggedIn ? (
                  <button
                    onClick={() => void handleOpenSidePanel()}
                    disabled={opening}
                    className="btn-secondary border-white/20 bg-white/5 text-white hover:bg-white/10"
                  >
                    {opening ? "Opening..." : "Open extension side panel"}
                  </button>
                ) : null}

                {shouldShowInstallButton ? (
                  <a
                    href={WEBSTORE_FALLBACK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary border-white/20 bg-white/5 text-white hover:bg-white/10"
                  >
                    Install Chrome Extension
                  </a>
                ) : null}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="space-y-3 rounded-xl bg-slate-900 p-4 text-sm text-slate-200">
                <div className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3">
                  <span>Website</span>
                  <span className="text-emerald-300">{loggedIn ? "Logged in" : "Log in to start"}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3">
                  <span>Dhan</span>
                  <span className="text-indigo-300">{hasDhanConnection ? "Connected" : "Connect to unlock real profile"}</span>
                </div>
                <div className="rounded-xl bg-slate-800 px-4 py-3 text-slate-300">
                  Demo mode shows sample discipline insights first. Dhan sync replaces them with your own trade behavior.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 rounded-3xl border border-gray-100 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-black text-slate-950">What happens next</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm font-bold text-slate-950">Early signals appear around 10 trades</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                That is when repeat behaviors start to become visible, even if the profile is not fully reliable yet.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm font-bold text-slate-950">Reliable profile needs more history</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Around 30 completed trades gives IndiaCircle a much stronger read on your real edge, discipline, and expensive repeat setups.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
