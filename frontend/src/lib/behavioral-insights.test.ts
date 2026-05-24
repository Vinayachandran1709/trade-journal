import { describe, expect, it } from "vitest";

import type { AnalyticsSummaryResponse, PatternResponse } from "./analytics";
import type { CompletedTrade, Trade } from "@/types/trade";
import {
  getAvoidableLossEstimate,
  getTopMistakeToWatch,
  getTradingIdentitySummary,
  getPatternProgressionStatus,
} from "./behavioral-insights";

function makePattern(overrides: Partial<PatternResponse>): PatternResponse {
  return {
    pattern_type: "time_of_day",
    title: "Time pattern",
    description: "Example pattern",
    severity: "medium",
    data: {},
    locked: false,
    ...overrides,
  };
}

function makeTrade(id: number, overrides: Partial<Trade> = {}): Trade {
  return {
    id,
    user_id: 1,
    stock_symbol: "SBIN",
    trade_type: "BUY",
    quantity: 10,
    price: 100,
    trade_date: `2026-05-${String(id).padStart(2, "0")}T09:30:00`,
    broker: "zerodha",
    import_source: "csv",
    emotion_tag: "neutral",
    notes: "reviewed",
    screenshot_url: null,
    entry_method: "manual",
    trade_time: "14:15:00",
    instrument_type: "equity",
    created_at: `2026-05-${String(id).padStart(2, "0")}T09:30:00`,
    ...overrides,
  };
}

function makeCompletedTrade(id: number, pnl: number, overrides: Partial<CompletedTrade> = {}): CompletedTrade {
  return {
    id,
    user_id: 1,
    stock_symbol: "SBIN",
    entry_date: `2026-05-${String(id).padStart(2, "0")}T09:15:00`,
    exit_date: `2026-05-${String(id).padStart(2, "0")}T14:45:00`,
    entry_price: 100,
    exit_price: 101,
    quantity: 10,
    pnl,
    return_pct: pnl / 1000,
    holding_days: 0,
    created_at: `2026-05-${String(id).padStart(2, "0")}T14:45:00`,
    ...overrides,
  };
}

const summary: AnalyticsSummaryResponse = {
  total_trades: 24,
  win_rate: 0.52,
  total_pnl: 12000,
  avg_pnl_per_trade: 500,
  best_trade: { symbol: "SBIN", pnl: 3000, exit_date: "2026-05-12" },
  worst_trade: { symbol: "INFY", pnl: -1800, exit_date: "2026-05-18" },
  avg_holding_days: 2,
  most_traded_symbol: "SBIN",
  monthly_pnl: [{ month: "2026-05", pnl: 12000 }],
};

describe("behavioral insights helpers", () => {
  it("returns unavailable instead of misleading zero avoidable loss when review data is thin", () => {
    const result = getAvoidableLossEstimate({
      categories: [],
      trades: [
        makeTrade(1, { emotion_tag: null, notes: "" }),
        makeTrade(2, { emotion_tag: "fearful", notes: "" }),
      ],
      completedTrades: [makeCompletedTrade(1, -900), makeCompletedTrade(2, -400)],
      summary,
    });

    expect(result.state).toBe("unavailable");
    expect(result.detail.toLowerCase()).toContain("more completed trades");
  });

  it("prioritizes weak time buckets for the top mistake to watch", () => {
    const result = getTopMistakeToWatch({
      patterns: [
        makePattern({
          pattern_type: "time_of_day",
          severity: "high",
          data: { worst_bucket: "2 PM - 3 PM" },
        }),
      ],
      categories: [],
      trades: [makeTrade(1)],
    });

    expect(result).toContain("2 PM - 3 PM");
    expect(result.toLowerCase()).toContain("avoid");
  });

  it("builds a trading identity summary from strongest edge and biggest leak", () => {
    const result = getTradingIdentitySummary({
      summary,
      patterns: [
        makePattern({
          pattern_type: "holding_period",
          severity: "low",
          data: {
            best_bucket: "Swing",
            worst_bucket: "Intraday",
            best_avg_pnl: 1800,
            worst_avg_pnl: -250,
            sample_size: 28,
          },
        }),
        makePattern({
          pattern_type: "day_of_week",
          severity: "high",
          data: {
            best_bucket: "Thursday",
            worst_bucket: "Wednesday",
            best_win_rate: 0.68,
            worst_win_rate: 0.31,
            sample_size: 26,
          },
        }),
      ],
      completedTrades: [
        makeCompletedTrade(1, 1200, { stock_symbol: "SBIN", holding_days: 3 }),
        makeCompletedTrade(2, 1500, { stock_symbol: "HDFCBANK", holding_days: 2 }),
        makeCompletedTrade(3, -300, { stock_symbol: "INFY", holding_days: 0 }),
      ],
    });

    expect(result.summary.toLowerCase()).toContain("strongest edge");
    expect(result.biggestWeakness).toBeTruthy();
    expect(result.bestCondition).toBeTruthy();
  });

  it("marks pattern progression as improving when recent matched trades outperform prior matched trades", () => {
    const progression = getPatternProgressionStatus(
      makePattern({
        pattern_type: "holding_period",
        data: { worst_bucket: "Swing" },
      }),
      [
        makeCompletedTrade(1, -1000, { holding_days: 3 }),
        makeCompletedTrade(2, -900, { holding_days: 4 }),
        makeCompletedTrade(3, -800, { holding_days: 5 }),
        makeCompletedTrade(4, -700, { holding_days: 2 }),
        makeCompletedTrade(5, -600, { holding_days: 3 }),
        makeCompletedTrade(6, 1200, { holding_days: 4 }),
        makeCompletedTrade(7, 1400, { holding_days: 3 }),
        makeCompletedTrade(8, 1600, { holding_days: 5 }),
        makeCompletedTrade(9, 1800, { holding_days: 4 }),
        makeCompletedTrade(10, 2000, { holding_days: 2 }),
        makeCompletedTrade(11, 150, { holding_days: 0 }),
        makeCompletedTrade(12, 100, { holding_days: 0 }),
      ]
    );

    expect(progression).toBe("Improving");
  });
});
