import {
  buildStockDictionaryIndex,
  findDictionaryMatchesInText,
  type StockDictionaryIndex,
} from "../shared/stockDictionary";

declare global {
  interface Window {
    __indiaCircleTickerHighlighterVersion?: string;
  }
}

const INITIAL_SCAN_DELAY_MS = 500;
const HIDE_DELAY_MS = 200;
const MAX_HIGHLIGHTS = 30;
const MAX_TEXT_NODES_PER_BATCH = 150;
const SCAN_DEBOUNCE_MS = 250;
const OBSERVER_LIFETIME_MS = 30_000;
const POPUP_WIDTH = 340;
const VIEWPORT_PADDING = 12;

const SKIP_SELECTOR = [
  "script",
  "style",
  "textarea",
  "input",
  "code",
  "pre",
  "noscript",
  "svg",
  "[contenteditable='true']",
  ".sf-ticker-highlight",
  ".sf-ticker-popup",
].join(",");

interface TickerIntelResponse {
  symbol: string;
  company_name?: string | null;
  exchange?: string | null;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  high_52w: number | null;
  low_52w: number | null;
  volume: number | null;
  avg_volume?: number | null;
  market_cap?: string | null;
  next_event?: string | null;
  volume_vs_avg: string;
  sector: string | null;
  sentiment_line: string;
  disclaimer: string;
}

let highlightedCount = 0;
let popup: HTMLDivElement | null = null;
let hideTimeoutId: number | null = null;
let activeHoverId = 0;
let observer: MutationObserver | null = null;
let pendingScanTimeoutId: number | null = null;
let dictionaryIndex: StockDictionaryIndex | null = null;

const queuedRoots = new Set<Node>();
const tickerCache = new Map<string, TickerIntelResponse>();
const pendingRequests = new Map<string, Promise<TickerIntelResponse>>();
const CONTENT_SCRIPT_VERSION = globalThis.chrome?.runtime?.getManifest?.().version ?? "dev";

function getExtensionRuntime(): typeof chrome.runtime | null {
  const runtime = globalThis.chrome?.runtime;
  return runtime?.id ? runtime : null;
}

function injectStyles(): void {
  if (document.getElementById("sf-ticker-intelligence-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "sf-ticker-intelligence-styles";
  style.textContent = `
.sf-ticker-highlight {
  border-bottom: 1.5px dashed #6366f1;
  cursor: pointer;
  position: relative;
  padding-bottom: 1px;
}

.sf-ticker-popup {
  position: fixed;
  z-index: 2147483647;
  width: ${POPUP_WIDTH}px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12);
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 14px;
  color: #1f2937;
  pointer-events: auto;
  transition: opacity 0.15s ease;
}

.sf-ticker-popup .sf-company { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
.sf-ticker-popup .sf-symbol-line { display: flex; gap: 8px; align-items: center; }
.sf-ticker-popup .sf-price { font-size: 24px; font-weight: 700; }
.sf-ticker-popup .sf-change-positive { color: #16a34a; }
.sf-ticker-popup .sf-change-negative { color: #dc2626; }
.sf-ticker-popup .sf-section { margin-top: 10px; padding-top: 8px; border-top: 1px solid #f3f4f6; }
.sf-ticker-popup .sf-label { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
.sf-ticker-popup .sf-sentiment {
  display: inline-block; padding: 2px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 500; margin-top: 6px;
  background: #f0fdf4; color: #16a34a;
}
.sf-ticker-popup .sf-sentiment.negative { background: #fef2f2; color: #dc2626; }
.sf-ticker-popup .sf-range-bar {
  height: 4px; background: #e5e7eb; border-radius: 2px;
  margin: 4px 0; position: relative;
}
.sf-ticker-popup .sf-range-dot {
  position: absolute; width: 8px; height: 8px; background: #6366f1;
  border-radius: 50%; top: -2px; transform: translateX(-50%);
}`;

  document.head.appendChild(style);
}

function ensurePopup(): HTMLDivElement {
  if (popup) {
    return popup;
  }

  const existingPopup = document.querySelector<HTMLDivElement>(".sf-ticker-popup");
  if (existingPopup) {
    popup = existingPopup;
    return popup;
  }

  popup = document.createElement("div");
  popup.className = "sf-ticker-popup";
  popup.id = "sf-ticker-intelligence-popup";
  popup.style.display = "none";
  popup.addEventListener("mouseenter", cancelHidePopup);
  popup.addEventListener("mouseleave", scheduleHidePopup);
  document.body.appendChild(popup);
  return popup;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatSigned(value: number | null | undefined, suffix = ""): string {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${formatMoney(value)}${suffix}`;
}

function formatVolume(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function rangePosition(data: TickerIntelResponse): number {
  if (
    data.low_52w == null ||
    data.high_52w == null ||
    data.price == null ||
    data.high_52w <= data.low_52w
  ) {
    return 50;
  }

  const position = ((data.price - data.low_52w) / (data.high_52w - data.low_52w)) * 100;
  return Math.max(0, Math.min(100, position));
}

function cancelHidePopup(): void {
  if (hideTimeoutId != null) {
    window.clearTimeout(hideTimeoutId);
    hideTimeoutId = null;
  }
}

function hidePopup(): void {
  cancelHidePopup();
  activeHoverId += 1;
  if (popup) {
    popup.style.display = "none";
  }
}

function scheduleHidePopup(): void {
  cancelHidePopup();
  hideTimeoutId = window.setTimeout(hidePopup, HIDE_DELAY_MS);
}

function positionPopup(anchor: HTMLElement): void {
  const popupEl = ensurePopup();
  const rect = anchor.getBoundingClientRect();

  popupEl.style.display = "block";
  popupEl.style.left = "0px";
  popupEl.style.top = "0px";

  const popupHeight = popupEl.getBoundingClientRect().height;
  const top =
    rect.bottom + popupHeight + 8 > window.innerHeight
      ? Math.max(VIEWPORT_PADDING, rect.top - popupHeight - 8)
      : rect.bottom + 8;
  const maxLeft = Math.max(
    VIEWPORT_PADDING,
    window.innerWidth - POPUP_WIDTH - VIEWPORT_PADDING
  );
  const left = Math.min(Math.max(VIEWPORT_PADDING, rect.left), maxLeft);

  popupEl.style.left = `${left}px`;
  popupEl.style.top = `${top}px`;
}

function renderLoading(label: string): void {
  ensurePopup().innerHTML = `<strong>${escapeHtml(label)}</strong> Loading...`;
}

function renderError(label: string): void {
  ensurePopup().innerHTML = `<strong>${escapeHtml(label)}</strong> Data unavailable`;
}

function renderData(data: TickerIntelResponse): void {
  const changeValue = data.change_pct ?? data.change ?? 0;
  const isPositive = changeValue >= 0;
  const changeClass = isPositive ? "sf-change-positive" : "sf-change-negative";
  const arrow = isPositive ? "&#9650;" : "&#9660;";
  const sentimentClass = data.sentiment_line.toLowerCase().includes("negative")
    ? " negative"
    : "";

  ensurePopup().innerHTML = `
    <div>
      <div class="sf-company">${escapeHtml(data.company_name ?? data.symbol)}</div>
      <div class="sf-symbol-line">
        <strong>${escapeHtml(data.symbol)}</strong>
        <span class="sf-label">${escapeHtml(data.exchange ?? data.sector ?? "Stock")}</span>
      </div>
      <div class="sf-price">&#8377;${escapeHtml(formatMoney(data.price))}</div>
      <div class="${changeClass}">${arrow} ${escapeHtml(formatSigned(data.change))} (${escapeHtml(formatSigned(data.change_pct, "%"))})</div>

      <div class="sf-section">
        <div class="sf-label">52 Week Range</div>
        <div style="display:flex;justify-content:space-between;font-size:11px">
          <span>&#8377;${escapeHtml(formatMoney(data.low_52w))}</span>
          <span>&#8377;${escapeHtml(formatMoney(data.high_52w))}</span>
        </div>
        <div class="sf-range-bar">
          <div class="sf-range-dot" style="left: ${rangePosition(data)}%"></div>
        </div>
      </div>

      <div class="sf-section">
        <div class="sf-label">Volume</div>
        <div>${escapeHtml(formatVolume(data.volume))} (${escapeHtml(data.volume_vs_avg)})</div>
      </div>

      <div class="sf-sentiment${sentimentClass}">${escapeHtml(data.sentiment_line)}</div>
    </div>
  `;
}

function fetchTickerIntel(symbol: string): Promise<TickerIntelResponse> {
  const runtime = getExtensionRuntime();
  if (!runtime) {
    return Promise.reject(new Error("Extension runtime unavailable"));
  }

  const cached = tickerCache.get(symbol);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingRequests.get(symbol);
  if (pending) {
    return pending;
  }

  const request = runtime
    .sendMessage({
      type: "ticker:fetch-intel",
      payload: { symbol },
    })
    .then((response) => {
      if (!response?.ok || !response.tickerIntel) {
        throw new Error(response?.error || "Data unavailable");
      }

      return response.tickerIntel as TickerIntelResponse;
    })
    .then((data) => {
      tickerCache.set(symbol, data);
      pendingRequests.delete(symbol);
      return data;
    })
    .catch((error) => {
      pendingRequests.delete(symbol);
      throw error;
    });

  pendingRequests.set(symbol, request);
  return request;
}

function onTickerMouseEnter(event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement;
  const symbol = target.dataset.ticker;
  const label = target.dataset.label ?? symbol ?? "Stock";
  if (!symbol) {
    return;
  }

  const hoverId = ++activeHoverId;
  cancelHidePopup();
  renderLoading(label);
  positionPopup(target);

  void fetchTickerIntel(symbol)
    .then((data) => {
      if (hoverId !== activeHoverId) {
        return;
      }

      renderData(data);
      positionPopup(target);
    })
    .catch(() => {
      if (hoverId !== activeHoverId) {
        return;
      }

      renderError(label);
      positionPopup(target);
    });
}

function attachTickerEvents(element: HTMLElement): void {
  element.addEventListener("mouseenter", onTickerMouseEnter);
  element.addEventListener("mouseleave", scheduleHidePopup);
}

function isSkippableTextNode(node: Text): boolean {
  const parent = node.parentElement;
  return !parent || Boolean(parent.closest(SKIP_SELECTOR));
}

function highlightTextNode(textNode: Text): void {
  if (!dictionaryIndex || highlightedCount >= MAX_HIGHLIGHTS || isSkippableTextNode(textNode)) {
    return;
  }

  const text = textNode.nodeValue ?? "";
  if (text.trim().length < 2) {
    return;
  }

  const matches = findDictionaryMatchesInText(
    text,
    dictionaryIndex,
    Math.max(MAX_HIGHLIGHTS - highlightedCount, 0)
  );
  if (matches.length === 0) {
    return;
  }

  let cursor = 0;
  const fragment = document.createDocumentFragment();

  for (const match of matches) {
    if (highlightedCount >= MAX_HIGHLIGHTS) {
      break;
    }

    if (match.start > cursor) {
      fragment.append(text.slice(cursor, match.start));
    }

    const span = document.createElement("span");
    span.className = "sf-ticker-highlight";
    span.dataset.ticker = match.symbol;
    span.dataset.label = match.displayText;
    span.textContent = text.slice(match.start, match.end);
    attachTickerEvents(span);

    fragment.append(span);
    highlightedCount += 1;
    cursor = match.end;
  }

  if (cursor === 0) {
    return;
  }

  if (cursor < text.length) {
    fragment.append(text.slice(cursor));
  }

  textNode.parentNode?.replaceChild(fragment, textNode);
}

function processRoot(root: Node): void {
  if (highlightedCount >= MAX_HIGHLIGHTS || !dictionaryIndex) {
    return;
  }

  if (root.nodeType === Node.TEXT_NODE) {
    highlightTextNode(root as Text);
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE && root !== document.body) {
    return;
  }

  const element = root as Element;
  if (element.closest?.(SKIP_SELECTOR)) {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const textNode = node as Text;

      if (highlightedCount >= MAX_HIGHLIGHTS) {
        return NodeFilter.FILTER_REJECT;
      }

      if (!textNode.nodeValue?.trim() || isSkippableTextNode(textNode)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let processedTextNodes = 0;
  while (walker.nextNode()) {
    highlightTextNode(walker.currentNode as Text);
    processedTextNodes += 1;

    if (
      highlightedCount >= MAX_HIGHLIGHTS ||
      processedTextNodes >= MAX_TEXT_NODES_PER_BATCH
    ) {
      break;
    }
  }
}

function flushQueuedRoots(): void {
  pendingScanTimeoutId = null;
  const roots = Array.from(queuedRoots);
  queuedRoots.clear();

  for (const root of roots) {
    processRoot(root);
    if (highlightedCount >= MAX_HIGHLIGHTS) {
      observer?.disconnect();
      observer = null;
      return;
    }
  }
}

function queueRootForScan(root: Node): void {
  queuedRoots.add(root);
  if (pendingScanTimeoutId != null) {
    return;
  }

  pendingScanTimeoutId = window.setTimeout(flushQueuedRoots, SCAN_DEBOUNCE_MS);
}

function startMutationObserver(): void {
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const addedNode of Array.from(mutation.addedNodes)) {
        if (highlightedCount >= MAX_HIGHLIGHTS) {
          observer?.disconnect();
          observer = null;
          return;
        }

        queueRootForScan(addedNode);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.setTimeout(() => {
    observer?.disconnect();
    observer = null;
  }, OBSERVER_LIFETIME_MS);
}

async function loadDictionaryIndex(): Promise<StockDictionaryIndex | null> {
  const runtime = getExtensionRuntime();
  if (!runtime) {
    return null;
  }

  try {
    const response = await runtime.sendMessage({
      type: "stocks:get-dictionary",
    });
    if (!response?.ok || !response.stockDictionary) {
      return null;
    }

    return buildStockDictionaryIndex(response.stockDictionary);
  } catch {
    return null;
  }
}

async function initialize(): Promise<void> {
  if (!document.body || !document.head) {
    return;
  }

  injectStyles();
  ensurePopup();

  dictionaryIndex = await loadDictionaryIndex();
  if (!dictionaryIndex) {
    return;
  }

  window.setTimeout(() => {
    queueRootForScan(document.body);
    startMutationObserver();
  }, INITIAL_SCAN_DELAY_MS);
}

if (window.__indiaCircleTickerHighlighterVersion !== CONTENT_SCRIPT_VERSION) {
  window.__indiaCircleTickerHighlighterVersion = CONTENT_SCRIPT_VERSION;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        void initialize();
      },
      { once: true }
    );
  } else {
    void initialize();
  }
}
