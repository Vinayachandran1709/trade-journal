export interface Trade {
  id: number;
  user_id: number;
  stock_symbol: string;
  trade_type: string;
  quantity: number;
  price: number;
  trade_date: string;
  broker: string | null;
  import_source: string | null;
  emotion_tag?: string | null;
  notes?: string | null;
  screenshot_url?: string | null;
  entry_method?: string | null;
  trade_time?: string | null;
  instrument_type?: string | null;
  created_at: string;
}

export interface TradeImportResponse {
  imported: number;
  imported_count: number;
  duplicate_count: number;
  trades: Trade[];
  imported_trade_ids?: number[];
  detected_broker?: string | null;
  mode?: "imported" | "manual_mapping_required";
  preview_headers: string[];
  preview_rows: Record<string, string>[];
  message?: string | null;
}

export interface TradesSummary {
  total_trades: number;
  total_invested: number;
  unique_symbols: number;
  net_pnl_today: number;
  max_loss_threshold: number;
}

export interface CompletedTrade {
  id: number;
  user_id: number;
  stock_symbol: string;
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl: number;
  total_charges: number;
  net_pnl: number;
  return_pct: number;
  holding_days: number;
  created_at: string;
}

export interface TradeSetup {
  id: number;
  user_id: number;
  symbol: string | null;
  thesis: string | null;
  entry_price: number | null;
  stop_loss_price: number | null;
  target_price: number | null;
  target2_price: number | null;
  conviction_score: number | null;
  checklist_responses: Record<string, unknown> | null;
  position_size: number | null;
  risk_amount: number | null;
  risk_score: number | null;
  risk_level: string | null;
  linked_trade_id: number | null;
  linked_at: string | null;
  created_at: string;
}
