import { FormEvent, useEffect, useState } from "react";

import {
  APIError,
  fetchCurrentUser,
  loginWithPassword,
  type AnalyticsSummaryResponse,
  type MarketDashboardData,
  type PatternsEnvelope,
} from "../shared/api";
import { clearAuthToken, getAuthToken, onAuthTokenChange, setAuthToken } from "../shared/auth";
import { getCaptureState, type CaptureState } from "../shared/captures";
import { storageRemove, storageSet } from "../shared/chrome";
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
type ViewState = "loading" | "signed_out" | "signed_in";
type SubmitState = "ready" | "submitting";

function getFriendlyAuthError(error: unknown): string {
  if (error instanceof APIError) {
    if (error.status === 401) {
      return "Session expired. Please sign in again.";
    }
    return error.message || "Unable to sign in right now.";
  }

  if (error instanceof Error) {
    return error.message || "Unable to sign in right now.";
  }

  return "Unable to sign in right now.";
}

function openWebPath(path: string) {
  void chrome.tabs.create({ url: `${WEB_APP_URL}${path}` });
}

function LoggedOutPanel({
  email,
  password,
  error,
  status,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  email: string;
  password: string;
  error: string | null;
  status: SubmitState;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="sidepanel-shell sidepanel-shell--auth">
      <section className="hero-card auth-hero-card">
        <p className="eyebrow">IndiaCircle</p>
        <h1>Open your AI trading copilot</h1>
        <p className="hero-copy">
          Sign in once to auto-capture trades, review your journal, and use AI insights
          beside your broker.
        </p>
      </section>

      <section className="placeholder-card auth-card">
        <form className="auth-sidepanel-form" onSubmit={onSubmit}>
          <label className="field-label" htmlFor="sidepanel-email">
            Email
            <input
              id="sidepanel-email"
              className="field-input"
              autoComplete="email"
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              required
            />
          </label>

          <label className="field-label" htmlFor="sidepanel-password">
            Password
            <input
              id="sidepanel-password"
              className="field-input"
              autoComplete="current-password"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              required
            />
          </label>

          <button className="auth-submit-button" disabled={status === "submitting"} type="submit">
            {status === "submitting" ? "Signing in..." : "Sign in"}
          </button>

          <div className="auth-secondary-actions">
            <button type="button" className="account-link-button" onClick={() => openWebPath("/signup")}>
              Create free account
            </button>
            <button type="button" className="account-link-button" onClick={() => openWebPath("/dashboard")}>
              Open dashboard
            </button>
          </div>
        </form>

        {error ? <div className="connection-error-banner">{error}</div> : null}
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("ready");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("captures");
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
          const nextCaptureState = await getCaptureState();
          if (active) {
            setUser(null);
            setBannerError(null);
            setCaptureState(nextCaptureState);
            setPatternsEnvelope(null);
            setAnalyticsSummary(null);
            setViewState("signed_out");
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
          setEmail(currentUser.email);
          setBannerError(null);
          setAuthError(null);
          setCaptureState(nextCaptureState);
          setPatternsEnvelope(nextPatterns);
          setAnalyticsSummary(nextSummary);
          setViewState("signed_in");
        }
      } catch (error) {
        await clearAuthToken().catch(() => undefined);
        await storageRemove("cached_email").catch(() => undefined);
        const nextCaptureState = await getCaptureState().catch(() => null);
        if (active) {
          setUser(null);
          setCaptureState(nextCaptureState);
          setPatternsEnvelope(null);
          setAnalyticsSummary(null);
          setBannerError(null);
          setAuthError(getFriendlyAuthError(error));
          setViewState("signed_out");
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

  async function handleSidePanelLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState("submitting");
    setAuthError(null);

    try {
      const tokenResponse = await loginWithPassword({
        email: email.trim(),
        password,
      });
      await setAuthToken(tokenResponse.access_token);
      const currentUser = await fetchCurrentUser(tokenResponse.access_token);
      await storageSet("cached_email", currentUser.email);
      setUser(currentUser);
      setPassword("");
      setActiveTab("captures");
      setBannerError(null);
      setAuthError(null);
      setViewState("signed_in");

      const [nextCaptureState, nextPatterns, nextSummary] = await Promise.all([
        getCaptureState(),
        getCachedBehaviorPatterns(tokenResponse.access_token),
        getCachedAnalyticsSummary(tokenResponse.access_token),
      ]);
      setCaptureState(nextCaptureState);
      setPatternsEnvelope(nextPatterns);
      setAnalyticsSummary(nextSummary);
    } catch (error) {
      await clearAuthToken().catch(() => undefined);
      await storageRemove("cached_email").catch(() => undefined);
      setUser(null);
      setPatternsEnvelope(null);
      setAnalyticsSummary(null);
      setAuthError(getFriendlyAuthError(error));
      setViewState("signed_out");
    } finally {
      setSubmitState("ready");
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await clearAuthToken();
      await storageRemove("cached_email");
      setUser(null);
      setBannerError(null);
      setPatternsEnvelope(null);
      setAnalyticsSummary(null);
      setPassword("");
      setAuthError(null);
      setViewState("signed_out");
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

  if (viewState === "loading") {
    return (
      <main className="sidepanel-shell sidepanel-shell--auth">
        <section className="hero-card auth-hero-card">
          <p className="eyebrow">IndiaCircle</p>
          <h1>Open your AI trading copilot</h1>
          <p className="hero-copy">
            Loading your extension session and getting your journal workspace ready.
          </p>
        </section>
      </main>
    );
  }

  if (viewState !== "signed_in") {
    return (
      <LoggedOutPanel
        email={email}
        password={password}
        error={authError}
        status={submitState}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleSidePanelLogin}
      />
    );
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
              ["captures", "Journal"],
              ["market", "Market"],
              ["ai", "Research"],
              ["insights", "Insights"],
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

      {activeTab === "captures" && (
        <JournalTab
          captureState={captureState}
          savingTradeId={savingTradeId}
          onSave={handleSaveCapture}
          isSignedIn={Boolean(user)}
        />
      )}

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
