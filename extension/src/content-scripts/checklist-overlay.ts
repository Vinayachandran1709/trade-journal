const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const ROOT_ID = "indiacircle-checklist-overlay";

type Template = { id: number; checklist_items: string[] | null };
type Score = {
  risk_score: number;
  risk_level: "LOW" | "MODERATE" | "HIGH";
  factors: Array<{ factor: string; detail: string; impact: "positive" | "neutral" | "negative" }>;
  warning?: string | null;
};

let dismissed = false;
let minimized = false;
let currentScore: Score | null = null;
let savedSetupId: number | null = null;

function isBrokerOrderVisible(): boolean {
  const host = location.hostname;
  const path = location.pathname.toLowerCase();
  const text = document.body.innerText.toLowerCase();
  if (host.includes("kite.zerodha.com")) {
    return Boolean(document.querySelector(".order-window, .order-window-layer")) || /\border\b/.test(text);
  }
  if (host.includes("groww.in")) {
    return location.pathname.includes("/stocks/") && /(quantity|market price|limit price)/i.test(text);
  }
  if (host.includes("dhan.co")) {
    return /order|orderbook|trade|position|portfolio|buy|sell/.test(path) || /(quantity|limit price|market price|stop loss|target)/i.test(text);
  }
  if (host.includes("angelone.in") || host.includes("angelbroking.com")) {
    return /order|trade|position|buy|sell/.test(path) || /(quantity|limit price|market price|product type)/i.test(text);
  }
  if (host.includes("upstox.com")) {
    return /order|trade|position|buy|sell/.test(path) || /(quantity|limit price|market price|order type)/i.test(text);
  }
  if (host.includes("5paisa.com")) {
    return /order|trade|position|buy|sell/.test(path) || /(quantity|limit price|market price|order type)/i.test(text);
  }
  return false;
}

function detectSymbol(): string {
  const pathSymbol = location.pathname.split("/").filter(Boolean).pop();
  const selected = document.querySelector("[data-symbol], .tradingsymbol, .stock-name");
  const raw = selected?.textContent || pathSymbol || "";
  return raw.replace(/[^A-Za-z0-9&-]/g, "").slice(0, 50).toUpperCase() || "SYMBOL";
}

function detectEntryPrice(): string {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input"));
  const priceInput = inputs.find((input) => /price|limit|market/i.test(input.placeholder || input.name || input.id));
  if (priceInput?.value) return priceInput.value;
  const priceText = document.body.innerText.match(/(?:₹|Rs\.?)\s*([\d,.]+)/i)?.[1];
  return priceText?.replace(/,/g, "") || "";
}

async function getToken(): Promise<string> {
  const response = await chrome.runtime.sendMessage({ type: "auth:get-token" });
  if (!response?.ok || !response.token) throw new Error("Sign in from the IndiaCircle extension first.");
  return response.token;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    if (response.status === 403 && path.includes("/score")) {
      throw new Error("🔒 Upgrade to Pro for risk assessment");
    }
    throw new Error(error.detail || "Request failed");
  }
  return response.json() as Promise<T>;
}

async function loadChecklist(): Promise<string[]> {
  const templates = await api<Template[]>("/api/setups/templates");
  return templates[0]?.checklist_items?.length
    ? templates[0].checklist_items
    : [
        "Checked higher timeframe trend",
        "No major event in next 24 hours",
        "Position size within my risk limit",
        "Not trading after 3+ losses today",
        "R:R ratio is at least 1:2",
      ];
}

function styleForScore(score: number): string {
  if (score <= 3) return "#16a34a";
  if (score <= 6) return "#d97706";
  return "#dc2626";
}

function formValue(root: HTMLElement, name: string): string {
  return (root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement)?.value || "";
}

async function assess(root: HTMLElement) {
  setStatus(root, "Assessing risk...");
  const checklist: Record<string, boolean> = {};
  root.querySelectorAll<HTMLInputElement>("[data-check-item]").forEach((input) => {
    checklist[input.value] = input.checked;
  });
  const entry = Number(formValue(root, "entry_price"));
  const stop = Number(formValue(root, "stop_loss_price"));
  const qty = Number(formValue(root, "position_size") || "1");
  const payload = {
    symbol: formValue(root, "symbol"),
    thesis: formValue(root, "thesis"),
    entry_price: entry,
    stop_loss_price: stop,
    target_price: Number(formValue(root, "target_price")),
    conviction_score: Number(formValue(root, "conviction_score")),
    checklist_responses: checklist,
    position_size: qty,
    risk_amount: Math.abs(entry - stop) * qty,
  };
  const setup = await api<{ id: number }>("/api/setups/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  savedSetupId = setup.id;
  currentScore = await api<Score>(`/api/setups/${setup.id}/score`);
  render();
}

function setStatus(root: HTMLElement, message: string) {
  const status = root.querySelector(".ic-status");
  if (status) status.textContent = message;
}

function attachDrag(root: HTMLElement) {
  const header = root.querySelector<HTMLElement>(".ic-header");
  if (!header) return;
  let startX = 0;
  let startY = 0;
  let startRight = 24;
  let startTop = 90;
  header.onpointerdown = (event) => {
    startX = event.clientX;
    startY = event.clientY;
    startRight = Number(root.dataset.right || "24");
    startTop = Number(root.dataset.top || "90");
    header.setPointerCapture(event.pointerId);
  };
  header.onpointermove = (event) => {
    if (!header.hasPointerCapture(event.pointerId)) return;
    const nextRight = Math.max(8, startRight - (event.clientX - startX));
    const nextTop = Math.max(8, startTop + (event.clientY - startY));
    root.dataset.right = String(nextRight);
    root.dataset.top = String(nextTop);
    root.style.right = `${nextRight}px`;
    root.style.top = `${nextTop}px`;
  };
};

async function render() {
  if (dismissed || !isBrokerOrderVisible()) {
    document.getElementById(ROOT_ID)?.remove();
    return;
  }

  const existing = document.getElementById(ROOT_ID);
  const root = existing || document.createElement("div");
  root.id = ROOT_ID;
  root.style.cssText = `
    position: fixed; top: ${root.dataset.top || "90"}px; right: ${root.dataset.right || "24"}px; z-index: 2147483646;
    width: ${minimized ? "54px" : "300px"}; box-sizing: border-box; font-family: Inter, Segoe UI, sans-serif; color: #0f172a;
  `;

  if (minimized) {
    root.innerHTML = `<button class="ic-mini" title="Open IndiaCircle risk checklist">IC</button>${styles()}`;
    root.querySelector(".ic-mini")?.addEventListener("click", () => {
      minimized = false;
      void render();
    });
    document.body.appendChild(root);
    return;
  }

  const items = await loadChecklist().catch(() => []);
  const symbol = formValue(root, "symbol") || detectSymbol();
  const entry = formValue(root, "entry_price") || detectEntryPrice();
  root.innerHTML = `
    ${styles()}
    <section class="ic-panel">
      <div class="ic-header">
        <strong>Risk Checklist</strong>
        <span>
          <button class="ic-icon" data-min>_</button>
          <button class="ic-icon" data-close>x</button>
        </span>
      </div>
      <label>Symbol<input name="symbol" value="${symbol}" /></label>
      <label>Thesis<textarea name="thesis" maxlength="180" rows="2"></textarea></label>
      <div class="ic-row">
        <label>Entry<input name="entry_price" type="number" step="0.01" value="${entry}" /></label>
        <label>Size<input name="position_size" type="number" min="1" value="1" /></label>
      </div>
      <div class="ic-row">
        <label>Risk level<input name="stop_loss_price" type="number" step="0.01" /></label>
        <label>Target<input name="target_price" type="number" step="0.01" /></label>
      </div>
      <label>Conviction <span class="ic-conv">5</span><input name="conviction_score" type="range" min="1" max="10" value="5" /></label>
      <div class="ic-scale"><span>Low</span><span>Neutral</span><span>Very High</span></div>
      <div class="ic-checks">
        ${items.map((item) => `<label class="ic-check"><input type="checkbox" data-check-item value="${item}" />${item}</label>`).join("")}
      </div>
      <button class="ic-primary" data-assess>Assess Risk</button>
      <p class="ic-status">${savedSetupId ? "Setup logged." : ""}</p>
      ${currentScore ? scoreHtml(currentScore) : ""}
      <button class="ic-secondary" data-proceed>Log Setup & Proceed</button>
    </section>
  `;
  document.body.appendChild(root);
  attachDrag(root);
  root.querySelector("[data-close]")?.addEventListener("click", () => {
    dismissed = true;
    root.remove();
  });
  root.querySelector("[data-min]")?.addEventListener("click", () => {
    minimized = true;
    void render();
  });
  root.querySelector<HTMLInputElement>("[name='conviction_score']")?.addEventListener("input", (event) => {
    const out = root.querySelector(".ic-conv");
    if (out) out.textContent = (event.target as HTMLInputElement).value;
  });
  root.querySelector("[data-assess]")?.addEventListener("click", () => {
    void assess(root).catch((error) => setStatus(root, error instanceof Error ? error.message : "Risk assessment failed."));
  });
  root.querySelector("[data-proceed]")?.addEventListener("click", () => {
    dismissed = true;
    root.remove();
  });
}

function scoreHtml(score: Score): string {
  return `<div class="ic-score" style="border-color:${styleForScore(score.risk_score)}">
    <div><span style="color:${styleForScore(score.risk_score)}">${score.risk_score}</span><small>${score.risk_level}</small></div>
    ${score.warning ? `<p>${score.warning}</p>` : ""}
    ${score.factors.map((f) => `<section class="ic-factor ${f.impact}"><strong>${f.factor.replace(/_/g, " ")}</strong><p>${f.detail}</p></section>`).join("")}
  </div>`;
}

function styles(): string {
  return `<style>
    .ic-panel{background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 18px 50px rgba(15,23,42,.22);padding:12px;display:grid;gap:9px}
    .ic-header{display:flex;justify-content:space-between;align-items:center;cursor:move}.ic-icon{border:0;background:#f1f5f9;border-radius:6px;margin-left:4px;padding:4px 7px;cursor:pointer}
    .ic-panel label{display:grid;gap:4px;font-size:11px;font-weight:700;color:#475569}.ic-panel input,.ic-panel textarea{box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:7px;font:inherit;color:#0f172a}
    .ic-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ic-scale{display:flex;justify-content:space-between;font-size:10px;color:#64748b}.ic-checks{display:grid;gap:6px;max-height:120px;overflow:auto}
    .ic-check{display:flex!important;grid-template-columns:18px 1fr!important;align-items:center;gap:7px;font-weight:500!important}.ic-check input{width:auto}.ic-primary,.ic-secondary{border:0;border-radius:7px;padding:9px 10px;font-weight:700;cursor:pointer}.ic-primary{background:#0f172a;color:#fff}.ic-secondary{background:#e2e8f0;color:#0f172a}
    .ic-status{margin:0;font-size:11px;color:#64748b}.ic-score{border:2px solid;border-radius:8px;padding:8px;display:grid;gap:7px}.ic-score div:first-child{display:flex;align-items:baseline;gap:8px}.ic-score span{font-size:32px;font-weight:800}.ic-score small{font-weight:800}
    .ic-factor{border-radius:6px;padding:7px;background:#f8fafc}.ic-factor p{margin:3px 0 0;font-size:11px}.ic-factor.negative{border-left:3px solid #dc2626}.ic-factor.positive{border-left:3px solid #16a34a}.ic-factor.neutral{border-left:3px solid #64748b}
    .ic-mini{width:48px;height:48px;border:0;border-radius:8px;background:#0f172a;color:#fff;font-weight:800;box-shadow:0 12px 30px rgba(15,23,42,.25);cursor:pointer}
  </style>`;
}

const observer = new MutationObserver(() => void render());
observer.observe(document.documentElement, { childList: true, subtree: true });
void render();
