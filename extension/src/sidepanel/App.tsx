import { useEffect, useState } from "react";

import {
  fetchCurrentUser,
  type AnalyticsSummaryResponse,
  type MarketDashboardData,
  type PatternsEnvelope,
} from "../shared/api";
import { clearAuthToken, getAuthToken, onAuthTokenChange } from "../shared/auth";
import { getCaptureState, type CaptureState } from "../shared/captures";
import type { User } from "../shared/types";
import AccountTab from "./AccountTab";
import AiTab from "./AiTab";
import { getCachedAnalyticsSummary, getCachedBehaviorPatterns } from "./behavioral";
import CalculatorsTab from "./CalculatorsTab";
import InsightsTab from "./InsightsTab";
import JournalTab from "./JournalTab";
import MarketTab from "./MarketTab";
import TraderPulse from "./TraderPulse";

const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL || "https://indiacircle.in").replace(/\/$/, "");

type TabId = "market" | "ai" | "insights" | "captures" | "calculators" | "account";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("market");
  const [captureState, setCaptureState] = useState<CaptureState | null>(null);
  const [savingTradeId, setSavingTradeId] = useState<number | null>(null);
  const [marketData, setMarketData] = useState<MarketDashboardData | null>(null);
  const [patternsEnvelope, setPatternsEnvelope] = useState<PatternsEnvelope | null>(null);
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummaryResponse | null>(null);

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
            setPatternsEnvelope(null);
            setAnalyticsSummary(null);
          }
          return;
        }

        const [currentUser, nextCaptureState, nextPatterns, nextSummary] = await Promise.all([
          fetchCurrentUser(token),
          getCaptureState(),
          getCachedBehaviorPatterns(token),
          getCachedAnalyticsSummary(token),
        ]);

        if (active) {
          setUser(currentUser);
          setBannerError(null);
          setCaptureState(nextCaptureState);
          setPatternsEnvelope(nextPatterns);
          setAnalyticsSummary(nextSummary);
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
      setPatternsEnvelope(null);
      setAnalyticsSummary(null);
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
      <TraderPulse
        user={user}
        marketData={marketData}
        captureState={captureState}
        patternsEnvelope={patternsEnvelope}
        analyticsSummary={analyticsSummary}
      />

      {bannerError ? <div className="connection-error-banner">{bannerError}</div> : null}

      <div className="tabs-wrapper">
        <nav className="tabs-row">
          {(
            [
              ["market", "Market"],
              ["ai", "Research"],
              ["insights", "Insights"],
              ["captures", "Journal"],
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
        <div className="tabs-fade-hint" aria-hidden="true" />
      </div>

      {activeTab === "market" && (
        <MarketTab
          isSignedIn={Boolean(user)}
          captureState={captureState}
          onDataChange={setMarketData}
        />
      )}

      {activeTab === "ai" && <AiTab isSignedIn={Boolean(user)} marketData={marketData} />}

      {activeTab === "insights" && (
        <InsightsTab
          isSignedIn={Boolean(user)}
          webAppUrl={WEB_APP_URL}
        />
      )}

      {activeTab === "captures" && (
        <JournalTab
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
              AI analysis, unlimited imports and 10+ brokers
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
