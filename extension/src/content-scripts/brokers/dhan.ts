import { captureTradesFromVisibleTables } from "./shared";
import type { BrokerAdapter, CapturedTradeDraft } from "./types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function captureCards(documentRef: Document): CapturedTradeDraft[] {
  const cards = Array.from(
    documentRef.querySelectorAll("[class*='order'], [class*='trade'], [class*='position']")
  );
  const seen = new Set<string>();
  const trades: CapturedTradeDraft[] = [];

  for (const card of cards) {
    const text = card.textContent ?? "";
    const match = text.match(/(BUY|SELL)\s+([A-Z]{2,20})\s+(\d+)\s*[@×x]\s*([\d,.]+)/i);
    if (!match) {
      continue;
    }

    const draft: CapturedTradeDraft = {
      stock_symbol: match[2].toUpperCase(),
      trade_type: match[1].toUpperCase() as "BUY" | "SELL",
      quantity: Number(match[3]),
      price: Number(match[4].replace(/,/g, "")),
      trade_date: today(),
      entry_method: "dom",
    };
    const signature = JSON.stringify(draft);
    if (!seen.has(signature) && draft.quantity > 0 && draft.price > 0) {
      seen.add(signature);
      trades.push(draft);
    }
  }

  return trades;
}

export const DhanAdapter: BrokerAdapter = {
  broker: "dhan",
  matches(hostname) {
    return hostname.includes("dhan.co");
  },
  capture(documentRef) {
    const tableTrades = captureTradesFromVisibleTables(documentRef, {
      symbol: ["Symbol", "Scrip", "Stock", "Instrument", "Trading Symbol"],
      tradeType: ["Type", "Side", "Buy/Sell", "Action", "Transaction Type"],
      quantity: ["Qty", "Quantity", "Lot", "Filled Qty"],
      price: ["Price", "Avg Price", "Average Price", "Rate"],
      date: ["Date", "Trade Date", "Order Date", "Time"],
      time: ["Time", "Trade Time", "Order Time"],
      instrumentType: ["Instrument Type", "Segment", "Product", "Instrument"],
    }).map((trade) => ({
      ...trade,
      stock_symbol: trade.stock_symbol.replace(/\.NS|\.BO/gi, "").trim().toUpperCase(),
    }));

    return tableTrades.length ? tableTrades : captureCards(documentRef);
  },
};
