import { captureTradesFromVisibleTables } from "./shared";
import type { BrokerAdapter } from "./types";

export const zerodhaAdapter: BrokerAdapter = {
  broker: "zerodha",
  matches(hostname) {
    return hostname === "kite.zerodha.com";
  },
  capture(documentRef) {
    return captureTradesFromVisibleTables(documentRef, {
      symbol: ["Trading Symbol", "Tradingsymbol", "Symbol", "Instrument"],
      tradeType: ["Trade Type", "Type", "Transaction Type", "Action"],
      quantity: ["Quantity", "Qty", "Filled Quantity"],
      price: ["Price", "Average Price", "Avg Price", "Execution Price"],
      date: ["Trade Date", "Date", "Order Date", "Order Execution Time"],
      time: ["Trade Time", "Time", "Execution Time", "Order Execution Time"],
      instrumentType: ["Instrument Type", "Segment", "Instrument", "Product"],
    });
  },
};
