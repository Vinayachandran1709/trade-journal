import { useEffect, useState } from "react";

import { fetchCurrentUser } from "../shared/api";
import { clearAuthToken, getAuthToken, onAuthTokenChange } from "../shared/auth";
import { getCaptureState, type CaptureState } from "../shared/captures";
import type { User } from "../shared/types";
import AccountTab from "./AccountTab";
import AiTab from "./AiTab";
import CalculatorsTab from "./CalculatorsTab";
import CapturesTab from "./CapturesTab";
import InsightsTab from "./InsightsTab";
import MarketTab from "./MarketTab";

const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL || "https://indiacircle.in").replace(/\/$/, "");

type TabId = "market" | "ai" | "insights" | "captures" | "calculators" | "account";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
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
            setBannerError(null);
            setCaptureState(await getCaptureState());
          }
          return;
        }

        const currentUser = await fetchCurrentUser(token);
        if (active) {
          setUser(currentUser);
          setBannerError(null);
          setCaptureState(await getCaptureState());
        }
      } catch {
        if (active) {
          setUser(null);
          setBannerError("Unable to connect. Check your internet connection.");
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
      setBannerError(null);
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
      setBannerError(error instanceof Error ? error.message : "Unable to save capture.");
    } finally {
      setSavingTradeId(null);
    }
  }

  const hasPaidPlan = user?.subscription_status?.startsWith("pro") ?? false;

  return (
    <main className="sidepanel-shell">
      <section className="hero-card">
        <p className="eyebrow">IndiaCircle</p>
        <h1>Your AI Trading Copilot</h1>
        <p className="hero-copy">
          Auto-capture trades from any Indian broker. Get AI-powered market
          insights, behavioral pattern analysis, smart position sizing, and
          real-time market data — all in one sidebar.
        </p>
        <div className="feature-pill-row">
          <span className="feature-pill">📊 Market Data</span>
          <span className="feature-pill">🤖 AI Insights</span>
          <span className="feature-pill">📈 Pattern Analysis</span>
          <span className="feature-pill">🧮 Calculators</span>
          <span className="feature-pill">📝 Trade Journal</span>
        </div>
        {user ? <p className="signed-in-copy">{user.email}</p> : null}
      </section>

      {bannerError ? <div className="connection-error-banner">{bannerError}</div> : null}

      <nav className="tabs-row">
        {(
          [
            ["market", "Market"],
            ["ai", "AI"],
            ["insights", "Insights"],
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

      {activeTab === "market" && <MarketTab isSignedIn={Boolean(user)} />}

      {activeTab === "ai" && <AiTab isSignedIn={Boolean(user)} />}

      {activeTab === "insights" && (
        <InsightsTab
          isSignedIn={Boolean(user)}
          webAppUrl={WEB_APP_URL}
        />
      )}

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
        <AccountTab
          user={user}
          webAppUrl={WEB_APP_URL}
          isLoggingOut={isLoggingOut}
          onLogout={handleLogout}
        />
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
