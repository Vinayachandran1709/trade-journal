import { captureTradesFromVisibleTables } from "./shared";
import type { BrokerAdapter } from "./types";

export const growwAdapter: BrokerAdapter = {
  broker: "groww",
  matches(hostname) {
    return hostname === "web.groww.in";
  },
  capture(documentRef) {
    return captureTradesFromVisibleTables(documentRef, {
      symbol: ["Stock Symbol", "Symbol", "Stock", "Instrument"],
      tradeType: ["Transaction Type", "Trade Type", "Type", "Action"],
      quantity: ["Quantity", "Qty", "Net Qty"],
      price: ["Price", "Average Price", "Avg Price", "Rate"],
      date: ["Trade Date", "Date", "Order Date"],
      time: ["Trade Time", "Time", "Order Time"],
      instrumentType: ["Instrument Type", "Segment", "Instrument", "Product"],
    });
  },
};
