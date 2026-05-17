import { storageGet, storageSet } from "./chrome";

export const TODAY_CAPTURES_KEY = "todayCaptures";

export interface CapturedTrade {
  id: number;
  stock_symbol: string;
  trade_type: string;
  quantity: number;
  price: number;
  trade_date: string;
  trade_time?: string | null;
  broker?: string | null;
  instrument_type?: string | null;
  emotion_tag?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface CaptureState {
  date: string;
  trades: CapturedTrade[];
  lastImportedCount: number;
  lastBroker: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createEmptyCaptureState(): CaptureState {
  return {
    date: getTodayKey(),
    trades: [],
    lastImportedCount: 0,
    lastBroker: null,
    lastSyncAt: null,
    lastError: null,
  };
}

function normalizeCaptureState(value: unknown): CaptureState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<CaptureState>;
  return {
    date: typeof record.date === "string" ? record.date : getTodayKey(),
    trades: Array.isArray(record.trades) ? record.trades : [],
    lastImportedCount:
      typeof record.lastImportedCount === "number" ? record.lastImportedCount : 0,
    lastBroker: typeof record.lastBroker === "string" ? record.lastBroker : null,
    lastSyncAt: typeof record.lastSyncAt === "string" ? record.lastSyncAt : null,
    lastError: typeof record.lastError === "string" ? record.lastError : null,
  };
}

export async function getCaptureState(): Promise<CaptureState> {
  const stored = normalizeCaptureState(await storageGet<unknown>(TODAY_CAPTURES_KEY));
  if (!stored || stored.date !== getTodayKey()) {
    const nextState = createEmptyCaptureState();
    await storageSet(TODAY_CAPTURES_KEY, nextState);
    return nextState;
  }

  return stored;
}

export async function setCaptureState(state: CaptureState): Promise<void> {
  await storageSet(TODAY_CAPTURES_KEY, state);
}
