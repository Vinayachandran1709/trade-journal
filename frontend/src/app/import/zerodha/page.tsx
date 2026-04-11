"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { importZerodhaEmail } from "@/lib/trades";
import type { TradeImportResponse } from "@/types/trade";

function ZerodhaImportContent() {
  const router = useRouter();
  const [emailContent, setEmailContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [importResult, setImportResult] = useState<TradeImportResponse | null>(
    null
  );

  async function handleSubmit() {
    if (!emailContent.trim()) return;

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const result = await importZerodhaEmail(emailContent);
      setImportResult(result);
      setSuccess(true);
      setTimeout(() => setEmailContent(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <button
        onClick={() => router.push("/import")}
        className="mb-6 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
        Back to Import
      </button>

      <h1 className="text-3xl font-bold text-gray-900">
        Import from Zerodha Email
      </h1>
      <p className="mt-2 text-gray-500">
        Paste your Zerodha contract note email to import trades
      </p>

      {/* Instructions */}
      <Card className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700">How to import</h2>
        <ol className="mt-3 space-y-2 text-sm text-gray-600">
          {[
            "Open your email inbox and find Zerodha contract note emails",
            'Look for emails with subject like "Contract note" from Zerodha',
            "Open the email and select all text (Ctrl+A or Cmd+A)",
            "Copy the entire email content and paste it below",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Card>

      {/* Success message */}
      {success && importResult && (
        <div className="mt-6 rounded-lg bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-800">
                Imported {importResult.imported} trade
                {importResult.imported !== 1 ? "s" : ""} successfully!
              </p>
              <p className="mt-0.5 text-xs text-green-700">
                Your trades have been added to your journal.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={() => router.push("/dashboard/trades")}
          >
            View Trades
          </Button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Email textarea */}
      <div className="mt-6">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Email Content
        </label>
        <textarea
          value={emailContent}
          onChange={(e) => setEmailContent(e.target.value)}
          rows={14}
          placeholder="Paste the full email content here..."
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <Button
        className="mt-4 w-full"
        loading={loading}
        disabled={!emailContent.trim() || loading}
        onClick={handleSubmit}
      >
        {loading ? "Importing..." : "Import Trades"}
      </Button>
    </div>
  );
}

export default function ZerodhaImportPage() {
  return (
    <AuthGuard>
      <ZerodhaImportContent />
    </AuthGuard>
  );
}
