"use client";

import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import Button from "@/components/ui/Button";
import { importUniversalCSV } from "@/lib/trades";
import type { TradeImportResponse } from "@/types/trade";

const HISTORY_KEY = "indiacircle_csv_analysis_history";
const MAX_HISTORY_ITEMS = 12;
const MAX_CSV_BYTES = 10 * 1024 * 1024;

interface AnalysisHistoryItem {
  id: string;
  savedAt: string;
  fileName: string;
  fileSize: number;
  report: {
    mode: TradeImportResponse["mode"];
    importedCount: number;
    duplicateCount: number;
    detectedBroker: string | null;
    previewHeaders: string[];
    previewRows: Record<string, string>[];
    importedTrades: TradeImportResponse["trades"];
    parsedRows: Record<string, string>[];
    totalRows: number;
    message: string | null;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function parseCsvRows(csvText: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(current.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }

  const [headers = [], ...dataRows] = rows;
  return dataRows.map((dataRow) =>
    Object.fromEntries(
      headers.map((header, index) => [header || `Column ${index + 1}`, dataRow[index] ?? ""])
    )
  );
}

async function buildHistoryItem(
  file: File,
  result: TradeImportResponse
): Promise<AnalysisHistoryItem> {
  const parsedRows = parseCsvRows(await file.text());

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    savedAt: new Date().toISOString(),
    fileName: file.name,
    fileSize: file.size,
    report: {
      mode: result.mode,
      importedCount: result.imported_count ?? result.imported ?? 0,
      duplicateCount: result.duplicate_count ?? 0,
      detectedBroker: result.detected_broker ?? null,
      previewHeaders: result.preview_headers ?? [],
      previewRows: result.preview_rows ?? [],
      importedTrades: result.trades ?? [],
      parsedRows,
      totalRows: parsedRows.length,
      message: result.message ?? null,
    },
  };
}

function readHistory(): AnalysisHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(items: AnalysisHistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
}

function TradeTable({ rows }: { rows: Record<string, string>[] }) {
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => {
        if (key.trim()) set.add(key);
      });
      return set;
    }, new Set<string>())
  );

  if (!rows.length || !columns.length) {
    return null;
  }

  return (
    <div className="max-h-96 overflow-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
        <thead className="sticky top-0 bg-gray-100 text-gray-600">
          <tr>
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-3 py-2 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column} className="whitespace-nowrap px-3 py-2 text-gray-700">
                  {row[column] || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportContent() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TradeImportResponse | null>(null);
  const [pendingHistoryItem, setPendingHistoryItem] = useState<AnalysisHistoryItem | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [openedHistoryId, setOpenedHistoryId] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  const importedSuccessfully =
    result?.mode === "imported" && typeof result.imported_count === "number";
  const needsManualReview = result?.mode === "manual_mapping_required";

  const reportTitle = useMemo(() => {
    if (!result) return "";
    if (needsManualReview) return "Manual review required";
    return "Analysis complete";
  }, [needsManualReview, result]);

  function validateFile(file: File): string | null {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return "Only CSV files are accepted.";
    }
    if (file.size > MAX_CSV_BYTES) {
      return `File must be smaller than ${formatBytes(MAX_CSV_BYTES)}.`;
    }
    return null;
  }

  async function analyzeFile(file: File) {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSelectedFile(file);
    setLoading(true);
    setError("");
    setResult(null);
    setPendingHistoryItem(null);
    setSavedMessage("");
    setOpenedHistoryId(null);

    try {
      const response = await importUniversalCSV(file);
      setResult(response);
      setPendingHistoryItem(await buildHistoryItem(file, response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void analyzeFile(file);
  }

  function saveReportToHistory() {
    if (!pendingHistoryItem) return;
    const nextHistory = [pendingHistoryItem, ...history].slice(0, MAX_HISTORY_ITEMS);
    setHistory(nextHistory);
    writeHistory(nextHistory);
    setPendingHistoryItem(null);
    setSavedMessage("Report saved to Analysis History.");
  }

  function openHistory(item: AnalysisHistoryItem) {
    setOpenedHistoryId(openedHistoryId === item.id ? null : item.id);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-12 pt-28">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Import Your Trades</h1>
        <p className="mt-2 text-gray-500">
          Upload your broker CSV once and let IndiaCircle detect the format for you.
        </p>
      </div>

      <div
        className="glass-card feature-card block w-full text-left"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
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

          <div
            className={`w-full max-w-sm rounded-2xl border border-dashed p-5 transition ${
              dragging
                ? "border-indigo-400 bg-indigo-100/80"
                : "border-indigo-200 bg-indigo-50/70"
            }`}
          >
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
                  Upload here. No extra page.
                </p>
              </div>
            </div>

            {selectedFile ? (
              <div className="mt-4 rounded-xl bg-white/80 px-3 py-2 text-xs text-gray-600">
                <span className="font-semibold text-gray-900">{selectedFile.name}</span>
                <span className="ml-2">{formatBytes(selectedFile.size)}</span>
              </div>
            ) : null}

            <Button
              className="mt-5"
              loading={loading}
              disabled={loading}
              onClick={() => inputRef.current?.click()}
            >
              {loading ? "Analyzing..." : "Continue to Upload"}
            </Button>

            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void analyzeFile(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {result ? (
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p
                className={`text-sm font-semibold ${
                  needsManualReview ? "text-amber-900" : "text-green-800"
                }`}
              >
                {reportTitle}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {importedSuccessfully
                  ? `Imported ${result.imported_count} trade${
                      result.imported_count === 1 ? "" : "s"
                    }${result.detected_broker ? ` from ${result.detected_broker}` : ""}.`
                  : result.message || "We could not confidently map this CSV yet."}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {result.duplicate_count ?? 0} duplicate
                {(result.duplicate_count ?? 0) === 1 ? "" : "s"} skipped.
              </p>
            </div>

            {importedSuccessfully ? (
              <Button variant="outline" onClick={() => router.push("/dashboard/trades")}>
                View Trades
              </Button>
            ) : null}
          </div>

          {needsManualReview && result.preview_headers.length ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
              <p className="font-semibold">Detected headers</p>
              <p className="mt-1 break-words">{result.preview_headers.join(", ")}</p>
            </div>
          ) : null}

          {pendingHistoryItem ? (
            <div className="mt-5 flex flex-col gap-3 rounded-xl bg-indigo-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-indigo-950">
                Analysis complete. Save this report to history?
              </p>
              <Button onClick={saveReportToHistory}>Save report</Button>
            </div>
          ) : null}

          {savedMessage ? (
            <p className="mt-3 text-sm font-medium text-green-700">{savedMessage}</p>
          ) : null}
        </section>
      ) : null}

      {history.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Analysis History</h2>
          <p className="mt-1 text-sm text-gray-500">
            Saved reports only. CSV files are not stored.
          </p>
          <div className="mt-4 grid gap-3">
            {history.map((item) => {
              const open = openedHistoryId === item.id;
              return (
                <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 text-left"
                    onClick={() => openHistory(item)}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">
                        {item.fileName}
                      </span>
                      <span className="mt-1 block text-xs text-gray-500">
                        {formatDate(item.savedAt)} · {formatBytes(item.fileSize)}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-indigo-600">
                      {open ? "Hide report" : "View report"}
                    </span>
                  </button>

                  {open ? (
                    <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                      <p>
                        <strong>Detected broker:</strong>{" "}
                        {item.report.detectedBroker ?? "Needs review"}
                      </p>
                      <p className="mt-1">
                        <strong>Trades:</strong> {item.report.importedCount} imported ·{" "}
                        {item.report.duplicateCount} duplicates skipped
                      </p>
                      <p className="mt-1">
                        <strong>Rows analyzed:</strong> {item.report.totalRows ?? 0}
                      </p>
                      {item.report.message ? (
                        <p className="mt-1">
                          <strong>Note:</strong> {item.report.message}
                        </p>
                      ) : null}
                      {item.report.previewHeaders.length ? (
                        <p className="mt-1 break-words text-xs text-gray-500">
                          Headers: {item.report.previewHeaders.join(", ")}
                        </p>
                      ) : null}
                      {item.report.importedTrades?.length ? (
                        <div className="mt-4">
                          <p className="mb-2 font-semibold text-gray-900">Imported trades</p>
                          <TradeTable rows={item.report.importedTrades.map((trade) => ({
                            Symbol: trade.stock_symbol,
                            Type: trade.trade_type,
                            Quantity: String(trade.quantity),
                            Price: String(trade.price),
                            Date: trade.trade_date,
                            Time: trade.trade_time ?? "",
                            Broker: trade.broker ?? "",
                            Instrument: trade.instrument_type ?? "",
                          }))} />
                        </div>
                      ) : null}
                      {item.report.parsedRows?.length ? (
                        <div className="mt-4">
                          <p className="mb-2 font-semibold text-gray-900">
                            CSV rows analyzed
                          </p>
                          <TradeTable rows={item.report.parsedRows} />
                        </div>
                      ) : item.report.previewRows?.length ? (
                        <div className="mt-4">
                          <p className="mb-2 font-semibold text-gray-900">Preview rows</p>
                          <TradeTable rows={item.report.previewRows} />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
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
