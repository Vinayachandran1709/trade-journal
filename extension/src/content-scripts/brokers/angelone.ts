import { captureTradesFromVisibleTables } from "./shared";
import type { BrokerAdapter } from "./types";

export const AngelOneAdapter: BrokerAdapter = {
  broker: "angelone",
  matches(hostname) {
    return (
      hostname.includes("angelone.in") ||
      hostname.includes("angelbroking.com")
    );
  },
  capture(documentRef) {
    return captureTradesFromVisibleTables(documentRef, {
      symbol: ["Symbol", "Scrip", "Stock", "Instrument", "Name", "Trading Symbol"],
      tradeType: ["Type", "Side", "Buy/Sell", "B/S", "Action", "Transaction Type"],
      quantity: ["Qty", "Quantity", "Lot", "Shares", "Filled Qty"],
      price: ["Price", "Avg Price", "Average Price", "Rate"],
      date: ["Date", "Trade Date", "Order Date", "Time"],
      time: ["Time", "Trade Time", "Order Time"],
      instrumentType: ["Instrument Type", "Segment", "Product", "Instrument"],
    }).map((trade) => ({
      ...trade,
      stock_symbol: trade.stock_symbol.replace(/\.NS|\.BO|-EQ|-BE/gi, "").trim().toUpperCase(),
    }));
  },
};
