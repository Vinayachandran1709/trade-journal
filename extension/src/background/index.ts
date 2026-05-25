import { AUTH_TOKEN_KEY, clearAuthToken, getAuthToken, setAuthToken } from "../shared/auth";
import {
  storageGet,
  storageGetAll,
  storageRemove,
  storageRemoveMany,
  storageSet,
} from "../shared/chrome";
import {
  createEmptyCaptureState,
  getCaptureState,
  setCaptureState,
} from "../shared/captures";
import {
  postAutoCapture,
  fetchTradesSummary,
  updateTradeCaptureDetails,
  type TradesSummary,
  type TickerIntelResponse,
} from "../shared/api";
import { fetchCurrentUser } from "../shared/api";
import { getExtensionApiBaseUrl, getExtensionWebAppUrl } from "../shared/env";
import {
  shouldRefreshStockDictionaryCache,
  type StockDictionaryCacheEntry,
  type StockDictionaryResponse,
} from "../shared/stockDictionary";
import type {
  BackgroundResponse,
  ExtensionMessage,
  ExternalAuthHandoffMessage,
} from "../shared/types";

const API_BASE_URL = getExtensionApiBaseUrl();
const WEB_APP_URL = getExtensionWebAppUrl();
const TICKER_INTEL_TIMEOUT_MS = 8_000;
const TICKER_QUOTE_TIMEOUT_MS = 6_000;
const TICKER_CACHE_TTL_MS = 5 * 60 * 1_000;
const STOCK_DICTIONARY_CACHE_KEY = "stockDictionaryCache";
const PREWARM_DELAY_MS = 500;
const DAILY_SUMMARY_KEY = "dailySummary";
const DAILY_SUMMARY_HEARTBEAT_MS = 3_000;
const DAILY_SUMMARY_REFRESH_DEBOUNCE_MS = 1_000;
const PREWARM_TICKERS = [
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "INFY",
  "ICICIBANK",
  "SBIN",
  "BHARTIARTL",
  "ITC",
  "KOTAKBANK",
  "LT",
  "HCLTECH",
  "AXISBANK",
  "BAJFINANCE",
  "WIPRO",
  "SUNPHARMA",
  "TITAN",
  "TATAMOTORS",
  "MARUTI",
  "HINDUNILVR",
  "NTPC",
] as const;
const TICKER_HIGHLIGHTER_MATCH_PATTERNS = ["https://*/*", "http://*/*"] as const;
const TRUSTED_EXTERNAL_ORIGINS = new Set([
  "https://indiacircle.in",
  "https://www.indiacircle.in",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

interface TickerCacheEntry {
  data: TickerIntelResponse;
  cachedAt: number;
}

let dailySummaryRefreshInFlight: Promise<void> | null = null;
let lastDailySummaryRefreshAt = 0;

void syncActionSurface();
void prewarmTickerCache();
void fetchStockDictionaryWithCache().catch(() => undefined);
void reinjectTickerHighlighterIntoOpenTabs().catch(() => undefined);
void refreshDailySummary(true).catch(() => undefined);
setInterval(() => {
  void refreshDailySummary().catch(() => undefined);
}, DAILY_SUMMARY_HEARTBEAT_MS);

chrome.runtime.onInstalled.addListener((details) => {
  void syncActionSurface();
  void cleanupOldAiQueryCounts();
  void prewarmTickerCache();
  void fetchStockDictionaryWithCache(true).catch(() => undefined);
  void reinjectTickerHighlighterIntoOpenTabs().catch(() => undefined);
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.tabs.create({ url: `${WEB_APP_URL}/welcome` });
  }
});

chrome.runtime.onStartup.addListener(() => {
  void syncActionSurface();
  void cleanupOldAiQueryCounts();
  void prewarmTickerCache();
  void fetchStockDictionaryWithCache().catch(() => undefined);
  void reinjectTickerHighlighterIntoOpenTabs().catch(() => undefined);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[AUTH_TOKEN_KEY]) {
    return;
  }

  const nextToken = (changes[AUTH_TOKEN_KEY].newValue as string | undefined) ?? null;
  void configureActionSurface(nextToken);
  if (nextToken) {
    void refreshDailySummary(true).catch(() => undefined);
  } else {
    void storageRemove(DAILY_SUMMARY_KEY).catch(() => undefined);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message as ExtensionMessage, sender, sendResponse);
  return true;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  void handleExternalMessage(message as ExternalAuthHandoffMessage, sender, sendResponse);
  return true;
});

async function syncActionSurface(): Promise<void> {
  const token = await getAuthToken();
  await cleanupOldAiQueryCounts();
  await configureActionSurface(token);
}

async function configureActionSurface(token: string | null): Promise<void> {
  await chrome.action.setPopup({ popup: "" });

  await chrome.action.setBadgeBackgroundColor({ color: "#0f766e" });

  await chrome.sidePanel
    .setPanelBehavior({
      openPanelOnActionClick: true,
    })
    .catch(() => undefined);

  if (!token) {
    await setCaptureState(createEmptyCaptureState());
    await chrome.action.setBadgeText({ text: "" });
    await storageRemove(DAILY_SUMMARY_KEY).catch(() => undefined);
  }
}

async function pollDailySummary(): Promise<void> {
  const token = await getAuthToken();
  if (!token) {
    await storageRemove(DAILY_SUMMARY_KEY).catch(() => undefined);
    return;
  }

  try {
    const summary = await fetchTradesSummary(token);
    await storageSet<TradesSummary>(DAILY_SUMMARY_KEY, summary);
  } catch (error) {
    console.error("Error fetching daily summary:", error);
  }
}

async function refreshDailySummary(force = false): Promise<void> {
  const now = Date.now();
  const isDebounced =
    !force && now - lastDailySummaryRefreshAt < DAILY_SUMMARY_REFRESH_DEBOUNCE_MS;

  if (isDebounced) {
    return dailySummaryRefreshInFlight ?? Promise.resolve();
  }

  if (dailySummaryRefreshInFlight) {
    return dailySummaryRefreshInFlight;
  }

  lastDailySummaryRefreshAt = now;
  dailySummaryRefreshInFlight = pollDailySummary().finally(() => {
    dailySummaryRefreshInFlight = null;
  });
  return dailySummaryRefreshInFlight;
}

function getTrustedExternalOrigin(url?: string): string | null {
  if (!url) {
    return null;
  }

  try {
    const origin = new URL(url).origin;
    return TRUSTED_EXTERNAL_ORIGINS.has(origin) ? origin : null;
  } catch {
    return null;
  }
}

async function openSidePanelForSenderWindow(
  sender: chrome.runtime.MessageSender
): Promise<boolean> {
  const tabId = sender.tab?.id;
  const windowId = sender.tab?.windowId;

  if (typeof tabId === "number") {
    try {
      await chrome.sidePanel.open({ tabId });
      return true;
    } catch {
      // Fall back to window-level opening below.
    }
  }

  if (typeof windowId === "number") {
    try {
      await chrome.sidePanel.open({ windowId });
      return true;
    } catch {
      return false;
    }
  }

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof activeTab?.id === "number") {
      await chrome.sidePanel.open({ tabId: activeTab.id });
      return true;
    }
    if (typeof activeTab?.windowId !== "number") {
      return false;
    }
    await chrome.sidePanel.open({ windowId: activeTab.windowId });
    return true;
  } catch {
    return false;
  }
}

async function handleExternalMessage(
  message: ExternalAuthHandoffMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: BackgroundResponse) => void
): Promise<void> {
  if (message?.type !== "indiacircle:auth-handoff") {
    sendResponse({ ok: false, error: "Unsupported external request." });
    return;
  }

  const trustedOrigin = getTrustedExternalOrigin(sender.url);
  if (!trustedOrigin) {
    sendResponse({ ok: false, error: "Untrusted website. Open IndiaCircle from the official site." });
    return;
  }

  const token = message.token?.trim();
  if (!token) {
    sendResponse({ ok: false, error: "Missing session. Please log in on the website first." });
    return;
  }

  try {
    const sidePanelOpened = await openSidePanelForSenderWindow(sender);
    const user = await fetchCurrentUser(token);
    await setAuthToken(token);
    await storageSet("cached_email", user.email);
    await configureActionSurface(token);
    await refreshDailySummary(true);
    sendResponse({
      ok: true,
      user,
      userEmail: user.email,
      sidePanelOpened,
    });
  } catch (error) {
    await clearAuthToken();
    await storageRemoveMany(["cached_email"]);
    sendResponse({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : `Unable to connect your extension from ${trustedOrigin}.`,
    });
  }
}

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: BackgroundResponse) => void
): Promise<void> {
  try {
    switch (message.type) {
      case "website:auth-handoff": {
        const trustedOrigin = getTrustedExternalOrigin(sender.tab?.url);
        if (!trustedOrigin) {
          sendResponse({
            ok: false,
            error: "Open the IndiaCircle welcome page in Chrome before launching the side panel.",
          });
          return;
        }

        const token = String(message.payload?.token ?? "").trim();
        if (!token) {
          sendResponse({ ok: false, error: "Missing session. Please log in first." });
          return;
        }

        const sidePanelOpened = await openSidePanelForSenderWindow(sender);
        const user = await fetchCurrentUser(token);
        await setAuthToken(token);
        await storageSet("cached_email", user.email);
        await configureActionSurface(token);
        await refreshDailySummary(true);
        sendResponse({
          ok: true,
          user,
          userEmail: user.email,
          sidePanelOpened,
        });
        return;
      }
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
        await storageRemove(DAILY_SUMMARY_KEY).catch(() => undefined);
        sendResponse({ ok: true });
        return;
      }
      case "health:ping": {
        sendResponse({ ok: true, timestamp: new Date().toISOString() });
        return;
      }
      case "broker:page-detected": {
        await refreshDailySummary();
        sendResponse({ ok: true });
        return;
      }
      case "risk:refresh-summary": {
        const payload = message.payload as { force?: boolean } | undefined;
        await refreshDailySummary(Boolean(payload?.force));
        sendResponse({ ok: true });
        return;
      }
      case "stocks:get-dictionary": {
        const stockDictionary = await fetchStockDictionaryWithCache();
        sendResponse({ ok: true, stockDictionary });
        return;
      }
      case "ticker:fetch-intel": {
        const payload = message.payload as { symbol?: string };
        const symbol = payload.symbol?.trim().toUpperCase();
        if (!symbol) {
          sendResponse({ ok: true, tickerIntel: createTickerFallback("UNKNOWN") });
          return;
        }

        const tickerIntel = await fetchTickerIntelWithCache(symbol);
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
          broker: "zerodha" | "groww" | "dhan" | "angelone" | "upstox" | "5paisa";
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
        await refreshDailySummary(true);
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
        await refreshDailySummary(true);
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

async function fetchStockDictionaryWithCache(
  forceRefresh = false
): Promise<StockDictionaryResponse> {
  const cached = await storageGet<StockDictionaryCacheEntry>(STOCK_DICTIONARY_CACHE_KEY);
  if (!forceRefresh && cached && !shouldRefreshStockDictionaryCache(cached)) {
    return cached.data;
  }

  const headers: HeadersInit = {};
  if (cached?.etag) {
    headers["If-None-Match"] = cached.etag;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/stocks/dictionary`, { headers });
    if (response.status === 304 && cached) {
      const nextCached = {
        ...cached,
        fetchedAt: Date.now(),
      };
      await storageSet(STOCK_DICTIONARY_CACHE_KEY, nextCached);
      return cached.data;
    }

    if (!response.ok) {
      throw new Error(`Dictionary request failed with ${response.status}`);
    }

    const data = (await response.json()) as StockDictionaryResponse;
    const nextCached = {
      data,
      etag: response.headers.get("ETag"),
      fetchedAt: Date.now(),
    } satisfies StockDictionaryCacheEntry;
    await storageSet(STOCK_DICTIONARY_CACHE_KEY, nextCached);
    return data;
  } catch (error) {
    if (cached?.data) {
      return cached.data;
    }
    throw error;
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
        company_name: null,
        exchange: symbol.startsWith("BSE:") || symbol.endsWith(".BO") ? "BSE" : "NSE",
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

function getTickerCacheKey(symbol: string): string {
  return `tickerCache_${symbol}`;
}

function isFreshTickerCache(entry: TickerCacheEntry | null): entry is TickerCacheEntry {
  return Boolean(entry && Date.now() - entry.cachedAt < TICKER_CACHE_TTL_MS);
}

async function readTickerCache(symbol: string): Promise<TickerCacheEntry | null> {
  return storageGet<TickerCacheEntry>(getTickerCacheKey(symbol));
}

async function writeTickerCache(symbol: string, data: TickerIntelResponse): Promise<void> {
  await storageSet(getTickerCacheKey(symbol), {
    data,
    cachedAt: Date.now(),
  } satisfies TickerCacheEntry);
}

async function fetchTickerIntelWithCache(symbol: string): Promise<TickerIntelResponse> {
  const cached = await readTickerCache(symbol);
  if (isFreshTickerCache(cached)) {
    return cached.data;
  }

  const tickerIntel = await fetchTickerIntelWithFallback(symbol);
  await writeTickerCache(symbol, tickerIntel);
  return tickerIntel;
}

async function prewarmTickerCache(): Promise<void> {
  for (const [index, symbol] of PREWARM_TICKERS.entries()) {
    if (index > 0) {
      await delay(PREWARM_DELAY_MS);
    }

    try {
      const cached = await readTickerCache(symbol);
      if (isFreshTickerCache(cached)) {
        continue;
      }

      const tickerIntel = await fetchTickerIntelWithFallback(symbol);
      await writeTickerCache(symbol, tickerIntel);
    } catch {
      // Ignore individual prewarm failures so startup keeps moving.
    }
  }
}

function createTickerFallback(symbol: string): TickerIntelResponse {
  return {
    symbol,
    company_name: null,
    exchange: symbol.startsWith("BSE:") ? "BSE" : "NSE",
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function reinjectTickerHighlighterIntoOpenTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: [...TICKER_HIGHLIGHTER_MATCH_PATTERNS] });

  for (const tab of tabs) {
    if (!tab.id) {
      continue;
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content-scripts/ticker-highlighter.js"],
      });
    } catch {
      // Ignore restricted pages or tabs that changed during iteration.
    }
  }
}
