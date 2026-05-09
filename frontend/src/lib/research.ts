import { apiFetch } from "@/lib/api";

export interface ResearchResponse {
  category: "my_trades" | "stock_research" | "market_context" | "strategy_check";
  query: string;
  response: string;
  context_used: string[];
  queries_remaining: number;
  queries_limit: number;
  cached: boolean;
  model_used: string;
}

export interface SuggestionsResponse {
  my_trades: string[];
  stock_research: string[];
  market_context: string[];
  strategy_check: string[];
}

export interface DailyBriefResponse {
  brief: string;
  date: string;
  market_status: string;
  confidence_score: number | null;
  cached: boolean;
}

export function askResearch(query: string): Promise<ResearchResponse> {
  return apiFetch<ResearchResponse>("/research/ask", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

export function getResearchSuggestions(): Promise<SuggestionsResponse> {
  return apiFetch<SuggestionsResponse>("/research/suggestions");
}

export function getDailyBrief(): Promise<DailyBriefResponse> {
  return apiFetch<DailyBriefResponse>("/research/daily-brief");
}
