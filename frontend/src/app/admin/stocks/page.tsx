"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "../../../lib/api";

type StockSyncResponse = {
  skipped?: boolean;
  message?: string;
  nse_records_seen: number;
  bse_records_seen: number;
  merged_records: number;
  inserted: number;
  updated: number;
  total_stocks: number;
  total_unique_isins: number;
  total_aliases: number;
  last_sync_time: string | null;
  source_failures: string[];
  fallback_seeded?: number;
};

type StockDebugResponse = {
  nse_records_seen: number;
  bse_records_seen: number;
  total_unique_isins: number;
  total_stocks: number;
  total_aliases: number;
  last_sync_time: string | null;
  dictionary_version: string;
  samples: Record<
    string,
    {
      isin: string | null;
      company_name: string;
      display_name: string;
      nse_symbol: string | null;
      bse_code: string | null;
      exchanges: string[];
      alias_count: number;
    }
  >;
  source_failures: string[];
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        tone === "accent"
          ? "border-indigo-200 bg-indigo-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

export default function StockAdminPage() {
  const [debugData, setDebugData] = useState<StockDebugResponse | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<StockSyncResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [forceSyncing, setForceSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSync(force = false) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), force ? 60_000 : 15_000);

    try {
      return await apiFetch<StockSyncResponse>(`/stocks/sync${force ? "?force=true" : ""}`, {
        method: "POST",
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function loadDebugData() {
    setLoading(true);
    setError(null);

    try {
      const payload = await apiFetch<StockDebugResponse>("/stocks/debug");
      setDebugData(payload);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to load stock debug data."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDebugData();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setError(null);

    try {
      const payload = await runSync(false);
      setLastSyncResult(payload);
      const nextDebugData = await apiFetch<StockDebugResponse>("/stocks/debug");
      setDebugData(nextDebugData);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.name === "AbortError"
            ? "Sync took too long. Use Force Full Sync if you want to wait for a fresh remote import."
            : nextError.message
          : "Unable to sync stocks right now."
      );
    } finally {
      setSyncing(false);
    }
  }

  async function handleForceSync() {
    setForceSyncing(true);
    setError(null);

    try {
      const payload = await runSync(true);
      setLastSyncResult(payload);
      const nextDebugData = await apiFetch<StockDebugResponse>("/stocks/debug");
      setDebugData(nextDebugData);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.name === "AbortError"
            ? "Force sync is still taking too long. Check backend logs for live NSE/BSE fetch progress."
            : nextError.message
          : "Unable to force sync stocks right now."
      );
    } finally {
      setForceSyncing(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
                IndiaCircle Admin
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Stock Master Sync</h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-600">
                Trigger stock sync, inspect dictionary coverage, and verify whether the
                extension has enough data to highlight Indian stocks on web pages.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:items-end">
              <button
                className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                disabled={syncing || forceSyncing}
                onClick={() => void handleSync()}
              >
                {syncing ? "Syncing..." : "Sync Stocks"}
              </button>
              <button
                className="rounded-xl border border-indigo-300 bg-white px-5 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:border-indigo-200 disabled:text-indigo-300"
                disabled={syncing || forceSyncing}
                onClick={() => void handleForceSync()}
              >
                {forceSyncing ? "Force syncing..." : "Force Full Sync"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total Stocks"
              tone="accent"
              value={loading ? "..." : debugData?.total_stocks ?? 0}
            />
            <StatCard
              label="Unique ISINs"
              value={loading ? "..." : debugData?.total_unique_isins ?? 0}
            />
            <StatCard
              label="Dictionary Version"
              value={loading ? "..." : debugData?.dictionary_version ?? "--"}
            />
            <StatCard
              label="Last Sync"
              value={loading ? "..." : formatDateTime(debugData?.last_sync_time ?? null)}
            />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-lg font-semibold text-slate-900">Coverage Snapshot</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <StatCard label="NSE Symbols" value={debugData?.nse_records_seen ?? 0} />
                <StatCard label="BSE Codes" value={debugData?.bse_records_seen ?? 0} />
                <StatCard label="Aliases" value={debugData?.total_aliases ?? 0} />
              </div>

              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Sample Stocks
              </h3>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Symbol</th>
                      <th className="px-4 py-3 font-medium">Company</th>
                      <th className="px-4 py-3 font-medium">BSE</th>
                      <th className="px-4 py-3 font-medium">Aliases</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {Object.entries(debugData?.samples ?? {}).map(([symbol, sample]) => (
                      <tr key={symbol}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{symbol}</td>
                        <td className="px-4 py-3 text-slate-700">{sample.display_name}</td>
                        <td className="px-4 py-3 text-slate-700">{sample.bse_code ?? "--"}</td>
                        <td className="px-4 py-3 text-slate-700">{sample.alias_count}</td>
                      </tr>
                    ))}
                    {!Object.keys(debugData?.samples ?? {}).length ? (
                      <tr>
                        <td className="px-4 py-6 text-slate-500" colSpan={4}>
                          No sample stocks available yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-lg font-semibold text-slate-900">Latest Sync Result</h2>
              {lastSyncResult ? (
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <div className="flex items-center justify-between">
                    <span>NSE records seen</span>
                    <strong>{lastSyncResult.nse_records_seen}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <strong>{lastSyncResult.skipped ? "Skipped" : "Completed"}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>BSE records seen</span>
                    <strong>{lastSyncResult.bse_records_seen}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Merged records</span>
                    <strong>{lastSyncResult.merged_records}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Inserted</span>
                    <strong>{lastSyncResult.inserted}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Updated</span>
                    <strong>{lastSyncResult.updated}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Fallback seeded</span>
                    <strong>{lastSyncResult.fallback_seeded ?? 0}</strong>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                    <span>Total stocks after sync</span>
                    <strong>{lastSyncResult.total_stocks}</strong>
                  </div>
                  <div className="rounded-xl bg-white p-3">
                    {lastSyncResult.message ? (
                      <div className="mb-3 text-sm text-slate-700">{lastSyncResult.message}</div>
                    ) : null}
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Source Failures
                    </div>
                    <div className="mt-2 text-sm text-slate-700">
                      {lastSyncResult.source_failures.length
                        ? lastSyncResult.source_failures.join(" | ")
                        : "None"}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Run a sync to see the latest import result here.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
