import { apiFetch } from "@/lib/api";

export interface TickerIntelligence {
  symbol: string;
  company_name: string | null;
  exchange: string | null;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  high_52w: number | null;
  low_52w: number | null;
  volume: number | null;
  avg_volume: number | null;
  volume_vs_avg: string;
  sector: string | null;
  market_cap: string | null;
  next_event: string | null;
  sentiment_line: string;
  disclaimer: string;
}

export interface WhyMovingResponse {
  symbol: string;
  explanation: string;
  price: number | null;
  change_pct: number | null;
  company_name: string | null;
  source_count: number;
  confidence: string;
  source_quality: string;
  sources: Array<{
    title: string;
    url: string;
    publisher: string;
    published_at: string | null;
  }>;
  model_used: string;
  queries_remaining: number;
  queries_limit: number;
  cached: boolean;
  disclaimer: string;
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

export function getTickerIntelligence(symbol: string): Promise<TickerIntelligence> {
  return apiFetch<TickerIntelligence>(`/market/ticker-intel/${encodeURIComponent(symbol)}`);
}

export function whyIsMoving(symbol: string): Promise<WhyMovingResponse> {
  return apiFetch<WhyMovingResponse>("/ai/why-moving", {
    method: "POST",
    body: JSON.stringify({ symbol }),
  });
}

export function getEarningsCalendar(): Promise<EarningsCalendarResponse> {
  return apiFetch<EarningsCalendarResponse>("/market/earnings");
}
