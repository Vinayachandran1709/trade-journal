import { FormEvent, useEffect, useState } from "react";

import {
  APIError,
  fetchCurrentUser,
  fetchWhyMoving,
  loginWithPassword,
  type WhyMovingResponse,
} from "../shared/api";
import { clearAuthToken, getAuthToken, setAuthToken } from "../shared/auth";
import {
  storageGet,
  storageGetAll,
  storageRemoveMany,
  storageSet,
} from "../shared/chrome";
import type { User } from "../shared/types";

const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL || "https://indiacircle.in").replace(/\/$/, "");
const RECENT_QUERIES_KEY = "recentWhyMovingQueries";

type ViewState = "loading" | "ready" | "submitting";
type QueryState = "idle" | "analyzing";

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAiQueryCountKey(date = new Date()): string {
  return `aiQueryCount_${getLocalDateKey(date)}`;
}

function getPlanBadge(user: User): "Free" | "Pro" {
  if (user.subscription_plan === "pro_founding") {
    return "Pro";
  }

  return user.subscription_status?.startsWith("pro") ? "Pro" : "Free";
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getExplanationBody(result: WhyMovingResponse): string {
  return result.explanation
    .replace(result.disclaimer, "")
    .replace(/\n+$/, "")
    .trim();
}

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [symbol, setSymbol] = useState("");
  const [status, setStatus] = useState<ViewState>("loading");
  const [queryState, setQueryState] = useState<QueryState>("idle");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<{
    message: string;
    used: number;
    limit: number;
  } | null>(null);
  const [result, setResult] = useState<WhyMovingResponse | null>(null);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [localQueryCount, setLocalQueryCount] = useState(0);

  const isFreeUser = user ? getPlanBadge(user) === "Free" : false;

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        await cleanupOldAiQueryCounts();

        const [token, storedRecentQueries, storedCount] = await Promise.all([
          getAuthToken(),
          storageGet<string[]>(RECENT_QUERIES_KEY),
          storageGet<number>(getAiQueryCountKey()),
        ]);

        if (active) {
          setRecentQueries(storedRecentQueries ?? []);
          setLocalQueryCount(storedCount ?? 0);
        }

        if (!token) {
          if (active) {
            setStatus("ready");
          }
          return;
        }

        const currentUser = await fetchCurrentUser(token);
        if (!active) {
          return;
        }

        setUser(currentUser);
      } catch (sessionError) {
        await clearAuthToken();
        if (active) {
          setError(
            sessionError instanceof Error
              ? sessionError.message
              : "Session expired. Please log in again."
          );
        }
      } finally {
        if (active) {
          setStatus("ready");
        }
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError(null);

    try {
      const tokenResponse = await loginWithPassword({ email, password });
      await setAuthToken(tokenResponse.access_token);
      const currentUser = await fetchCurrentUser(tokenResponse.access_token);
      setUser(currentUser);
      setPassword("");
    } catch (submitError) {
      await clearAuthToken();
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to log in."
      );
      setUser(null);
    } finally {
      setStatus("ready");
    }
  }

  async function handleLogout() {
    await clearAuthToken();
    setUser(null);
    setPassword("");
    setResult(null);
    setQuotaError(null);
    setQueryError(null);
    setError(null);
  }

  async function runWhyMovingQuery(nextSymbol?: string) {
    const normalizedSymbol = (nextSymbol ?? symbol).trim().toUpperCase();
    if (!normalizedSymbol) {
      setQueryError("Enter a stock symbol first.");
      setQuotaError(null);
      return;
    }

    setSymbol(normalizedSymbol);
    setQueryState("analyzing");
    setQueryError(null);
    setQuotaError(null);

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Sign in required before using the AI agent.");
      }

      const response = await fetchWhyMoving(token, normalizedSymbol);
      setResult(response);
      await Promise.all([
        saveRecentQuery(normalizedSymbol),
        incrementLocalAiQueryCount(),
      ]);
    } catch (queryFailure) {
      setResult(null);

      if (queryFailure instanceof APIError && queryFailure.status === 429) {
        const payload = queryFailure.payload as {
          message?: string;
          queries_used?: number;
          queries_limit?: number;
        } | null;
        setQuotaError({
          message:
            payload?.message ?? "Daily limit reached. Upgrade to Pro for 50 queries/day.",
          used: payload?.queries_used ?? 0,
          limit: payload?.queries_limit ?? 0,
        });
      } else {
        setQueryError(
          queryFailure instanceof Error
            ? queryFailure.message
            : "Unable to analyze this symbol right now."
        );
      }
    } finally {
      setQueryState("idle");
    }
  }

  async function saveRecentQuery(nextSymbol: string) {
    const nextQueries = [nextSymbol, ...recentQueries.filter((item) => item !== nextSymbol)]
      .slice(0, 3);
    setRecentQueries(nextQueries);
    await storageSet(RECENT_QUERIES_KEY, nextQueries);
  }

  async function incrementLocalAiQueryCount() {
    const key = getAiQueryCountKey();
    const nextCount = localQueryCount + 1;
    setLocalQueryCount(nextCount);
    await storageSet(key, nextCount);
  }

  async function handleOpenSidePanel() {
    const win = await chrome.windows.getCurrent();
    if (win.id) {
      await chrome.sidePanel.open({ windowId: win.id }).catch(() => undefined);
      window.close();
    }
  }

  function handleUpgradeToPro() {
    void chrome.tabs.create({ url: `${WEB_APP_URL}/pricing` });
    window.close();
  }

  return (
    <main className="popup-shell">
      <section className="panel">
        <div className="panel-header">
          <p className="eyebrow">IndiaCircle</p>
          <h1>Why Is It Moving?</h1>
          <p className="subcopy">
            Track fast AI explanations for Indian stock moves and jump into the side
            panel when you want the full dashboard.
          </p>
        </div>

        {status === "loading" ? (
          <div className="status-card">Checking saved session...</div>
        ) : user ? (
          <div className="popup-stack">
            <div className="account-strip">
              <div>
                <span className="account-strip-label">Signed in</span>
                <strong>{user.email}</strong>
              </div>
              <div className="account-strip-actions">
                <span className={`plan-badge${isFreeUser ? "" : " plan-badge--pro"}`}>
                  {getPlanBadge(user)}
                </span>
                <button className="ghost-link" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            </div>

            <div className="search-card">
              <label className="search-label" htmlFor="symbol-input">
                Stock Symbol
              </label>
              <input
                id="symbol-input"
                className="symbol-input"
                placeholder="Enter stock symbol... (e.g., TCS)"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runWhyMovingQuery();
                  }
                }}
              />

              <button
                className={`why-moving-button${queryState === "analyzing" ? " is-loading" : ""}`}
                disabled={queryState === "analyzing"}
                onClick={() => void runWhyMovingQuery()}
              >
                {queryState === "analyzing" ? "Analyzing..." : "Why is it moving? 🔍"}
              </button>

              <div className="recent-section">
                <div className="recent-header">
                  <span>Recent queries</span>
                  {localQueryCount > 0 ? (
                    <span className="recent-count">Today: {localQueryCount}</span>
                  ) : null}
                </div>
                {recentQueries.length ? (
                  <div className="recent-list">
                    {recentQueries.map((recentSymbol) => (
                      <button
                        key={recentSymbol}
                        className="recent-pill"
                        onClick={() => void runWhyMovingQuery(recentSymbol)}
                      >
                        {recentSymbol}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="recent-empty">Your last 3 lookups will show here.</p>
                )}
              </div>
            </div>

            {quotaError ? (
              <div className="quota-card">
                <strong>Daily limit reached</strong>
                <p>{quotaError.message || "Upgrade to Pro for 50 queries/day."}</p>
                {quotaError.limit > 0 ? (
                  <p className="quota-meta">
                    Used {quotaError.used}/{quotaError.limit} queries today.
                  </p>
                ) : null}
                {isFreeUser ? (
                  <button className="upgrade-button" onClick={handleUpgradeToPro}>
                    Upgrade to Pro ⚡
                  </button>
                ) : null}
              </div>
            ) : null}

            {queryError ? <p className="error-text">{queryError}</p> : null}

            {result ? (
              <article className="result-card">
                <div className="result-header">
                  <div>
                    <h2>{result.symbol}</h2>
                    <p className="result-price">₹{result.price.toFixed(2)}</p>
                  </div>
                  <span
                    className={`change-pill${result.change_pct >= 0 ? " positive" : " negative"}`}
                  >
                    {formatSignedNumber(result.change_pct)}
                  </span>
                </div>

                <p className="result-explanation">{getExplanationBody(result)}</p>

                <div className="source-list">
                  {result.sources.map((source) => (
                    <span key={source} className="source-pill">
                      {source}
                    </span>
                  ))}
                </div>

                <div className="result-footer">
                  <span className="query-counter">
                    Queries remaining: {result.queries_remaining}/{result.queries_limit} today
                  </span>
                  {result.cached ? <span className="cached-pill">Cached</span> : null}
                </div>
                <p className="disclaimer-text">{result.disclaimer}</p>
              </article>
            ) : null}

            <div className="footer-actions">
              <button className="secondary-button" onClick={() => void handleOpenSidePanel()}>
                Open Side Panel
              </button>
              {isFreeUser ? (
                <button className="upgrade-button" onClick={handleUpgradeToPro}>
                  Upgrade to Pro ⚡
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              Email
              <input
                autoComplete="email"
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label>
              Password
              <input
                autoComplete="current-password"
                placeholder="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            <button
              className="primary-button"
              disabled={status === "submitting"}
              type="submit"
            >
              {status === "submitting" ? "Signing in..." : "Sign in"}
            </button>
          </form>
        )}

        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}

async function cleanupOldAiQueryCounts(): Promise<void> {
  const allItems = await storageGetAll<Record<string, unknown>>();
  const todayKey = getAiQueryCountKey();
  const staleKeys = Object.keys(allItems).filter(
    (key) => key.startsWith("aiQueryCount_") && key !== todayKey
  );
  await storageRemoveMany(staleKeys);
}
