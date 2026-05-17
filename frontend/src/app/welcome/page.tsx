"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { isAuthenticated } from "@/lib/auth";
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

  useEffect(() => {
    setLoggedIn(isAuthenticated());
  }, []);

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40 px-4 pb-20 pt-28 sm:px-6 lg:px-8">
      <div className="section-container max-w-4xl">
        <div className="text-center">
          <span className="badge badge-indigo">Setup</span>
          <h1 className="mt-5 text-5xl font-black tracking-tight text-slate-950">
            Your AI trading copilot is ready
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-gray-600">
            Open IndiaCircle beside your broker to auto-capture trades, review your journal,
            and use AI insights.
          </p>
        </div>

        <StatusBanner result={result} />

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            [
              "1",
              loggedIn ? "Connect your session" : "Log in to connect",
              loggedIn
                ? "Use the button below to pass your website session into the extension and open IndiaCircle faster."
                : "Sign in first so IndiaCircle can connect your extension to your private workspace.",
            ],
            [
              "2",
              "Open Journal Side Panel",
              "IndiaCircle opens beside your broker so your journal, AI research, and insights stay in view while you trade.",
            ],
            [
              "3",
              "Visit your broker",
              "Trade normally on Zerodha, Groww, Dhan, Angel One, Upstox, or 5Paisa while auto-capture keeps your journal updated.",
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
              <h2 className="text-3xl font-black">Open IndiaCircle where you trade</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                The side panel is the main product surface. Click Open Journal Side Panel to
                connect your session and launch IndiaCircle beside the page you are trading on.
              </p>
              <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-300/10 p-4">
                <p className="text-sm font-bold text-amber-200">
                  Recommended: pin both the IndiaCircle extension and the side panel
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-50/85">
                  This gives you one-click access next time and makes the panel easier to reopen
                  instantly during trading sessions.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-4 sm:flex-row">
                {loggedIn ? (
                  <button
                    onClick={() => void handleOpenSidePanel()}
                    disabled={opening}
                    className="btn-primary"
                  >
                    {opening ? "Opening..." : "Open Journal Side Panel"}
                  </button>
                ) : (
                  <>
                    <Link href={loginHref} className="btn-primary">
                      Log in to connect your extension
                    </Link>
                    <Link href="/signup" className="btn-secondary border-white/20 bg-white/5 text-white hover:bg-white/10">
                      Create free account
                    </Link>
                  </>
                )}

                <Link
                  href="/dashboard"
                  className="btn-secondary border-white/20 bg-white text-slate-950 hover:bg-slate-100"
                >
                  Go to Dashboard
                </Link>
              </div>

              {shouldShowInstallButton ? (
                <div className="mt-4">
                  <a
                    href={WEBSTORE_FALLBACK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary border-white/20 bg-white/5 text-white hover:bg-white/10"
                  >
                    Install Chrome Extension
                  </a>
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="space-y-3 rounded-xl bg-slate-900 p-4 text-sm text-slate-200">
                <div className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3">
                  <span>Website</span>
                  <span className="text-emerald-300">Logged in</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3">
                  <span>Extension</span>
                  <span className="text-indigo-300">Journal Side Panel</span>
                </div>
                <div className="rounded-xl bg-slate-800 px-4 py-3 text-slate-300">
                  Auto-capture, journal, market context, and AI research stay beside your broker.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 rounded-3xl border border-gray-100 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-black text-slate-950">What happens next</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm font-bold text-slate-950">Returning traders</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Once pinned, IndiaCircle becomes a one-click launch from Chrome while you trade.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm font-bold text-slate-950">If Chrome blocks the first launch</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Click the IndiaCircle icon near your address bar once, then pin the extension and
                the side panel so reopening feels instant next time.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
