import type { CapturedTrade } from "./captures";
import type { LoginRequest, TokenResponse, User } from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000")
  .replace(/\/$/, "");

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function loginWithPassword(
  payload: LoginRequest
): Promise<TokenResponse> {
  return request<TokenResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchCurrentUser(token: string): Promise<User> {
  return request<User>("/api/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export interface AutoCapturePayload {
  broker: "zerodha" | "groww";
  capture_method: "dom";
  trades: Array<{
    stock_symbol: string;
    trade_type: "BUY" | "SELL";
    quantity: number;
    price: number;
    trade_date: string;
    trade_time?: string | null;
    instrument_type?: string | null;
    entry_method?: string | null;
  }>;
}

export interface AutoCaptureResponse {
  imported: number;
  imported_count: number;
  duplicate_count: number;
  trades: CapturedTrade[];
  imported_trade_ids: number[];
  detected_broker?: string | null;
}

export async function postAutoCapture(
  token: string,
  payload: AutoCapturePayload
): Promise<AutoCaptureResponse> {
  return request<AutoCaptureResponse>("/api/trades/auto-capture", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function updateTradeCaptureDetails(
  token: string,
  tradeId: number,
  payload: { emotion_tag: string | null; note: string | null }
): Promise<CapturedTrade> {
  return request<CapturedTrade>(`/api/trades/${tradeId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}
