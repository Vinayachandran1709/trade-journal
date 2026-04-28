import { AUTH_TOKEN_KEY, clearAuthToken, getAuthToken } from "../shared/auth";
import { storageGetAll, storageRemoveMany } from "../shared/chrome";
import {
  createEmptyCaptureState,
  getCaptureState,
  setCaptureState,
} from "../shared/captures";
import {
  postAutoCapture,
  updateTradeCaptureDetails,
  type TickerIntelResponse,
} from "../shared/api";
import { fetchCurrentUser } from "../shared/api";
import type { BackgroundResponse, ExtensionMessage } from "../shared/types";

const POPUP_PATH = "popup.html";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL || "https://indiacircle.in").replace(/\/$/, "");
const TICKER_INTEL_TIMEOUT_MS = 8_000;
const TICKER_QUOTE_TIMEOUT_MS = 6_000;

void syncActionSurface();

chrome.runtime.onInstalled.addListener((details) => {
  void syncActionSurface();
  void cleanupOldAiQueryCounts();
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.tabs.create({ url: `${WEB_APP_URL}/welcome` });
  }
});

chrome.runtime.onStartup.addListener(() => {
  void syncActionSurface();
  void cleanupOldAiQueryCounts();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[AUTH_TOKEN_KEY]) {
    return;
  }

  const nextToken = (changes[AUTH_TOKEN_KEY].newValue as string | undefined) ?? null;
  void configureActionSurface(nextToken);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message as ExtensionMessage, sendResponse);
  return true;
});

async function syncActionSurface(): Promise<void> {
  const token = await getAuthToken();
  await cleanupOldAiQueryCounts();
  await configureActionSurface(token);
}

async function configureActionSurface(token: string | null): Promise<void> {
  await chrome.action.setPopup({
    popup: POPUP_PATH,
  });

  await chrome.action.setBadgeBackgroundColor({ color: "#0f766e" });

  await chrome.sidePanel
    .setPanelBehavior({
      openPanelOnActionClick: false,
    })
    .catch(() => undefined);

  if (!token) {
    await setCaptureState(createEmptyCaptureState());
    await chrome.action.setBadgeText({ text: "" });
  }
}

async function handleMessage(
  message: ExtensionMessage,
  sendResponse: (response: BackgroundResponse) => void
): Promise<void> {
  try {
    switch (message.type) {
      case "auth:get-token": {
        const token = await getAuthToken();
        sendResponse({ ok: true, token });
        return;
      }
      case "auth:get-me": {
        const token = await getAuthToken();
        if (!token) {
          sendResponse({ ok: false, error: "Not authenticated." });
          return;
        }

        const user = await fetchCurrentUser(token);
        sendResponse({ ok: true, user });
        return;
      }
      case "auth:logout": {
        await clearAuthToken();
        sendResponse({ ok: true });
        return;
      }
      case "health:ping": {
        sendResponse({ ok: true, timestamp: new Date().toISOString() });
        return;
      }
      case "broker:page-detected": {
        sendResponse({ ok: true });
        return;
      }
      case "ticker:fetch-intel": {
        const payload = message.payload as { symbol?: string };
        const symbol = payload.symbol?.trim().toUpperCase();
        if (!symbol) {
          sendResponse({ ok: true, tickerIntel: createTickerFallback("UNKNOWN") });
          return;
        }

        const tickerIntel = await fetchTickerIntelWithFallback(symbol);
        sendResponse({ ok: true, tickerIntel });
        return;
      }
      case "capture:submit": {
        const token = await getAuthToken();
        if (!token) {
          sendResponse({ ok: false, error: "Sign in required before capture." });
          return;
        }

        const payload = message.payload as {
          broker: "zerodha" | "groww";
          capture_method: "dom";
          trades: [];
        };
        const result = await postAutoCapture(token, payload);
        const state = await getCaptureState();
        const nextState = {
          ...state,
          trades: [...result.trades, ...state.trades].slice(0, 100),
          lastImportedCount: result.imported_count,
          lastBroker: payload.broker,
          lastSyncAt: new Date().toISOString(),
          lastError: null,
        };
        await setCaptureState(nextState);
        await updateBadge(nextState.trades.length);
        sendResponse({
          ok: true,
          importedCount: result.imported_count,
          trades: result.trades,
          captureState: nextState,
        });
        return;
      }
      case "capture:get-state": {
        const state = await getCaptureState();
        sendResponse({ ok: true, captureState: state });
        return;
      }
      case "capture:update-trade": {
        const token = await getAuthToken();
        if (!token) {
          sendResponse({ ok: false, error: "Sign in required before saving." });
          return;
        }

        const payload = message.payload as {
          tradeId: number;
          emotion_tag: string | null;
          note: string | null;
        };
        const updatedTrade = await updateTradeCaptureDetails(token, payload.tradeId, {
          emotion_tag: payload.emotion_tag,
          note: payload.note,
        });
        const state = await getCaptureState();
        const nextState = {
          ...state,
          trades: state.trades.map((trade) =>
            trade.id === payload.tradeId ? { ...trade, ...updatedTrade } : trade
          ),
          lastSyncAt: new Date().toISOString(),
          lastError: null,
        };
        await setCaptureState(nextState);
        sendResponse({ ok: true, captureState: nextState, trades: [updatedTrade] });
        return;
      }
      default: {
        sendResponse({ ok: false, error: "Unknown message type." });
      }
    }
  } catch (error) {
    if (message.type === "ticker:fetch-intel") {
      const payload = message.payload as { symbol?: string } | undefined;
      sendResponse({
        ok: true,
        tickerIntel: createTickerFallback(payload?.symbol?.trim().toUpperCase() || "UNKNOWN"),
      });
      return;
    }

    if (message.type.startsWith("capture:")) {
      const state = await getCaptureState();
      const nextState = {
        ...state,
        lastError: error instanceof Error ? error.message : "Unexpected error.",
      };
      await setCaptureState(nextState);
    }
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected error.",
    });
  }
}

async function updateBadge(count: number): Promise<void> {
  await chrome.action.setBadgeText({
    text: count > 0 ? String(Math.min(count, 99)) : "",
  });
}

async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchTickerIntelWithFallback(symbol: string): Promise<TickerIntelResponse> {
  try {
    return await fetchJsonWithTimeout(
      `${API_BASE_URL}/api/market/ticker-intel/${encodeURIComponent(symbol)}`,
      TICKER_INTEL_TIMEOUT_MS
    );
  } catch {
    try {
      const quote = await fetchJsonWithTimeout<Record<string, unknown>>(
        `${API_BASE_URL}/api/market/quote/${encodeURIComponent(symbol)}`,
        TICKER_QUOTE_TIMEOUT_MS
      );

      return {
        symbol: String(quote.symbol || symbol),
        price: typeof quote.price === "number" ? quote.price : null,
        change: typeof quote.change === "number" ? quote.change : null,
        change_pct: typeof quote.change_pct === "number" ? quote.change_pct : null,
        high_52w: typeof quote.high_52w === "number" ? quote.high_52w : null,
        low_52w: typeof quote.low_52w === "number" ? quote.low_52w : null,
        volume: typeof quote.volume === "number" ? quote.volume : null,
        avg_volume: null,
        volume_vs_avg: "Live quote",
        sector: null,
        market_cap: null,
        next_event: null,
        sentiment_line:
          typeof quote.change_pct === "number"
            ? quote.change_pct >= 0
              ? "Price is trading higher today"
              : "Price is trading lower today"
            : "Live quote loaded",
        disclaimer: "Market data may be delayed. This is analytics, not investment advice.",
      };
    } catch {
      return createTickerFallback(symbol);
    }
  }
}

function createTickerFallback(symbol: string): TickerIntelResponse {
  return {
    symbol,
    price: null,
    change: null,
    change_pct: null,
    high_52w: null,
    low_52w: null,
    volume: null,
    avg_volume: null,
    volume_vs_avg: "Live quote temporarily unavailable",
    sector: null,
    market_cap: null,
    next_event: null,
    sentiment_line: "Live market data is taking longer than expected",
    disclaimer: "Market data may be delayed. This is analytics, not investment advice.",
  };
}

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function cleanupOldAiQueryCounts(): Promise<void> {
  const allItems = await storageGetAll<Record<string, unknown>>();
  const todayKey = `aiQueryCount_${getLocalDateKey()}`;
  const staleKeys = Object.keys(allItems).filter(
    (key) => key.startsWith("aiQueryCount_") && key !== todayKey
  );
  await storageRemoveMany(staleKeys);
}
