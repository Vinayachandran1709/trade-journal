import { AngelOneAdapter } from "./brokers/angelone";
import { DhanAdapter } from "./brokers/dhan";
import { FivePaisaAdapter } from "./brokers/fivepaisa";
import { growwAdapter } from "./brokers/groww";
import { UpstoxAdapter } from "./brokers/upstox";
import { zerodhaAdapter } from "./brokers/zerodha";
import type { BrokerAdapter } from "./brokers/types";

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

async function getDailySummary(): Promise<{
  net_pnl_today?: number | null;
  max_loss_threshold?: number | null;
} | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([ "dailySummary" ], (result) => {
      resolve(
        (result.dailySummary as
          | { net_pnl_today?: number | null; max_loss_threshold?: number | null }
          | undefined) ?? null
      );
    });
  });
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
  } satisfies Partial<CSSStyleDeclaration>);
  overlay.innerHTML =
    "<div style='max-width: 420px; line-height: 1.5;'>" +
    "<div style='font-size: 28px; font-weight: 700; margin-bottom: 10px;'>Trading locked for today</div>" +
    "<div style='font-size: 16px; opacity: 0.92;'>Daily loss limit exceeded. Trading disabled. Stay disciplined.</div>" +
    "</div>";

  const blockInteraction = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  overlay.addEventListener("click", blockInteraction, true);
  overlay.addEventListener("mousedown", blockInteraction, true);
  overlay.addEventListener("mouseup", blockInteraction, true);
  overlay.addEventListener("keydown", blockInteraction, true);
  overlay.addEventListener("keyup", blockInteraction, true);

  (document.body ?? document.documentElement).appendChild(overlay);
  overlay.focus();
}

async function checkDailyRisk() {
  const dailySummary = await getDailySummary();
  if (!dailySummary) {
    removeLockOverlay();
    return;
  }

  const netPnL = Number(dailySummary.net_pnl_today ?? 0);
  const maxLoss = Number(dailySummary.max_loss_threshold ?? 0);

  if (Number.isFinite(maxLoss) && maxLoss > 0 && Number.isFinite(netPnL) && netPnL < -Math.abs(maxLoss)) {
    injectLockOverlay();
    return;
  }

  removeLockOverlay();
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
    }
  );
}

function initializeCapture(adapter: BrokerAdapter) {
  const lastSignatureRef = { value: "" };
  let timeoutId: number | null = null;

  const scheduleCapture = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      sendCapture(adapter, lastSignatureRef);
      void checkDailyRisk();
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
    }
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleCapture, { once: true });
  } else {
    scheduleCapture();
  }
  void checkDailyRisk();

  const observer = new MutationObserver(() => {
    scheduleCapture();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

if (currentAdapter) {
  initializeCapture(currentAdapter);
}
