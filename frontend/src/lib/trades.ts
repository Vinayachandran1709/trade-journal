import { apiFetch } from "@/lib/api";
import type {
  Trade,
  TradeImportResponse,
  TradesSummary,
  CompletedTrade,
} from "@/types/trade";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export async function importZerodhaEmail(
  emailContent: string
): Promise<TradeImportResponse> {
  return apiFetch<TradeImportResponse>("/trades/import/zerodha-email", {
    method: "POST",
    body: JSON.stringify({ email_content: emailContent }),
  });
}

export async function importGrowwCSV(
  file: File
): Promise<TradeImportResponse> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}/trades/import/groww-csv`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `Error ${res.status}`);
  }

  return res.json();
}

export async function importUniversalCSV(
  file: File
): Promise<TradeImportResponse> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}/trades/import/universal-csv`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `Error ${res.status}`);
  }

  return res.json();
}

export async function getTrades(filters?: {
  symbol?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}): Promise<Trade[]> {
  const params = new URLSearchParams();
  if (filters?.symbol) params.set("symbol", filters.symbol);
  if (filters?.start_date) params.set("start_date", filters.start_date);
  if (filters?.end_date) params.set("end_date", filters.end_date);
  if (filters?.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters?.offset !== undefined)
    params.set("offset", String(filters.offset));

  const query = params.toString();
  return apiFetch<Trade[]>(`/trades${query ? `?${query}` : ""}`);
}

export async function getTradesSummary(): Promise<TradesSummary> {
  return apiFetch<TradesSummary>("/trades/summary");
}

export async function processTrades(): Promise<{
  processed: number;
  completed_trades: number;
  message: string;
}> {
  return apiFetch<{
    processed: number;
    completed_trades: number;
    message: string;
  }>("/trades/process", { method: "POST" });
}

export async function getCompletedTrades(
  limit?: number,
  offset?: number
): Promise<CompletedTrade[]> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  if (offset !== undefined) params.set("offset", String(offset));

  const query = params.toString();
  return apiFetch<CompletedTrade[]>(
    `/trades/completed${query ? `?${query}` : ""}`
  );
}
