import { apiFetch } from "@/lib/api";

export interface WatchlistItem {
  id: number;
  symbol: string;
  added_at: string;
  notes: string | null;
  quote: {
    symbol: string;
    price: number | null;
    change: number | null;
    change_pct: number | null;
    market_status: string;
    last_updated: string;
    is_stale: boolean;
  };
  alerts: {
    above_triggered: boolean;
    below_triggered: boolean;
    alert_price_above: string | null;
    alert_price_below: string | null;
  };
  trading_history: {
    total_trades: number;
    win_rate: number;
    total_pnl: number;
    last_trade_date: string;
    last_pnl: number;
    avg_holding_days: number;
  } | null;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
  count: number;
}

export function getWatchlist(): Promise<WatchlistResponse> {
  return apiFetch<WatchlistResponse>("/watchlist/");
}

export function addToWatchlist(symbol: string): Promise<{ item_id: number; symbol: string; already_exists: boolean }> {
  return apiFetch<{ item_id: number; symbol: string; already_exists: boolean }>("/watchlist/add", {
    method: "POST",
    body: JSON.stringify({ symbol }),
  });
}

export function removeFromWatchlist(itemId: number): Promise<{ deleted: boolean; item_id: number }> {
  return apiFetch<{ deleted: boolean; item_id: number }>(`/watchlist/${itemId}`, {
    method: "DELETE",
  });
}

export function setWatchlistAlerts(
  itemId: number,
  alerts: { alert_price_above?: string | null; alert_price_below?: string | null }
): Promise<unknown> {
  return apiFetch<unknown>(`/watchlist/${itemId}/alerts`, {
    method: "PATCH",
    body: JSON.stringify(alerts),
  });
}
