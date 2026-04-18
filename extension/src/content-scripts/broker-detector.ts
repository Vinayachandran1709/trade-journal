import { growwAdapter } from "./brokers/groww";
import { zerodhaAdapter } from "./brokers/zerodha";
import type { BrokerAdapter } from "./brokers/types";

const adapters: BrokerAdapter[] = [zerodhaAdapter, growwAdapter];
const currentHost = window.location.hostname;
const currentAdapter = adapters.find((adapter) => adapter.matches(currentHost));

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
