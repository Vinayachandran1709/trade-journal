import {
  APIError,
  fetchTickerIntel,
  type TickerIntelResponse,
} from "../shared/api";

const MAX_HIGHLIGHTS = 20;
const INITIAL_SCAN_DELAY_MS = 500;
const HIDE_DELAY_MS = 200;
const OBSERVER_LIFETIME_MS = 30_000;
const INITIAL_SCAN_BUDGET_MS = 45;
const POPUP_WIDTH = 280;

const TICKER_SYMBOLS = new Set([
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR", "ITC",
  "SBIN", "BHARTIARTL", "KOTAKBANK", "LT", "HCLTECH", "AXISBANK", "ASIANPAINT",
  "MARUTI", "SUNPHARMA", "TITAN", "BAJFINANCE", "WIPRO", "ULTRACEMCO",
  "NESTLEIND", "NTPC", "POWERGRID", "M&M", "TATAMOTORS", "TATASTEEL",
  "BAJAJFINSV", "JSWSTEEL", "ONGC", "ADANIGREEN", "ADANIENT", "ADANIPORTS",
  "COALINDIA", "GRASIM", "TECHM", "INDUSINDBK", "HINDALCO", "BPCL",
  "DRREDDY", "CIPLA", "EICHERMOT", "DIVISLAB", "APOLLOHOSP", "HEROMOTOCO",
  "TATACONSUM", "SBILIFE", "BRITANNIA", "HDFCLIFE", "DABUR", "PIDILITIND",
  "BAJAJ-AUTO", "VEDL", "GAIL", "IOC", "IRCTC", "ZOMATO", "PAYTM",
  "NYKAA", "DELHIVERY", "POLICYBZR", "AMBUJACEM", "SIEMENS", "DLF",
  "SHRIRAMFIN", "MOTHERSON", "HAL", "BHEL", "TORNTPHARM", "ABB",
  "TVSMOTOR", "INDIGO", "BEL", "CANBK", "BANKBARODA", "PNB",
  "IDBI", "JINDALSTEL", "NAUKRI", "UPL", "LUPIN", "GODREJCP",
  "COLPAL", "PAGEIND", "HAVELLS", "BERGEPAINT", "INDUSTOWER", "TATAPOWER",
  "TRENT", "PFC", "RECLTD", "ADANIPOWER", "SUZLON", "TATATECH",
  "DMART", "LODHA", "OBEROIRLTY", "PRESTIGE", "FEDERALBNK", "BANDHANBNK",
  "RBLBANK", "AUROPHARMA", "BIOCON", "ALKEM", "GLENMARK", "ZYDUSLIFE",
  "MANKIND", "ABBOTINDIA", "SANOFI", "IPCALAB", "ASHOKLEY", "ESCORTS",
  "BOSCHLTD", "EXIDEIND", "MRF", "BALKRISIND", "APOLLOTYRE", "MRF",
  "MGL", "PETRONET", "IGL", "HINDPETRO", "OIL", "SAIL",
  "NMDC", "NATIONALUM", "JSL", "JSWINFRA", "RVNL", "IRFC",
  "CONCOR", "NBCC", "PNCINFRA", "KEC", "KALPATPOWR", "LTIM",
  "PERSISTENT", "MPHASIS", "OFSS", "LTTS", "COFORGE", "SONATSOFTW",
  "TATAELXSI", "KPITTECH", "POLYCAB", "CUMMINSIND", "APLAPOLLO", "VOLTAS",
  "WHIRLPOOL", "BLUESTARCO", "ASTRAL", "SUPREMEIND", "KANSAINER",
  "RAMCOCEM", "SHREECEM", "ACC", "DALBHARAT", "JKCEMENT", "MANAPPURAM",
  "MUTHOOTFIN", "BAJAJHLDNG", "CHOLAFIN", "LICHSGFIN", "MFSL", "ICICIPRULI",
  "GODREJPROP", "PHOENIXLTD", "SUNTV", "ZEEL", "PVRINOX", "INOXWIND",
  "BSE", "MCX", "CDSL", "CDSL", "ANGELONE", "360ONE", "IEX",
  "CAMS", "HONAUT", "SKFINDIA", "SCHAEFFLER", "THERMAX", "AIAENG",
  "GUJGASLTD", "ATGL", "HDFCAMC", "NAM-INDIA", "ABFRL", "UNITDSPR",
  "UBL", "VBL", "MARICO", "EMAMILTD", "PATANJALI", "FORTIS",
  "MAXHEALTH", "LALPATHLAB", "METROPOLIS", "JUBLPHARMA", "JUBLFOOD",
  "DEVYANI", "VGUARD", "FINCABLES", "CGPOWER", "BATAINDIA", "TRIDENT",
  "TATACHEM", "DEEPAKNTR", "NAVINFLUOR", "PIIND", "SOLARINDS", "FACT",
  "COROMANDEL", "CHAMBLFERT", "INDIAMART", "EASEMYTRIP", "GRAPHITE",
  "ADANIWILMAR", "YESBANK", "UNIONBANK", "IDFCFIRSTB", "HFCL", "MAZDOCK",
]);

const EXCLUDED_WORDS = new Set([
  "IT", "OR", "AM", "PM", "IS", "AS", "AT", "BE", "DO", "GO",
  "IF", "IN", "NO", "OF", "ON", "SO", "TO", "UP", "US", "WE", "AN", "BY", "MY",
]);

const TOKEN_REGEX = /[A-Z][A-Z0-9&-]{1,}/g;
const EXCLUDED_TAGS = new Set([
  "INPUT",
  "TEXTAREA",
  "SCRIPT",
  "STYLE",
  "CODE",
  "PRE",
]);

let highlightCount = 0;
let popupEl: HTMLDivElement | null = null;
let hideTimeoutId: number | null = null;
let observer: MutationObserver | null = null;
let queuedRoots: Node[] = [];
let queueScheduled = false;
let hoverSessionId = 0;

const dataCache = new Map<string, TickerIntelResponse>();
const pendingCache = new Map<string, Promise<TickerIntelResponse>>();

function shouldActivate(): boolean {
  const textLength = document.body?.innerText?.trim().length ?? 0;
  return textLength >= 100;
}

function injectStyles() {
  if (document.getElementById("sf-ticker-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "sf-ticker-style";
  style.textContent = `
    .sf-ticker-highlight {
      border-bottom: 1px dashed #6366f1;
      cursor: pointer;
      color: inherit;
    }

    .sf-ticker-popup {
      position: fixed;
      z-index: 999999;
      width: 280px;
      max-height: 300px;
      overflow: auto;
      border-radius: 14px;
      border: 1px solid rgba(148, 163, 184, 0.25);
      background: #ffffff;
      box-shadow: 0 18px 42px rgba(15, 23, 42, 0.22);
      padding: 14px;
      color: #0f172a;
      font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: none;
    }

    .sf-ticker-popup * {
      box-sizing: border-box;
    }

    .sf-ticker-popup__row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }

    .sf-ticker-popup__symbol {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
    }

    .sf-ticker-popup__price {
      margin-top: 2px;
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
    }

    .sf-ticker-popup__change {
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }

    .sf-ticker-popup__change--positive {
      background: rgba(22, 163, 74, 0.12);
      color: #15803d;
    }

    .sf-ticker-popup__change--negative {
      background: rgba(220, 38, 38, 0.12);
      color: #b91c1c;
    }

    .sf-ticker-popup__section {
      margin-top: 12px;
    }

    .sf-ticker-popup__label {
      display: block;
      margin-bottom: 4px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
      font-weight: 700;
    }

    .sf-ticker-popup__range {
      position: relative;
      height: 8px;
      border-radius: 999px;
      background: #e2e8f0;
      margin: 8px 0 6px;
    }

    .sf-ticker-popup__range-marker {
      position: absolute;
      top: 50%;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #2563eb;
      border: 2px solid #ffffff;
      box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.2);
      transform: translate(-50%, -50%);
    }

    .sf-ticker-popup__range-ends {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      color: #64748b;
    }

    .sf-ticker-popup__tag {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      background: #eef2ff;
      color: #4338ca;
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 700;
    }

    .sf-ticker-popup__sentiment {
      color: #1e293b;
      font-weight: 600;
    }

    .sf-ticker-popup__muted {
      color: #64748b;
    }

    .sf-ticker-popup__disclaimer {
      margin-top: 12px;
      color: #94a3b8;
      font-size: 10px;
      line-height: 1.4;
    }
  `;
  document.documentElement.appendChild(style);
}

function ensurePopup(): HTMLDivElement {
  if (popupEl) {
    return popupEl;
  }

  popupEl = document.createElement("div");
  popupEl.className = "sf-ticker-popup";
  popupEl.addEventListener("mouseenter", cancelHidePopup);
  popupEl.addEventListener("mouseleave", scheduleHidePopup);
  document.documentElement.appendChild(popupEl);
  return popupEl;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

function formatVolume(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function getRangePosition(data: TickerIntelResponse): number {
  if (
    data.high_52w == null ||
    data.low_52w == null ||
    data.price == null ||
    data.high_52w <= data.low_52w
  ) {
    return 50;
  }

  const ratio = (data.price - data.low_52w) / (data.high_52w - data.low_52w);
  return Math.min(100, Math.max(0, ratio * 100));
}

function renderLoadingPopup(symbol: string) {
  const popup = ensurePopup();
  popup.innerHTML = `
    <div class="sf-ticker-popup__row">
      <div>
        <div class="sf-ticker-popup__symbol">${escapeHtml(symbol)}</div>
        <div class="sf-ticker-popup__muted">Loading...</div>
      </div>
    </div>
  `;
}

function renderErrorPopup(symbol: string, message: string) {
  const popup = ensurePopup();
  popup.innerHTML = `
    <div class="sf-ticker-popup__row">
      <div>
        <div class="sf-ticker-popup__symbol">${escapeHtml(symbol)}</div>
        <div class="sf-ticker-popup__muted">${escapeHtml(message)}</div>
      </div>
    </div>
  `;
}

function renderDataPopup(data: TickerIntelResponse) {
  const popup = ensurePopup();
  const isPositive = data.change_pct >= 0;
  const rangePosition = getRangePosition(data);
  const changeClass = isPositive
    ? "sf-ticker-popup__change sf-ticker-popup__change--positive"
    : "sf-ticker-popup__change sf-ticker-popup__change--negative";
  const signedChange = `${data.change_pct >= 0 ? "+" : ""}${formatNumber(data.change)} (${data.change_pct >= 0 ? "+" : ""}${formatNumber(data.change_pct)}%)`;

  popup.innerHTML = `
    <div class="sf-ticker-popup__row">
      <div>
        <div class="sf-ticker-popup__symbol">${escapeHtml(data.symbol)}</div>
        <div class="sf-ticker-popup__price">₹${escapeHtml(formatNumber(data.price))}</div>
      </div>
      <span class="${changeClass}">${escapeHtml(signedChange)}</span>
    </div>

    <div class="sf-ticker-popup__section">
      <span class="sf-ticker-popup__label">52 Week Range</span>
      <div class="sf-ticker-popup__range">
        <span class="sf-ticker-popup__range-marker" style="left: ${rangePosition}%"></span>
      </div>
      <div class="sf-ticker-popup__range-ends">
        <span>Low ₹${escapeHtml(formatNumber(data.low_52w))}</span>
        <span>High ₹${escapeHtml(formatNumber(data.high_52w))}</span>
      </div>
    </div>

    <div class="sf-ticker-popup__section">
      <span class="sf-ticker-popup__label">Volume</span>
      <div>${escapeHtml(data.volume_vs_avg)} (${escapeHtml(formatVolume(data.volume))})</div>
    </div>

    <div class="sf-ticker-popup__section">
      <span class="sf-ticker-popup__label">Sentiment</span>
      <div class="sf-ticker-popup__sentiment">${escapeHtml(data.sentiment_line)}</div>
    </div>

    ${
      data.sector
        ? `<div class="sf-ticker-popup__section"><span class="sf-ticker-popup__tag">${escapeHtml(data.sector)}</span></div>`
        : ""
    }

    <div class="sf-ticker-popup__disclaimer">${escapeHtml(data.disclaimer)}</div>
  `;
}

function positionPopup(clientX: number, clientY: number) {
  const popup = ensurePopup();
  popup.style.display = "block";

  const rect = popup.getBoundingClientRect();
  const left = Math.min(
    Math.max(12, clientX + 12),
    window.innerWidth - Math.min(POPUP_WIDTH, rect.width) - 12
  );
  const showAbove = clientY + rect.height + 18 > window.innerHeight;
  const top = showAbove
    ? Math.max(12, clientY - rect.height - 14)
    : Math.max(12, clientY + 14);

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function hidePopup() {
  cancelHidePopup();
  hoverSessionId += 1;
  if (popupEl) {
    popupEl.style.display = "none";
  }
}

function scheduleHidePopup() {
  cancelHidePopup();
  hideTimeoutId = window.setTimeout(() => {
    hidePopup();
  }, HIDE_DELAY_MS);
}

function cancelHidePopup() {
  if (hideTimeoutId != null) {
    window.clearTimeout(hideTimeoutId);
    hideTimeoutId = null;
  }
}

function getTickerData(symbol: string): Promise<TickerIntelResponse> {
  const cached = dataCache.get(symbol);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingCache.get(symbol);
  if (pending) {
    return pending;
  }

  const request = fetchTickerIntel(symbol)
    .then((response) => {
      dataCache.set(symbol, response);
      pendingCache.delete(symbol);
      return response;
    })
    .catch((error) => {
      pendingCache.delete(symbol);
      throw error;
    });

  pendingCache.set(symbol, request);
  return request;
}

function attachHighlightEvents(element: HTMLElement, symbol: string) {
  element.addEventListener("mouseenter", (event) => {
    const sessionId = ++hoverSessionId;
    cancelHidePopup();
    renderLoadingPopup(symbol);
    positionPopup(event.clientX, event.clientY);

    void getTickerData(symbol)
      .then((data) => {
        if (sessionId !== hoverSessionId) {
          return;
        }
        renderDataPopup(data);
        positionPopup(event.clientX, event.clientY);
      })
      .catch((error) => {
        if (sessionId !== hoverSessionId) {
          return;
        }
        const message =
          error instanceof APIError && error.status === 429
            ? "Daily limit reached for this data feed."
            : "Ticker data unavailable right now.";
        renderErrorPopup(symbol, message);
        positionPopup(event.clientX, event.clientY);
      });
  });

  element.addEventListener("mouseleave", () => {
    scheduleHidePopup();
  });
}

function isExcludedTextNode(textNode: Text): boolean {
  const parent = textNode.parentElement;
  if (!parent) {
    return true;
  }

  if (parent.closest(".sf-ticker-popup, .sf-ticker-highlight")) {
    return true;
  }

  if (parent.closest("[contenteditable='true']")) {
    return true;
  }

  if (EXCLUDED_TAGS.has(parent.tagName)) {
    return true;
  }

  return Boolean(parent.closest("input, textarea, script, style, code, pre"));
}

function highlightTextNode(textNode: Text) {
  if (highlightCount >= MAX_HIGHLIGHTS || isExcludedTextNode(textNode)) {
    return;
  }

  const text = textNode.nodeValue ?? "";
  if (!/[A-Z]{2,}/.test(text)) {
    return;
  }

  const matches = Array.from(text.matchAll(TOKEN_REGEX)).filter((match) => {
    const token = match[0];
    return TICKER_SYMBOLS.has(token) && !EXCLUDED_WORDS.has(token);
  });

  if (matches.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();
  let cursor = 0;
  let replacements = 0;

  for (const match of matches) {
    if (highlightCount >= MAX_HIGHLIGHTS) {
      break;
    }

    const token = match[0];
    const index = match.index ?? -1;
    if (index < cursor) {
      continue;
    }

    fragment.append(text.slice(cursor, index));

    const span = document.createElement("span");
    span.className = "sf-ticker-highlight";
    span.dataset.ticker = token;
    span.textContent = token;
    attachHighlightEvents(span, token);
    fragment.append(span);

    cursor = index + token.length;
    replacements += 1;
    highlightCount += 1;
  }

  if (replacements === 0) {
    return;
  }

  fragment.append(text.slice(cursor));
  textNode.parentNode?.replaceChild(fragment, textNode);
}

function scanRoot(root: Node, timeBudgetMs = INITIAL_SCAN_BUDGET_MS) {
  if (highlightCount >= MAX_HIGHLIGHTS) {
    return;
  }

  const startTime = performance.now();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (highlightCount >= MAX_HIGHLIGHTS) {
        return NodeFilter.FILTER_REJECT;
      }

      const textNode = node as Text;
      if (!textNode.nodeValue?.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      if (isExcludedTextNode(textNode)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    if (performance.now() - startTime > timeBudgetMs) {
      break;
    }

    highlightTextNode(walker.currentNode as Text);
  }
}

function flushQueuedNodes() {
  queueScheduled = false;
  const roots = queuedRoots;
  queuedRoots = [];

  for (const root of roots) {
    if (highlightCount >= MAX_HIGHLIGHTS) {
      break;
    }

    if (root.nodeType === Node.TEXT_NODE) {
      highlightTextNode(root as Text);
      continue;
    }

    scanRoot(root, 20);
  }
}

function queueNodeForScan(node: Node) {
  if (highlightCount >= MAX_HIGHLIGHTS) {
    return;
  }

  queuedRoots.push(node);
  if (!queueScheduled) {
    queueScheduled = true;
    window.setTimeout(flushQueuedNodes, 120);
  }
}

function startObserver() {
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (highlightCount >= MAX_HIGHLIGHTS) {
          return;
        }

        if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE) {
          queueNodeForScan(node);
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

function initializeTickerHighlighter() {
  if (!document.body || !shouldActivate()) {
    return;
  }

  injectStyles();
  ensurePopup();
  window.setTimeout(() => {
    scanRoot(document.body);
    startObserver();
  }, INITIAL_SCAN_DELAY_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeTickerHighlighter, {
    once: true,
  });
} else {
  initializeTickerHighlighter();
}
