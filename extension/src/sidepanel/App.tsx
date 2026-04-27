import { useEffect, useState } from "react";

import { fetchCurrentUser } from "../shared/api";
import { clearAuthToken, getAuthToken, onAuthTokenChange } from "../shared/auth";
import { getCaptureState, type CaptureState } from "../shared/captures";
import type { User } from "../shared/types";
import AccountTab from "./AccountTab";
import CalculatorsTab from "./CalculatorsTab";
import CapturesTab from "./CapturesTab";
import MarketTab from "./MarketTab";

const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL || "https://indiacircle.in").replace(/\/$/, "");

type TabId = "market" | "captures" | "calculators" | "account";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState("Checking connection...");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("market");
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

  const hasPaidPlan = user?.subscription_status?.startsWith("pro") ?? false;

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

      <nav className="tabs-row">
        {(
          [
            ["market", "Market"],
            ["captures", "Captures"],
            ["calculators", "Calculators"],
            ["account", "Account"],
          ] as Array<[TabId, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            className={`tab-button${activeTab === id ? " active" : ""}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "market" && <MarketTab />}

      {activeTab === "captures" && (
        <CapturesTab
          captureState={captureState}
          savingTradeId={savingTradeId}
          onSave={handleSaveCapture}
          isSignedIn={Boolean(user)}
        />
      )}

      {activeTab === "calculators" && <CalculatorsTab />}

      {activeTab === "account" && (
        <AccountTab user={user} webAppUrl={WEB_APP_URL} />
      )}

      {user && !hasPaidPlan ? (
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
            Upgrade
          </button>
        </div>
      ) : null}

      <footer className="sebi-footer">
        This is analytics, not investment advice. Trading involves risk.
      </footer>
    </main>
  );
}
