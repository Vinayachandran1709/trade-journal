const INITIAL_SCAN_DELAY_MS = 500;
const HIDE_DELAY_MS = 200;
const MAX_HIGHLIGHTS = 30;
const OBSERVER_LIFETIME_MS = 30_000;
const POPUP_WIDTH = 300;
const VIEWPORT_PADDING = 12;

const COMPANY_NAME_MAP: Record<string, string> = {
  "reliance": "RELIANCE",
  "reliance industries": "RELIANCE",
  "tcs": "TCS",
  "tata consultancy": "TCS",
  "tata consultancy services": "TCS",
  "hdfc bank": "HDFCBANK",
  "hdfcbank": "HDFCBANK",
  "infosys": "INFY",
  "infy": "INFY",
  "icici bank": "ICICIBANK",
  "icicibank": "ICICIBANK",
  "hindustan unilever": "HINDUNILVR",
  "hul": "HINDUNILVR",
  "itc": "ITC",
  "sbi": "SBIN",
  "state bank": "SBIN",
  "state bank of india": "SBIN",
  "bharti airtel": "BHARTIARTL",
  "airtel": "BHARTIARTL",
  "kotak mahindra": "KOTAKBANK",
  "kotak bank": "KOTAKBANK",
  "larsen": "LT",
  "larsen & toubro": "LT",
  "l&t": "LT",
  "hcl tech": "HCLTECH",
  "hcltech": "HCLTECH",
  "axis bank": "AXISBANK",
  "asian paints": "ASIANPAINT",
  "maruti": "MARUTI",
  "maruti suzuki": "MARUTI",
  "sun pharma": "SUNPHARMA",
  "sun pharmaceutical": "SUNPHARMA",
  "titan": "TITAN",
  "bajaj finance": "BAJFINANCE",
  "bajfinance": "BAJFINANCE",
  "wipro": "WIPRO",
  "tata motors": "TATAMOTORS",
  "tata steel": "TATASTEEL",
  "tata power": "TATAPOWER",
  "bajaj finserv": "BAJAJFINSV",
  "jsw steel": "JSWSTEEL",
  "ongc": "ONGC",
  "adani enterprises": "ADANIENT",
  "adani ports": "ADANIPORTS",
  "adani green": "ADANIGREEN",
  "coal india": "COALINDIA",
  "tech mahindra": "TECHM",
  "indusind bank": "INDUSINDBK",
  "hindalco": "HINDALCO",
  "bpcl": "BPCL",
  "dr reddy": "DRREDDY",
  "dr. reddy": "DRREDDY",
  "cipla": "CIPLA",
  "apollo hospitals": "APOLLOHOSP",
  "britannia": "BRITANNIA",
  "dabur": "DABUR",
  "vedanta": "VEDL",
  "gail": "GAIL",
  "ioc": "IOC",
  "indian oil": "IOC",
  "irctc": "IRCTC",
  "zomato": "ZOMATO",
  "nykaa": "NYKAA",
  "delhivery": "DELHIVERY",
  "policybazaar": "POLICYBZR",
  "ntpc": "NTPC",
  "power grid": "POWERGRID",
  "bajaj auto": "BAJAJ-AUTO",
  "havells": "HAVELLS",
  "voltas": "VOLTAS",
  "pnb": "PNB",
  "bank of baroda": "BANKBARODA",
  "canara bank": "CANBK",
  "lic": "LICI",
  "adani power": "ADANIPOWER",
  "nestle": "NESTLEIND",
  "nestle india": "NESTLEIND",
  "ultratech": "ULTRACEMCO",
  "ultratech cement": "ULTRACEMCO",
  "hero motocorp": "HEROMOTOCO",
  "eicher motors": "EICHERMOT",
  "divis lab": "DIVISLAB",
  "divis laboratories": "DIVISLAB",
  "grasim": "GRASIM",
  "persistent": "PERSISTENT",
  "coforge": "COFORGE",
  "mphasis": "MPHASIS",
  "naukri": "NAUKRI",
  "trent": "TRENT",
  "polycab": "POLYCAB",
  "crompton": "CROMPTON",
  "au bank": "AUBANK",
  "federal bank": "FEDERALBNK",
  "bandhan bank": "BANDHANBNK",
  "muthoot finance": "MUTHOOTFIN",
  "hdfc life": "HDFCLIFE",
  "sbi life": "SBILIFE",
  "tata consumer": "TATACONSUM",
  "pidilite": "PIDILITIND",
  "page industries": "PAGEIND",
  "jio financial": "JIOFIN",
  "nhpc": "NHPC",
  "sjvn": "SJVN",
  "rec": "RECLTD",
  "pfc": "PFC",
};

const COMPANY_NAMES_SORTED = Object.keys(COMPANY_NAME_MAP).sort(
  (a, b) => b.length - a.length
);

const TICKER_SET = new Set([
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR", "ITC",
  "SBIN", "BHARTIARTL", "KOTAKBANK", "LT", "HCLTECH", "AXISBANK", "ASIANPAINT",
  "MARUTI", "SUNPHARMA", "TITAN", "BAJFINANCE", "WIPRO", "ULTRACEMCO",
  "NESTLEIND", "NTPC", "POWERGRID", "TATAMOTORS", "TATASTEEL",
  "BAJAJFINSV", "JSWSTEEL", "ONGC", "ADANIENT", "ADANIPORTS",
  "COALINDIA", "GRASIM", "TECHM", "INDUSINDBK", "HINDALCO", "BPCL",
  "DRREDDY", "CIPLA", "EICHERMOT", "DIVISLAB", "APOLLOHOSP", "HEROMOTOCO",
  "TATACONSUM", "SBILIFE", "BRITANNIA", "HDFCLIFE", "DABUR", "PIDILITIND",
  "VEDL", "GAIL", "IOC", "IRCTC", "ZOMATO", "NYKAA",
  "DELHIVERY", "POLICYBZR", "BANDHANBNK", "FEDERALBNK", "IDFCFIRSTB",
  "MUTHOOTFIN", "TRENT", "PERSISTENT", "COFORGE", "MPHASIS",
  "LTIM", "LTTS", "NAUKRI", "DEEPAKNTR", "PIIND", "ASTRAL",
  "VOLTAS", "HAVELLS", "POLYCAB", "CROMPTON", "WHIRLPOOL",
  "PAGEIND", "ABCAPITAL", "AUBANK", "BANKBARODA", "CANBK",
  "PNB", "RECLTD", "PFC", "NHPC", "SJVN", "TATAPOWER",
  "ADANIGREEN", "ADANIENSOL", "JIOFIN", "BAJAJ-AUTO",
]);

const EXCLUDED_WORDS = new Set([
  "IT", "OR", "AM", "PM", "IS", "AS", "AT", "BE", "DO", "GO",
  "IF", "IN", "NO", "OF", "ON", "SO", "TO", "UP", "US", "WE",
  "AN", "BY", "MY", "ALL", "CAN", "FOR", "HAS", "HAD", "HER",
  "HIM", "HIS", "HOW", "ITS", "LET", "MAY", "NEW", "NOW", "OLD",
  "OUR", "OWN", "SAY", "SHE", "THE", "TOO", "USE", "WAY", "WHO",
  "BOY", "DID", "GET", "HAS", "HIM", "MAN", "RUN", "TOP",
]);

const TICKER_REGEX = /\b([A-Z][A-Z0-9-]{1,19})\b/g;
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

const tickerCache = new Map<string, TickerIntelResponse>();
const pendingRequests = new Map<string, Promise<TickerIntelResponse>>();

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
  width: 300px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12);
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
  color: #1f2937;
  pointer-events: auto;
  transition: opacity 0.15s ease;
}

.sf-ticker-popup .sf-price { font-size: 20px; font-weight: 700; }
.sf-ticker-popup .sf-change-positive { color: #16a34a; }
.sf-ticker-popup .sf-change-negative { color: #dc2626; }
.sf-ticker-popup .sf-section { margin-top: 10px; padding-top: 8px; border-top: 1px solid #f3f4f6; }
.sf-ticker-popup .sf-label { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
.sf-ticker-popup .sf-disclaimer { font-size: 10px; color: #d1d5db; margin-top: 10px; }
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

  popup = document.createElement("div");
  popup.className = "sf-ticker-popup";
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

function formatChange(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${formatMoney(value)}`;
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

function renderLoading(symbol: string): void {
  ensurePopup().innerHTML = `<strong>${escapeHtml(symbol)}</strong> Loading...`;
}

function renderError(symbol: string): void {
  ensurePopup().innerHTML = `<strong>${escapeHtml(symbol)}</strong> Data unavailable`;
}

function renderData(data: TickerIntelResponse): void {
  const changeValue = data.change_pct ?? data.change ?? 0;
  const isPositive = changeValue >= 0;
  const changeClass = isPositive ? "sf-change-positive" : "sf-change-negative";
  const arrow = isPositive ? "▲" : "▼";
  const sentimentClass = data.sentiment_line.toLowerCase().includes("negative")
    ? " negative"
    : "";

  ensurePopup().innerHTML = `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px">
        <strong>${escapeHtml(data.symbol)}</strong>
        <span class="sf-label">${escapeHtml(data.sector ?? "Sector")}</span>
      </div>
      <div class="sf-price">₹${escapeHtml(formatMoney(data.price))}</div>
      <div class="${changeClass}">${arrow} ${escapeHtml(formatChange(data.change))} (${escapeHtml(formatChange(data.change_pct))}%)</div>

      <div class="sf-section">
        <div class="sf-label">52 Week Range</div>
        <div style="display:flex;justify-content:space-between;font-size:11px">
          <span>₹${escapeHtml(formatMoney(data.low_52w))}</span><span>₹${escapeHtml(formatMoney(data.high_52w))}</span>
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

      <div class="sf-disclaimer">${escapeHtml(data.disclaimer)}</div>
    </div>
  `;
}

function fetchTickerIntel(symbol: string): Promise<TickerIntelResponse> {
  const cached = tickerCache.get(symbol);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingRequests.get(symbol);
  if (pending) {
    return pending;
  }

  const request = chrome.runtime.sendMessage({
    type: "ticker:fetch-intel",
    payload: { symbol },
  }).then((response) => {
    if (!response?.ok || !response.tickerIntel) {
      throw new Error(response?.error || "Data unavailable");
    }

    return response.tickerIntel as TickerIntelResponse;
  }).then((data) => {
    tickerCache.set(symbol, data);
    pendingRequests.delete(symbol);
    return data;
  }).catch((error) => {
    pendingRequests.delete(symbol);
    throw error;
  });

  pendingRequests.set(symbol, request);
  return request;
}

function onTickerMouseEnter(event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement;
  const symbol = target.dataset.ticker;
  if (!symbol) {
    return;
  }

  const hoverId = ++activeHoverId;
  cancelHidePopup();
  renderLoading(symbol);
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

      renderError(symbol);
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

function hasWordBoundary(
  lowerText: string,
  start: number,
  end: number
): boolean {
  const charBefore = start > 0 ? lowerText[start - 1] : " ";
  const charAfter = end < lowerText.length ? lowerText[end] : " ";
  const boundaryPattern = /[\s,.;:!?()[\]{}|/\\]/;

  return (
    (start === 0 || boundaryPattern.test(charBefore)) &&
    (end === lowerText.length || boundaryPattern.test(charAfter))
  );
}

function overlapsUsedRange(used: Set<number>, start: number, end: number): boolean {
  for (let position = start; position < end; position += 1) {
    if (used.has(position)) {
      return true;
    }
  }

  return false;
}

function markUsedRange(used: Set<number>, start: number, end: number): void {
  for (let position = start; position < end; position += 1) {
    used.add(position);
  }
}

function findTickerMatches(
  text: string
): Array<{ start: number; end: number; ticker: string }> {
  const matches: Array<{ start: number; end: number; ticker: string }> = [];
  const lowerText = text.toLowerCase();
  const used = new Set<number>();

  for (const companyName of COMPANY_NAMES_SORTED) {
    let searchFrom = 0;

    while (searchFrom < lowerText.length) {
      const start = lowerText.indexOf(companyName, searchFrom);
      if (start === -1) {
        break;
      }

      const end = start + companyName.length;
      if (
        hasWordBoundary(lowerText, start, end) &&
        !overlapsUsedRange(used, start, end)
      ) {
        matches.push({
          start,
          end,
          ticker: COMPANY_NAME_MAP[companyName],
        });
        markUsedRange(used, start, end);
      }

      searchFrom = start + 1;
    }
  }

  TICKER_REGEX.lastIndex = 0;
  let regexMatch: RegExpExecArray | null;

  while ((regexMatch = TICKER_REGEX.exec(text)) !== null) {
    const symbol = regexMatch[1];
    const start = regexMatch.index;
    const end = start + symbol.length;

    if (!TICKER_SET.has(symbol) || EXCLUDED_WORDS.has(symbol)) {
      continue;
    }

    if (!overlapsUsedRange(used, start, end)) {
      matches.push({ start, end, ticker: symbol });
      markUsedRange(used, start, end);
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}

function highlightTextNode(textNode: Text): void {
  if (highlightedCount >= MAX_HIGHLIGHTS || isSkippableTextNode(textNode)) {
    return;
  }

  const text = textNode.nodeValue ?? "";
  if (text.trim().length < 2) {
    return;
  }

  const matches = findTickerMatches(text);
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
    span.dataset.ticker = match.ticker;
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

function scanRoot(root: Node): void {
  if (highlightedCount >= MAX_HIGHLIGHTS) {
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

  while (walker.nextNode()) {
    highlightTextNode(walker.currentNode as Text);

    if (highlightedCount >= MAX_HIGHLIGHTS) {
      break;
    }
  }
}

function startMutationObserver(): void {
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const addedNode of Array.from(mutation.addedNodes)) {
        scanRoot(addedNode);

        if (highlightedCount >= MAX_HIGHLIGHTS) {
          observer?.disconnect();
          observer = null;
          return;
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.setTimeout(() => {
    observer?.disconnect();
    observer = null;
  }, OBSERVER_LIFETIME_MS);
}

function initialize(): void {
  if (!document.body || !document.head) {
    return;
  }

  injectStyles();
  ensurePopup();

  window.setTimeout(() => {
    scanRoot(document.body);
    startMutationObserver();
  }, INITIAL_SCAN_DELAY_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
  initialize();
}
