import { useEffect, useState } from "react";

import { fetchCurrentUser } from "../shared/api";
import { clearAuthToken, getAuthToken, onAuthTokenChange } from "../shared/auth";
import { getCaptureState, type CaptureState } from "../shared/captures";
import type { User } from "../shared/types";

const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL || "https://indiacircle.in").replace(/\/$/, "");

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState("Checking connection...");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<"captures" | "account">("captures");
  const [captureState, setCaptureState] = useState<CaptureState | null>(null);
  const [savingTradeId, setSavingTradeId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function hydrate(tokenOverride?: string | null) {
      try {
        const token =
          typeof tokenOverride === "string" || tokenOverride === null
            ? tokenOverride
            : await getAuthToken();

        if (!token) {
          if (active) {
            setUser(null);
            setStatus("Not connected yet. Sign in from the popup.");
            setCaptureState(await getCaptureState());
          }
          return;
        }

        const currentUser = await fetchCurrentUser(token);
        if (active) {
          setUser(currentUser);
          setStatus("Connected to backend.");
          setCaptureState(await getCaptureState());
        }
      } catch {
        if (active) {
          setUser(null);
          setStatus("Unable to load the account right now.");
        }
      }
    }

    void hydrate();
    const unsubscribe = onAuthTokenChange((token) => {
      void hydrate(token);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleStorageChange: Parameters<
      typeof chrome.storage.onChanged.addListener
    >[0] = async (changes, areaName) => {
      if (areaName !== "local" || !changes.todayCaptures) {
        return;
      }

      const nextState = await getCaptureState();
      setCaptureState(nextState);
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await clearAuthToken();
      setUser(null);
      setStatus("Signed out. Click the extension action to log in again.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  async function handleSaveCapture(
    tradeId: number,
    emotionTag: string,
    note: string
  ) {
    setSavingTradeId(tradeId);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "capture:update-trade",
        payload: {
          tradeId,
          emotion_tag: emotionTag || null,
          note: note || null,
        },
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Unable to save capture notes.");
      }

      const nextState = await getCaptureState();
      setCaptureState(nextState);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save capture.");
    } finally {
      setSavingTradeId(null);
    }
  }

  const isPro = user?.subscription_status === "pro";

  return (
    <main className="sidepanel-shell">
      <section className="hero-card">
        <p className="eyebrow">StrategyForge AI</p>
        <h1>Ghost auto-journal is live.</h1>
        <p className="hero-copy">
          Keep your broker tab open on Zerodha or Groww. The extension reads the
          visible trades table and journals newly seen rows without clicking
          anything.
        </p>
        <div className="hero-actions">
          <div className="status-pill">{status}</div>
          {user ? (
            <button
              className="logout-button"
              disabled={isLoggingOut}
              onClick={handleLogout}
            >
              {isLoggingOut ? "Logging out..." : "Log out"}
            </button>
          ) : null}
        </div>
        {user ? <p className="signed-in-copy">Signed in as {user.email}</p> : null}
      </section>

      <section className="tabs-row">
        <button
          className={`tab-button ${activeTab === "captures" ? "active" : ""}`}
          onClick={() => setActiveTab("captures")}
        >
          Today's Captures
        </button>
        <button
          className={`tab-button ${activeTab === "account" ? "active" : ""}`}
          onClick={() => setActiveTab("account")}
        >
          Account
        </button>
      </section>

      {activeTab === "captures" ? (
        <section className="placeholder-grid">
          <article className="placeholder-card">
            <h2>Today's Captures</h2>
            <p>
              {captureState?.trades.length
                ? `Captured ${captureState.trades.length} new trade${captureState.trades.length === 1 ? "" : "s"} today.`
                : "No new trades captured yet today."}
            </p>
            {captureState?.lastError ? (
              <p className="error-copy">{captureState.lastError}</p>
            ) : null}
          </article>

          {captureState?.trades.map((trade) => (
            <CaptureCard
              key={trade.id}
              trade={trade}
              saving={savingTradeId === trade.id}
              onSave={handleSaveCapture}
            />
          ))}
        </section>
      ) : (
        <section className="placeholder-grid">
          <article className="placeholder-card">
            <h2>Capture status</h2>
            <p>
              Last broker: {captureState?.lastBroker ?? "None yet"}
              <br />
              Last sync: {captureState?.lastSyncAt ?? "No sync yet"}
            </p>
          </article>
          <article className="placeholder-card">
            <h2>Backend source of truth</h2>
            <p>
              Imports still feed the same backend trade table and FIFO processing
              flow used by the web app.
            </p>
          </article>
        </section>
      )}

      {/* Upgrade to Pro banner — shown only to free users */}
      {user && !isPro ? (
        <div className="pro-banner">
          <div className="pro-banner-text">
            <span className="pro-banner-title">Unlock Pro</span>
            <span className="pro-banner-desc">
              AI analysis, unlimited imports &amp; 10+ brokers
            </span>
          </div>
          <button
            className="pro-banner-button"
            onClick={() => void chrome.tabs.create({ url: `${WEB_APP_URL}/pricing` })}
          >
            Upgrade ⚡
          </button>
        </div>
      ) : null}

      {/* SEBI disclaimer */}
      <footer className="sebi-footer">
        This is analytics, not investment advice. Trading involves risk.
      </footer>
    </main>
  );
}

const EMOTIONS = [
  { emoji: "😎", label: "Confident", value: "confident" },
  { emoji: "😰", label: "Fearful",   value: "fearful" },
  { emoji: "🤑", label: "Greedy",    value: "greedy" },
  { emoji: "😤", label: "Revenge",   value: "revenge" },
  { emoji: "😱", label: "FOMO",      value: "fomo" },
  { emoji: "😐", label: "Neutral",   value: "neutral" },
  { emoji: "🥱", label: "Bored",     value: "bored" },
] as const;

function CaptureCard({
  trade,
  saving,
  onSave,
}: {
  trade: NonNullable<CaptureState>["trades"][number];
  saving: boolean;
  onSave: (tradeId: number, emotionTag: string, note: string) => Promise<void>;
}) {
  const [emotionTag, setEmotionTag] = useState(trade.emotion_tag ?? "");
  const [note, setNote] = useState(trade.notes ?? "");
  const [noteOpen, setNoteOpen] = useState(false);

  function handleEmotionTap(value: string) {
    const next = emotionTag === value ? "" : value;
    setEmotionTag(next);
    void onSave(trade.id, next, note);
  }

  return (
    <article className="placeholder-card capture-card">
      <div className="capture-header">
        <div>
          <h2>
            {trade.trade_type} {trade.stock_symbol}
          </h2>
          <p>
            Qty {trade.quantity} at {trade.price} on {trade.trade_date}
            {trade.trade_time ? ` ${trade.trade_time}` : ""}
          </p>
        </div>
        <span className="broker-pill">{trade.broker ?? "capture"}</span>
      </div>

      <div className="emotion-row">
        {EMOTIONS.map(({ emoji, label, value }) => (
          <button
            key={value}
            className={`emotion-pill${emotionTag === value ? " emotion-pill--selected" : ""}`}
            onClick={() => handleEmotionTap(value)}
            disabled={saving}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      {noteOpen ? (
        <textarea
          className="field-input field-textarea"
          value={note}
          autoFocus
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why this trade was taken..."
        />
      ) : (
        <button className="add-note-link" onClick={() => setNoteOpen(true)}>
          + Add note
        </button>
      )}

      {noteOpen ? (
        <button
          className="save-button"
          disabled={saving}
          onClick={() => onSave(trade.id, emotionTag, note)}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      ) : null}
    </article>
  );
}
