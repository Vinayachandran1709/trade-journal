import { AngelOneAdapter } from "./brokers/angelone";
import { DhanAdapter } from "./brokers/dhan";
import { FivePaisaAdapter } from "./brokers/fivepaisa";
import { growwAdapter } from "./brokers/groww";
import { UpstoxAdapter } from "./brokers/upstox";
import { zerodhaAdapter } from "./brokers/zerodha";
import type { BrokerAdapter } from "./brokers/types";
import {
  createDebounced,
  shouldLockTrading,
  type RiskSummaryLike,
} from "./lockout";

const adapters: BrokerAdapter[] = [
  zerodhaAdapter,
  growwAdapter,
  DhanAdapter,
  AngelOneAdapter,
  UpstoxAdapter,
  FivePaisaAdapter,
];
const currentHost = window.location.hostname;
const currentAdapter = adapters.find((adapter) => adapter.matches(currentHost));
const LOCK_OVERLAY_ID = "indiaCircleLockOverlay";
const RISK_REFRESH_INTERVAL_MS = 3_000;
const RISK_REFRESH_DEBOUNCE_MS = 300;
const LOCK_EVENT_NAMES: Array<keyof DocumentEventMap> = [
  "click",
  "mousedown",
  "mouseup",
  "keydown",
  "keyup",
  "keypress",
  "contextmenu",
  "wheel",
  "submit",
];
const LOCK_EVENT_OPTIONS: AddEventListenerOptions = { capture: true, passive: false };

let lockObserver: MutationObserver | null = null;
let lockRefreshIntervalId: number | null = null;
let isLockActive = false;
let previousBodyOverflow: string | null = null;

async function getDailySummary(): Promise<RiskSummaryLike | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["dailySummary"], (result) => {
      resolve(
        (result.dailySummary as
          | RiskSummaryLike
          | undefined) ?? null
      );
    });
  });
}

function blockInteraction(event: Event) {
  if (!isLockActive) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
}

function addLockEventBlockers() {
  for (const eventName of LOCK_EVENT_NAMES) {
    document.addEventListener(eventName, blockInteraction, LOCK_EVENT_OPTIONS);
  }
  window.addEventListener("scroll", blockInteraction, LOCK_EVENT_OPTIONS);
}

function removeLockEventBlockers() {
  for (const eventName of LOCK_EVENT_NAMES) {
    document.removeEventListener(eventName, blockInteraction, LOCK_EVENT_OPTIONS);
  }
  window.removeEventListener("scroll", blockInteraction, LOCK_EVENT_OPTIONS);
}

function removeLockOverlay() {
  document.getElementById(LOCK_OVERLAY_ID)?.remove();
}

function injectLockOverlay() {
  if (document.getElementById(LOCK_OVERLAY_ID)) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = LOCK_OVERLAY_ID;
  overlay.tabIndex = 0;
  Object.assign(overlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    background: "rgba(8, 15, 31, 0.74)",
    backdropFilter: "blur(16px)",
    zIndex: "2147483647",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "20px",
    fontFamily: "system-ui, sans-serif",
    pointerEvents: "auto",
    overscrollBehavior: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  overlay.innerHTML =
    "<div style='max-width: 420px; line-height: 1.5;'>" +
    "<div style='font-size: 28px; font-weight: 700; margin-bottom: 10px;'>Trading locked for today</div>" +
    "<div style='font-size: 16px; opacity: 0.92;'>Daily loss limit exceeded. Trading disabled. Stay disciplined.</div>" +
    "</div>";

  overlay.addEventListener("click", blockInteraction, true);
  overlay.addEventListener("mousedown", blockInteraction, true);
  overlay.addEventListener("mouseup", blockInteraction, true);
  overlay.addEventListener("keydown", blockInteraction, true);
  overlay.addEventListener("keyup", blockInteraction, true);
  overlay.addEventListener("wheel", blockInteraction, LOCK_EVENT_OPTIONS);
  overlay.addEventListener("contextmenu", blockInteraction, true);

  (document.body ?? document.documentElement).appendChild(overlay);
  overlay.focus();
}

function startLockObserver() {
  if (lockObserver || !document.documentElement) {
    return;
  }

  lockObserver = new MutationObserver(() => {
    if (isLockActive && !document.getElementById(LOCK_OVERLAY_ID)) {
      injectLockOverlay();
    }
  });
  lockObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function stopLockObserver() {
  lockObserver?.disconnect();
  lockObserver = null;
}

function enableLockState() {
  if (!isLockActive) {
    isLockActive = true;
    if (previousBodyOverflow === null && document.body) {
      previousBodyOverflow = document.body.style.overflow;
    }
    if (document.body) {
      document.body.style.overflow = "hidden";
    }
    addLockEventBlockers();
    startLockObserver();
  }

  injectLockOverlay();
}

function disableLockState() {
  if (!isLockActive) {
    removeLockOverlay();
    return;
  }

  isLockActive = false;
  stopLockObserver();
  removeLockEventBlockers();
  removeLockOverlay();
  if (document.body) {
    document.body.style.overflow = previousBodyOverflow ?? "";
  }
  previousBodyOverflow = null;
}

async function requestRiskRefresh(force = false): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "risk:refresh-summary",
        payload: { force },
      },
      () => {
        void chrome.runtime.lastError;
        resolve();
      }
    );
  });
}

async function checkDailyRisk() {
  const dailySummary = await getDailySummary();
  if (shouldLockTrading(dailySummary)) {
    enableLockState();
    return;
  }

  disableLockState();
}

async function refreshAndCheckDailyRisk(force = false): Promise<void> {
  await requestRiskRefresh(force);
  await checkDailyRisk();
}

function sendCapture(adapter: BrokerAdapter, lastSignatureRef: { value: string }) {
  const trades = adapter.capture(document);
  if (!trades.length) {
    return;
  }

  const signature = JSON.stringify(trades);
  if (signature === lastSignatureRef.value) {
    return;
  }

  lastSignatureRef.value = signature;

  chrome.runtime.sendMessage(
    {
      type: "capture:submit",
      payload: {
        broker: adapter.broker,
        capture_method: "dom",
        trades,
        href: window.location.href,
      },
    },
    () => {
      void chrome.runtime.lastError;
      void refreshAndCheckDailyRisk(true);
    }
  );
}

function initializeCapture(adapter: BrokerAdapter) {
  const lastSignatureRef = { value: "" };
  let timeoutId: number | null = null;
  const scheduleRiskRefresh = createDebounced(() => {
    void refreshAndCheckDailyRisk();
  }, RISK_REFRESH_DEBOUNCE_MS);

  const scheduleCapture = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      sendCapture(adapter, lastSignatureRef);
      void refreshAndCheckDailyRisk();
    }, 800);
  };

  chrome.runtime.sendMessage(
    {
      type: "broker:page-detected",
      payload: {
        broker: adapter.broker,
        host: currentHost,
        href: window.location.href,
      },
    },
    () => {
      void chrome.runtime.lastError;
      void refreshAndCheckDailyRisk(true);
    }
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleCapture, { once: true });
  } else {
    scheduleCapture();
  }
  void refreshAndCheckDailyRisk(true);

  const observer = new MutationObserver(() => {
    scheduleCapture();
    scheduleRiskRefresh();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (lockRefreshIntervalId === null) {
    lockRefreshIntervalId = window.setInterval(() => {
      void refreshAndCheckDailyRisk();
    }, RISK_REFRESH_INTERVAL_MS);
  }

  const cleanup = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    scheduleRiskRefresh.cancel();
    observer.disconnect();
    if (lockRefreshIntervalId !== null) {
      window.clearInterval(lockRefreshIntervalId);
      lockRefreshIntervalId = null;
    }
    disableLockState();
  };

  window.addEventListener("pagehide", cleanup, { once: true });
  window.addEventListener("beforeunload", cleanup, { once: true });
}

if (currentAdapter) {
  initializeCapture(currentAdapter);
}
