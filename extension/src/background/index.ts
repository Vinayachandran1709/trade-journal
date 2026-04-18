import { AUTH_TOKEN_KEY, clearAuthToken, getAuthToken } from "../shared/auth";
import {
  createEmptyCaptureState,
  getCaptureState,
  setCaptureState,
} from "../shared/captures";
import { postAutoCapture, updateTradeCaptureDetails } from "../shared/api";
import { fetchCurrentUser } from "../shared/api";
import type { BackgroundResponse, ExtensionMessage } from "../shared/types";

const POPUP_PATH = "popup.html";
const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL || "https://indiacircle.in").replace(/\/$/, "");

void syncActionSurface();

chrome.runtime.onInstalled.addListener((details) => {
  void syncActionSurface();
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.tabs.create({ url: `${WEB_APP_URL}/welcome` });
  }
});

chrome.runtime.onStartup.addListener(() => {
  void syncActionSurface();
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
  await configureActionSurface(token);
}

async function configureActionSurface(token: string | null): Promise<void> {
  await chrome.action.setPopup({
    popup: token ? "" : POPUP_PATH,
  });

  await chrome.action.setBadgeBackgroundColor({ color: "#0f766e" });

  await chrome.sidePanel
    .setPanelBehavior({
      openPanelOnActionClick: Boolean(token),
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
