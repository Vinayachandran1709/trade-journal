import { apiFetch } from "@/lib/api";

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

export function getAnalyticsSummary(): Promise<AnalyticsSummaryResponse> {
  return apiFetch<AnalyticsSummaryResponse>("/analytics/summary");
}

export function getPatterns(): Promise<PatternsEnvelope> {
  return apiFetch<PatternsEnvelope>("/analytics/patterns");
}
