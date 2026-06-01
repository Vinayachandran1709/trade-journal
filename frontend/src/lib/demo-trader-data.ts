import type { AnalyticsSummaryResponse, PatternResponse, PatternsEnvelope } from "@/lib/analytics";
import type { CompletedTrade, Trade, TradeSetup } from "@/types/trade";

export type TradeReadinessState = "zero_data" | "early_data" | "learning" | "real_ready";

export type DemoActivationMeta = {
  label: string;
  traderType: string;
  biggestLeak: string;
  strongestEdge: string;
  bestTimeWindow: string;
  worstTimeWindow: string;
  graveyardSetup: {
    title: string;
    pattern: string;
    similarTrades: number;
    winRate: number;
    netLoss: number;
    message: string;
  };
  sessionReplay: {
    title: string;
    disciplineScore: number;
    pnlSavedMessage: string;
    trades: Array<{
      id: string;
      label: string;
      outcome: string;
      note: string;
      status: "planned" | "revenge" | "oversized";
      pnl: number;
    }>;
  };
  unlocks: Array<{
    label: string;
    description: string;
    tradeThreshold: number;
  }>;
};

export type TradeReadiness = {
  state: TradeReadinessState;
  rawTradeCount: number;
  completedTradeCount: number;
  totalTradeCount: number;
  progressToReliableProfile: number;
  needsDemo: boolean;
  isHybrid: boolean;
  reliableProfileThreshold: number;
};

export const RELIABLE_PROFILE_THRESHOLD = 30;
export const EARLY_SIGNALS_THRESHOLD = 10;

export const demoSummary: AnalyticsSummaryResponse = {
  total_trades: 14,
  win_rate: 0.07,
  total_pnl: -22040,
  avg_pnl_per_trade: -1574,
  best_trade: {
    symbol: "TCS",
    pnl: 1850,
    exit_date: "2026-05-12",
  },
  worst_trade: {
    symbol: "NIFTY24MAY23500CE",
    pnl: -6420,
    exit_date: "2026-05-23",
  },
  avg_holding_days: 0.6,
  most_traded_symbol: "NIFTY24MAY23500CE",
  monthly_pnl: [
    { month: "2026-04", pnl: -8640 },
    { month: "2026-05", pnl: -13400 },
  ],
};

export const demoPatterns: PatternsEnvelope = {
  unlocked: true,
  threshold: 20,
  total_completed_trades: 14,
  patterns: [
    {
      pattern_type: "losing_streak_tilt",
      title: "Increasing size after losses",
      description:
        "Sample insight: losses are followed by larger position sizes and materially worse outcomes in the same session.",
      severity: "high",
      locked: false,
      data: {
        sample_label: "Demo",
        overall_avg_pnl: -620,
        post_streak_avg_pnl: -2840,
        overall_win_rate: 0.29,
        post_streak_win_rate: 0.07,
        sample_size: 14,
      },
    },
    {
      pattern_type: "time_of_day",
      title: "Morning planned equity trades are your strongest edge",
      description:
        "Sample insight: your cleanest outcomes come from planned equity entries between 9:30 and 11:00 AM.",
      severity: "medium",
      locked: false,
      data: {
        sample_label: "Demo",
        best_bucket: "9:30-11:00 AM",
        best_win_rate: 0.64,
        worst_bucket: "After 2:00 PM",
        worst_win_rate: 0.07,
        overall_win_rate: 0.29,
        sample_size: 14,
      },
    },
    {
      pattern_type: "revenge_trading",
      title: "Late-day revenge trades are repeating your costliest mistake",
      description:
        "Sample insight: re-entering after a loss late in the day turns one bad decision into a cluster of expensive follow-up trades.",
      severity: "high",
      locked: false,
      data: {
        sample_label: "Demo",
        revenge_trade_count: 14,
        revenge_trade_pnl: -22040,
        revenge_trade_win_rate: 0.07,
        sample_size: 14,
      },
    },
  ],
};

export const demoCompletedTrades: CompletedTrade[] = [
  {
    id: 9001,
    user_id: 0,
    stock_symbol: "TCS",
    entry_date: "2026-05-12",
    exit_date: "2026-05-12",
    entry_price: 3698,
    exit_price: 3721,
    quantity: 50,
    pnl: 1150,
    gross_pnl: 1150,
    total_charges: 80,
    net_pnl: 1070,
    return_pct: 0.62,
    holding_days: 0,
    created_at: "2026-05-12T10:45:00Z",
  },
  {
    id: 9002,
    user_id: 0,
    stock_symbol: "NIFTY24MAY23500CE",
    entry_date: "2026-05-23",
    exit_date: "2026-05-23",
    entry_price: 182,
    exit_price: 129,
    quantity: 75,
    pnl: -3975,
    gross_pnl: -3975,
    total_charges: 210,
    net_pnl: -4185,
    return_pct: -29.12,
    holding_days: 0,
    created_at: "2026-05-23T14:18:00Z",
  },
  {
    id: 9003,
    user_id: 0,
    stock_symbol: "BANKNIFTY24MAY50500CE",
    entry_date: "2026-05-23",
    exit_date: "2026-05-23",
    entry_price: 246,
    exit_price: 168,
    quantity: 60,
    pnl: -4680,
    gross_pnl: -4680,
    total_charges: 235,
    net_pnl: -4915,
    return_pct: -31.71,
    holding_days: 0,
    created_at: "2026-05-23T14:44:00Z",
  },
];

export const demoRawTrades: Trade[] = [
  {
    id: 9101,
    user_id: 0,
    stock_symbol: "TCS",
    trade_type: "BUY",
    quantity: 50,
    price: 3698,
    trade_date: "2026-05-12",
    broker: "dhan",
    import_source: "demo_sample",
    emotion_tag: "calm",
    notes: "Planned morning equity trade with clear stop and target.",
    screenshot_url: null,
    entry_method: "broker_api",
    trade_time: "09:42:00",
    instrument_type: "EQ",
    created_at: "2026-05-12T09:42:00Z",
  },
  {
    id: 9102,
    user_id: 0,
    stock_symbol: "NIFTY24MAY23500CE",
    trade_type: "BUY",
    quantity: 75,
    price: 182,
    trade_date: "2026-05-23",
    broker: "dhan",
    import_source: "demo_sample",
    emotion_tag: "revenge",
    notes: "Sample demo trade: re-entry after a loss with weak confirmation after 2 PM.",
    screenshot_url: null,
    entry_method: "broker_api",
    trade_time: "14:18:00",
    instrument_type: "OPT",
    created_at: "2026-05-23T14:18:00Z",
  },
  {
    id: 9103,
    user_id: 0,
    stock_symbol: "BANKNIFTY24MAY50500CE",
    trade_type: "BUY",
    quantity: 60,
    price: 246,
    trade_date: "2026-05-23",
    broker: "dhan",
    import_source: "demo_sample",
    emotion_tag: "fomo",
    notes: "Sample demo trade: size increased after a prior loss and the plan was abandoned.",
    screenshot_url: null,
    entry_method: "broker_api",
    trade_time: "14:44:00",
    instrument_type: "OPT",
    created_at: "2026-05-23T14:44:00Z",
  },
];

export const demoSetups: TradeSetup[] = [
  {
    id: 9201,
    user_id: 0,
    symbol: "TCS",
    thesis: "Sample planned equity setup taken during the best time window.",
    entry_price: 3690,
    stop_loss_price: 3670,
    target_price: 3725,
    target2_price: 3745,
    conviction_score: 8,
    checklist_responses: {
      sample: true,
      plan_quality: "clear",
    },
    position_size: 50,
    risk_amount: 1000,
    risk_score: 22,
    risk_level: "controlled",
    linked_trade_id: 9001,
    linked_at: "2026-05-12T09:40:00Z",
    created_at: "2026-05-12T09:35:00Z",
  },
  {
    id: 9202,
    user_id: 0,
    symbol: "NIFTY24MAY23500CE",
    thesis: "Sample graveyard setup: buying OTM options after 2 PM after a loss.",
    entry_price: 170,
    stop_loss_price: 158,
    target_price: 210,
    target2_price: null,
    conviction_score: 3,
    checklist_responses: {
      sample: true,
      warning: "This is the demo graveyard setup, not a live recommendation.",
    },
    position_size: 75,
    risk_amount: 4200,
    risk_score: 91,
    risk_level: "elevated",
    linked_trade_id: 9002,
    linked_at: "2026-05-23T14:16:00Z",
    created_at: "2026-05-23T14:14:00Z",
  },
];

export const demoActivationMeta: DemoActivationMeta = {
  label: "Demo Discipline Layer",
  traderType: "Late-day Revenge Trader",
  biggestLeak: "Increasing size after losses",
  strongestEdge: "Morning planned equity trades",
  bestTimeWindow: "9:30–11:00 AM",
  worstTimeWindow: "After 2:00 PM",
  graveyardSetup: {
    title: "Demo Graveyard Setup",
    pattern: "Buying OTM options after 2 PM after a loss",
    similarTrades: 14,
    winRate: 0.07,
    netLoss: 22040,
    message: "Trade Guard would have warned you before this setup.",
  },
  sessionReplay: {
    title: "Demo Session Replay",
    disciplineScore: 62,
    pnlSavedMessage: "Trade Guard would have warned you before this setup.",
    trades: [
      {
        id: "planned-open",
        label: "Planned morning trade",
        outcome: "Kept the original plan and exited cleanly.",
        note: "Sample demo trade showing your strongest edge.",
        status: "planned",
        pnl: 1070,
      },
      {
        id: "revenge-reentry",
        label: "Revenge re-entry after a loss",
        outcome: "The next trade came too fast and too emotional.",
        note: "Sample demo trade showing the late-day revenge pattern.",
        status: "revenge",
        pnl: -4185,
      },
      {
        id: "oversized-finish",
        label: "Oversized final trade",
        outcome: "Size increased even though the setup quality dropped.",
        note: "Sample demo trade showing how discipline slips after losses.",
        status: "oversized",
        pnl: -4915,
      },
    ],
  },
  unlocks: [
    {
      label: "Connect Dhan",
      description: "Replace sample insights with your own broker-linked trade memory.",
      tradeThreshold: 0,
    },
    {
      label: "Sync first trade",
      description: "Start turning real behavior into reviewable evidence.",
      tradeThreshold: 1,
    },
    {
      label: "10 trades = early signals",
      description: "IndiaCircle starts spotting early leaks and better habits.",
      tradeThreshold: 10,
    },
    {
      label: "30 trades = reliable profile",
      description: "Your real personality snapshot becomes much more dependable.",
      tradeThreshold: 30,
    },
  ],
};

export function getTradeReadiness(args: {
  rawTrades: Trade[];
  completedTrades: CompletedTrade[];
}): TradeReadiness {
  const rawTradeCount = args.rawTrades.length;
  const completedTradeCount = args.completedTrades.length;
  const totalTradeCount = rawTradeCount + completedTradeCount;

  let state: TradeReadinessState = "zero_data";
  if (completedTradeCount >= RELIABLE_PROFILE_THRESHOLD) {
    state = "real_ready";
  } else if (completedTradeCount >= EARLY_SIGNALS_THRESHOLD || totalTradeCount >= EARLY_SIGNALS_THRESHOLD) {
    state = "learning";
  } else if (totalTradeCount > 0) {
    state = "early_data";
  }

  return {
    state,
    rawTradeCount,
    completedTradeCount,
    totalTradeCount,
    progressToReliableProfile: Math.min(
      100,
      Math.round((completedTradeCount / RELIABLE_PROFILE_THRESHOLD) * 100)
    ),
    needsDemo: state !== "real_ready",
    isHybrid: state === "early_data" || state === "learning",
    reliableProfileThreshold: RELIABLE_PROFILE_THRESHOLD,
  };
}

export function getDemoVisiblePatterns(): PatternResponse[] {
  return demoPatterns.patterns.filter((pattern) => !pattern.locked);
}
