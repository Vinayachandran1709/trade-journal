export interface CapturedTradeDraft {
  stock_symbol: string;
  trade_type: "BUY" | "SELL";
  quantity: number;
  price: number;
  trade_date: string;
  trade_time?: string | null;
  instrument_type?: string | null;
  entry_method?: string | null;
}

export interface BrokerAdapter {
  broker: "zerodha" | "groww";
  matches(hostname: string): boolean;
  capture(documentRef: Document): CapturedTradeDraft[];
}
