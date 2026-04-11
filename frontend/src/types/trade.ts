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
  created_at: string;
}

export interface TradeImportResponse {
  imported: number;
  trades: Trade[];
}

export interface TradesSummary {
  total_trades: number;
  total_invested: number;
  unique_symbols: number;
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
  return_pct: number;
  holding_days: number;
  created_at: string;
}
