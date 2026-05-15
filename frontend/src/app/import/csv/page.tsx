"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import FileUpload from "@/components/ui/FileUpload";
import { importUniversalCSV, processTrades } from "@/lib/trades";
import type { TradeImportResponse } from "@/types/trade";

function UniversalCsvImportContent() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<TradeImportResponse | null>(null);

  async function handleSubmit() {
    if (!file) return;

    setLoading(true);
    setError("");
    setStatus("");
    setResult(null);

    try {
      const response = await importUniversalCSV(file);
      setResult(response);

      if ((response.imported_count ?? 0) > 0) {
        setStatus("Processing your trades...");
        try {
          await processTrades();
        } catch {
          // Never block the dashboard redirect if processing needs a retry.
        }
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  const importedSuccessfully =
    result?.mode === "imported" && typeof result.imported_count === "number";
  const needsManualReview = result?.mode === "manual_mapping_required";

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

      <h1 className="text-3xl font-bold text-gray-900">Import from Any Supported CSV</h1>
      <p className="mt-2 text-gray-500">
        Upload a broker export and we&apos;ll detect the format automatically.
      </p>

      <Card className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700">Supported in this release</h2>
        <p className="mt-2 text-sm text-gray-600">
          Zerodha, Groww, Angel One, Upstox, Dhan, 5Paisa, ICICI Direct,
          HDFC Sec, Kotak Sec, and Motilal Oswal.
        </p>
      </Card>

      {importedSuccessfully && result && (
        <div className="mt-6 rounded-lg bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800">
            Imported {result.imported_count} trade
            {result.imported_count === 1 ? "" : "s"}
            {result.detected_broker ? ` from ${result.detected_broker}` : ""}.
          </p>
          <p className="mt-1 text-xs text-green-700">
            {result.duplicate_count} duplicate
            {result.duplicate_count === 1 ? "" : "s"} skipped.
          </p>
          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={() => router.push("/dashboard/trades")}
          >
            View Trades
          </Button>
        </div>
      )}

      {needsManualReview && result && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Manual review required
          </p>
          <p className="mt-1 text-sm text-amber-800">
            {result.message || "We could not confidently map this CSV yet."}
          </p>
          {result.preview_headers.length ? (
            <div className="mt-3 text-xs text-amber-900">
              <p className="font-semibold">Detected headers</p>
              <p className="mt-1 break-words">{result.preview_headers.join(", ")}</p>
            </div>
          ) : null}
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {status && (
        <div className="mt-6 rounded-lg bg-indigo-50 p-4 text-sm text-indigo-700">
          {status}
        </div>
      )}

      <div className="mt-6">
        <FileUpload
          accept=".csv"
          onChange={(nextFile) => {
            setFile(nextFile);
            setError("");
            setStatus("");
            setResult(null);
          }}
          maxSize={10 * 1024 * 1024}
        />
      </div>

      <Button
        className="mt-4 w-full"
        loading={loading}
        disabled={!file || loading}
        onClick={handleSubmit}
      >
        {loading ? "Uploading..." : "Detect and Import"}
      </Button>
    </div>
  );
}

export default function UniversalCsvImportPage() {
  return (
    <AuthGuard>
      <UniversalCsvImportContent />
    </AuthGuard>
  );
}
