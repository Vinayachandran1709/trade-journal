"use client";

import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";

function ImportContent() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Import Your Trades</h1>
        <p className="mt-2 text-gray-500">
          Upload your broker CSV once and let IndiaCircle detect the format for you.
        </p>
      </div>

      <button
        type="button"
        onClick={() => router.push("/import/csv")}
        className="glass-card feature-card group block w-full text-left"
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>

            <h2 className="mt-4 text-2xl font-semibold text-gray-900">
              Universal CSV Import
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Supports Zerodha, Groww, Angel One, Upstox, Dhan, 5Paisa, ICICI
              Direct, HDFC Securities, Kotak, and Motilal Oswal CSV formats
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              Download your trade history CSV from your broker&apos;s Reports section,
              then upload it here. We&apos;ll auto-detect the format.
            </p>
          </div>

          <div className="w-full max-w-sm rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/70 p-5 transition group-hover:border-indigo-300 group-hover:bg-indigo-50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 16V4m0 0l-4 4m4-4l4 4m4 8v1a2 2 0 01-2 2H6a2 2 0 01-2-2v-1"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Drag, drop, or browse CSV
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Opens the uploader at `/import/csv`
                </p>
              </div>
            </div>

            <div className="mt-5 inline-flex items-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition group-hover:bg-indigo-700">
              Continue to Upload
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

export default function ImportPage() {
  return (
    <AuthGuard>
      <ImportContent />
    </AuthGuard>
  );
}
