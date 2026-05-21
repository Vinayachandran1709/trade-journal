import { API_URL, apiFetch } from "@/lib/api";
import type {
  Trade,
  TradeImportResponse,
  TradesSummary,
  CompletedTrade,
  TradeSetup,
} from "@/types/trade";

interface PaginatedTradesResponse {
  trades: Trade[];
  total: number;
  hidden_trade_count: number;
  is_limited: boolean;
}

interface PaginatedCompletedTradesResponse {
  trades: CompletedTrade[];
  total: number;
  hidden_trade_count: number;
  is_limited: boolean;
}

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
  emotion?: "missing";
  review?: "losers-missing-emotion";
}): Promise<Trade[]> {
  const params = new URLSearchParams();
  if (filters?.symbol) params.set("symbol", filters.symbol);
  if (filters?.start_date) params.set("start_date", filters.start_date);
  if (filters?.end_date) params.set("end_date", filters.end_date);
  if (filters?.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters?.offset !== undefined)
    params.set("offset", String(filters.offset));
  if (filters?.emotion) params.set("emotion", filters.emotion);
  if (filters?.review) params.set("review", filters.review);

  const query = params.toString();
  const response = await apiFetch<PaginatedTradesResponse>(
    `/trades/${query ? `?${query}` : ""}`
  );
  return response.trades;
}

export async function updateTradeAnnotations(
  tradeId: number,
  payload: { emotion_tag: string | null; note: string | null }
): Promise<Trade> {
  return apiFetch<Trade>(`/trades/${tradeId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
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
  const response = await apiFetch<PaginatedCompletedTradesResponse>(
    `/trades/completed${query ? `?${query}` : ""}`
  );
  return response.trades;
}

export async function getTradeSetups(
  limit?: number,
  offset?: number
): Promise<TradeSetup[]> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  if (offset !== undefined) params.set("offset", String(offset));

  const query = params.toString();
  return apiFetch<TradeSetup[]>(`/setups/my-setups${query ? `?${query}` : ""}`);
}

export async function exportCompletedTradesCSV(): Promise<void> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_URL}/trades/completed?limit=10000&offset=0`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `Error ${response.status}`);
  }

  const trades = (await response.json()) as CompletedTrade[];
  const headers = [
    "Symbol",
    "Entry Date",
    "Exit Date",
    "Entry Price",
    "Exit Price",
    "Quantity",
    "P&L",
    "Return %",
    "Holding Days",
  ];
  const rows = trades.map((trade) => [
    trade.stock_symbol,
    trade.entry_date,
    trade.exit_date,
    trade.entry_price,
    trade.exit_price,
    trade.quantity,
    trade.pnl,
    trade.return_pct,
    trade.holding_days,
  ]);

  const escapeCell = (value: string | number | null | undefined) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const csv = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `indiacircle-journal-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
