"use client";

import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

function ImportContent() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Import Your Trades</h1>
        <p className="mt-2 text-gray-500">
          Start with universal CSV, or keep using the existing broker-specific imports.
        </p>
      </div>

      <div className="grid gap-6">
        <Card className="flex flex-col">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-50">
              <svg
                className="h-6 w-6 text-sky-600"
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
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Universal CSV Import
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Auto-detect supported broker CSV formats and import with the same
                dedupe flow used by the journal.
              </p>
            </div>
          </div>

          <Button
            className="mt-6 w-full"
            onClick={() => router.push("/import/csv")}
          >
            Upload Any Supported CSV
          </Button>
        </Card>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* Zerodha Card */}
          <Card className="flex flex-col">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-50">
                <svg
                  className="h-6 w-6 text-orange-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Import from Zerodha
              </h2>
            </div>

            <p className="mt-4 flex-1 text-sm text-gray-500">
              Paste your Zerodha contract note email content to import your
              trades automatically.
            </p>

            <Button
              className="mt-6 w-full"
              onClick={() => router.push("/import/zerodha")}
            >
              Import via Email
            </Button>
          </Card>

          {/* Groww Card */}
          <Card className="flex flex-col">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-50">
                <svg
                  className="h-6 w-6 text-green-600"
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
              <h2 className="text-lg font-semibold text-gray-900">
                Legacy Groww CSV
              </h2>
            </div>

            <p className="mt-4 flex-1 text-sm text-gray-500">
              Keep using the existing Groww-only CSV upload if you want the old
              flow unchanged.
            </p>

            <Button
              className="mt-6 w-full"
              onClick={() => router.push("/import/groww")}
            >
              Use Groww CSV
            </Button>
          </Card>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-5">
        <h3 className="text-sm font-semibold text-gray-700">
          Universal CSV is the primary path in this release
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          The legacy Zerodha email and Groww CSV routes are still available and
          remain backward compatible.
        </p>
      </div>
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
