import { AUTH_TOKEN_KEY, clearAuthToken, getAuthToken } from "../shared/auth";
import { fetchCurrentUser } from "../shared/api";
import type { BackgroundResponse, ExtensionMessage } from "../shared/types";

const POPUP_PATH = "popup.html";

void syncActionSurface();

chrome.runtime.onInstalled.addListener(() => {
  void syncActionSurface();
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

  await chrome.sidePanel
    .setPanelBehavior({
      openPanelOnActionClick: Boolean(token),
    })
    .catch(() => undefined);
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
      default: {
        sendResponse({ ok: false, error: "Unknown message type." });
      }
    }
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected error.",
    });
  }
}
