import type { CapturedTrade } from "./captures";
import type { LoginRequest, TokenResponse, User } from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000")
  .replace(/\/$/, "");

export class APIError extends Error {
  status: number;
  code: string | null;
  payload: unknown;

  constructor(
    message: string,
    options: { status: number; code?: string | null; payload?: unknown }
  ) {
    super(message);
    this.name = "APIError";
    this.status = options.status;
    this.code = options.code ?? null;
    this.payload = options.payload;
  }
}

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
    const message =
      error.detail ||
      error.message ||
      error.error ||
      `Request failed with status ${response.status}`;
    throw new APIError(message, {
      status: response.status,
      code: error.error ?? null,
      payload: error,
    });
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
  broker: "zerodha" | "groww" | "dhan" | "angelone" | "upstox" | "5paisa";
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

export interface TradesSummary {
  total_trades: number;
  total_invested: number;
  unique_symbols: number;
}

export interface TradeListItem {
  id: number;
  stock_symbol: string;
  trade_type: string;
  quantity: number;
  price: number;
  trade_date: string;
  trade_time?: string | null;
  broker?: string | null;
  instrument_type?: string | null;
  emotion_tag?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface CompletedTradeListItem {
  id: number;
  user_id: number;
  stock_symbol: string;
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl: number;
  return_pct: number;
  holding_days: number;
  created_at?: string;
}

export async function fetchTradesSummary(token: string): Promise<TradesSummary> {
  return request<TradesSummary>("/api/trades/summary", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchTrades(
  token: string,
  filters?: {
    symbol?: string;
    limit?: number;
    offset?: number;
  }
): Promise<TradeListItem[]> {
  const params = new URLSearchParams();

  if (filters?.symbol) {
    params.set("symbol", filters.symbol);
  }

  if (filters?.limit !== undefined) {
    params.set("limit", String(filters.limit));
  }

  if (filters?.offset !== undefined) {
    params.set("offset", String(filters.offset));
  }

  const query = params.toString();

  return request<TradeListItem[]>(`/api/trades${query ? `?${query}` : ""}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchCompletedTrades(
  token: string,
  filters?: {
    limit?: number;
    offset?: number;
  }
): Promise<CompletedTradeListItem[]> {
  const params = new URLSearchParams();
  if (filters?.limit !== undefined) {
    params.set("limit", String(filters.limit));
  }
  if (filters?.offset !== undefined) {
    params.set("offset", String(filters.offset));
  }

  const query = params.toString();
  return request<CompletedTradeListItem[]>(
    `/api/trades/completed${query ? `?${query}` : ""}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
}

export interface RiskAlert {
  alert_type: string;
  severity: "high" | "medium" | "info";
  title: string;
  message: string;
  timestamp: string;
  locked?: boolean;
}

export interface TradeSetupItem {
  id: number;
  symbol: string | null;
  entry_price?: number | null;
  stop_loss_price?: number | null;
  target_price?: number | null;
  thesis?: string | null;
  conviction_score?: number | null;
  risk_score?: number | null;
  risk_level?: string | null;
  linked_trade_id?: number | null;
  linked_at?: string | null;
  created_at: string;
}

export async function fetchRiskAlerts(token: string): Promise<RiskAlert[]> {
  return request<RiskAlert[]>("/api/risk-alerts", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchSetups(
  token: string,
  filters?: { limit?: number; offset?: number }
): Promise<TradeSetupItem[]> {
  const params = new URLSearchParams();
  if (filters?.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters?.offset !== undefined) params.set("offset", String(filters.offset));
  const query = params.toString();
  return request<TradeSetupItem[]>(`/api/setups/my-setups${query ? `?${query}` : ""}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchSetupReportCard(
  token: string,
  setupId: number
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/setups/${setupId}/report-card`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

// ---------------------------------------------------------------------------
// Market data (public endpoints — no auth required)
// ---------------------------------------------------------------------------

export interface MarketDashboardData {
  indices: Record<string, { value: number | null; change: number | null; change_pct: number | null }>;
  vix: { value: number | null; change: number | null; context: string };
  fii_dii: { fii_net: number | null; dii_net: number | null; date: string | null; source?: string } | null;
  top_gainers: Array<{ symbol: string; price: number; change_pct: number }>;
  top_losers: Array<{ symbol: string; price: number; change_pct: number }>;
  global_cues: Record<string, { value: number | null; change_pct: number | null }>;
  sector_performance: Record<string, { index: string; value: number | null; change_pct: number | null }>;
  regime: {
    nifty_trend: "Bullish" | "Bearish" | "Sideways";
    nifty_vs_vwap: "Above VWAP" | "Below VWAP" | "At VWAP";
    breadth: { advancing: number; declining: number; pct_advancing: number };
    interpretation: string;
  };
  personalized?: {
    preferred_sectors: Array<{ index: string; value: number | null; change_pct: number | null }>;
    recent_symbols: string[];
    open_positions: Array<{ symbol: string; net_quantity: number; last_trade_date?: string | null }>;
  } | null;
  market_status: string;
  last_updated: string;
  is_stale: boolean;
  confidence?: {
    score: number;
    level: "HIGH" | "MODERATE" | "LOW" | string;
    reasons: string[];
  } | null;
}

export interface WatchlistResponse {
  recent_symbols: string[];
  preferred_sectors: string[];
  sector_performance: Record<string, { index: string; value: number | null; change_pct: number | null }>;
  recent_stock_quotes: Array<{
    symbol: string;
    price: number | null;
    change: number | null;
    change_pct: number | null;
    high_52w: number | null;
    low_52w: number | null;
    volume: number | null;
    market_status: string;
    last_updated: string;
    is_stale: boolean;
  }>;
}

export async function fetchMarketDashboard(token?: string | null): Promise<MarketDashboardData> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return request<MarketDashboardData>("/api/market/dashboard", {
    headers,
  });
}

export async function fetchWatchlist(token: string): Promise<WatchlistResponse> {
  return request<WatchlistResponse>("/api/market/watchlist", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export interface WhyMovingResponse {
  symbol: string;
  explanation: string;
  price: number | null;
  change_pct: number | null;
  company_name?: string | null;
  source_count: number;
  confidence: "high" | "medium" | "low";
  source_quality: "official_filing" | "trusted_news" | "social_chatter" | "fallback_web";
  sources: Array<{
    title: string;
    url: string;
    publisher: string;
    published_at?: string | null;
    source_type: string;
    recency_bucket?: string | null;
    trust_score: number;
    relevance_score: number;
    final_score: number;
  }>;
  model_used: string;
  queries_remaining: number;
  queries_limit: number;
  cached: boolean;
  disclaimer: string;
}

export interface TickerIntelResponse {
  symbol: string;
  company_name?: string | null;
  exchange?: string | null;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  high_52w: number | null;
  low_52w: number | null;
  volume: number | null;
  avg_volume?: number | null;
  market_cap?: string | null;
  next_event?: string | null;
  volume_vs_avg: string;
  sector: string | null;
  sentiment_line: string;
  disclaimer: string;
}

export async function fetchWhyMoving(
  token: string,
  symbol: string
): Promise<WhyMovingResponse> {
  return request<WhyMovingResponse>("/api/ai/why-moving", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ symbol: symbol.toUpperCase().trim() }),
  });
}

export async function fetchTickerIntel(
  symbol: string
): Promise<TickerIntelResponse> {
  return request<TickerIntelResponse>(
    `/api/market/ticker-intel/${encodeURIComponent(symbol)}`
  );
}

export interface EarningsEvent {
  title: string;
  date: string;
  link: string;
  symbol: string | null;
  event_type: string;
  relevant_to_user?: boolean;
  user_traded?: boolean;
}

export interface EarningsCalendarResponse {
  upcoming: EarningsEvent[];
  source: string;
  fetched_at: string;
}

export async function fetchMarketEarnings(): Promise<EarningsCalendarResponse> {
  return request<EarningsCalendarResponse>("/api/market/earnings");
}

export interface ResearchAskResponse {
  category:
    | "my_trades"
    | "stock_research"
    | "market_context"
    | "strategy_check"
    | "portfolio"
    | string;
  query: string;
  response: string;
  context_used?: string[];
  queries_remaining: number;
  queries_limit: number;
  cached?: boolean;
  model_used?: string;
}

export async function askResearch(
  token: string,
  query: string
): Promise<ResearchAskResponse> {
  return request<ResearchAskResponse>("/api/research/ask", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });
}

export interface PatternResponse {
  pattern_type: string;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  data: Record<string, unknown>;
  locked: boolean;
}

export interface PatternsEnvelope {
  patterns: PatternResponse[];
  total_completed_trades: number;
  threshold: number;
  unlocked: boolean;
}

export interface AnalyticsSummaryResponse {
  total_trades: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl_per_trade: number;
  best_trade: {
    symbol: string | null;
    pnl: number | null;
    exit_date: string | null;
  };
  worst_trade: {
    symbol: string | null;
    pnl: number | null;
    exit_date: string | null;
  };
  avg_holding_days: number;
  most_traded_symbol: string | null;
  monthly_pnl: Array<{
    month: string;
    pnl: number;
  }>;
}

export async function analyzePatterns(token: string): Promise<PatternsEnvelope> {
  return request<PatternsEnvelope>("/api/analytics/analyze-patterns", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function getPatterns(token: string): Promise<PatternsEnvelope> {
  return request<PatternsEnvelope>("/api/analytics/patterns", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function getAnalyticsSummary(
  token: string
): Promise<AnalyticsSummaryResponse> {
  return request<AnalyticsSummaryResponse>("/api/analytics/summary", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
