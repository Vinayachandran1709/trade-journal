import { FormEvent, useEffect, useState } from "react";

import { fetchCurrentUser, loginWithPassword } from "../shared/api";
import { AUTH_TOKEN_KEY, clearAuthToken, setAuthToken } from "../shared/auth";
import { getExtensionWebAppUrl } from "../shared/env";
import type { User } from "../shared/types";

const WEB_APP_URL = getExtensionWebAppUrl();

type ViewState = "ready" | "submitting";

function getPlanBadge(user: User): "Free" | "Pro" {
  if (user.subscription_plan === "pro_founding") {
    return "Pro";
  }

  return user.subscription_status?.startsWith("pro") ? "Pro" : "Free";
}

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<ViewState>("ready");
  const [user, setUser] = useState<User | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [cachedEmail, setCachedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFreeUser = user ? getPlanBadge(user) === "Free" : false;
  const displayEmail = user?.email ?? cachedEmail ?? "your account";

  useEffect(() => {
    let active = true;

    async function verifyToken(token: string) {
      try {
        const currentUser = await fetchCurrentUser(token);
        if (!active) return;
        setUser(currentUser);
        setIsSignedIn(true);
        setCachedEmail(currentUser.email);
        setError(null);
        await chrome.storage.local.set({ cached_email: currentUser.email });
      } catch (sessionError) {
        await clearAuthToken();
        await chrome.storage.local.remove("cached_email");
        if (!active) return;
        setUser(null);
        setIsSignedIn(false);
        setCachedEmail(null);
        setError(
          sessionError instanceof Error
            ? sessionError.message
            : "Session expired. Please log in again."
        );
      }
    }

    chrome.storage.local.get([AUTH_TOKEN_KEY, "auth_token", "cached_email"], (result) => {
      if (!active) return;

      const token =
        typeof result[AUTH_TOKEN_KEY] === "string"
          ? (result[AUTH_TOKEN_KEY] as string)
          : typeof result.auth_token === "string"
            ? (result.auth_token as string)
            : null;

      if (!token) {
        setIsSignedIn(false);
        setCachedEmail(null);
        return;
      }

      setIsSignedIn(true);
      setCachedEmail(typeof result.cached_email === "string" ? result.cached_email : null);
      void verifyToken(token);
    });

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
      await chrome.storage.local.set({ cached_email: currentUser.email });
      setUser(currentUser);
      setIsSignedIn(true);
      setCachedEmail(currentUser.email);
      setPassword("");
    } catch (submitError) {
      await clearAuthToken();
      await chrome.storage.local.remove("cached_email");
      setError(submitError instanceof Error ? submitError.message : "Unable to log in.");
      setUser(null);
      setIsSignedIn(false);
      setCachedEmail(null);
    } finally {
      setStatus("ready");
    }
  }

  async function handleLogout() {
    await clearAuthToken();
    await chrome.storage.local.remove("cached_email");
    setUser(null);
    setIsSignedIn(false);
    setCachedEmail(null);
    setPassword("");
    setError(null);
  }

  async function handleOpenSidePanel() {
    const win = await chrome.windows.getCurrent();
    if (win.id) {
      await chrome.sidePanel.open({ windowId: win.id }).catch(() => undefined);
      window.close();
    }
  }

  function handleOpenDashboard() {
    void chrome.tabs.create({ url: WEB_APP_URL });
    window.close();
  }

  function handleUpgradeToPro() {
    void chrome.tabs.create({ url: `${WEB_APP_URL}/pricing` });
    window.close();
  }

  function openWebPath(path: string) {
    void chrome.tabs.create({ url: `${WEB_APP_URL}${path}` });
    window.close();
  }

  return (
    <main className="popup-shell">
      <section className="panel">
        <div className="panel-header">
          <p className="eyebrow">IndiaCircle</p>
          <h1>IndiaCircle</h1>
          <p className="subcopy">
            Sign in, open live market context, and jump into your behavioral workspace from one compact popup.
          </p>
        </div>

        {isSignedIn ? (
          <div className="popup-stack">
            <div className="account-strip">
              <div>
                <span className="account-strip-label">Account</span>
                <strong>
                  {"\u2713 Signed in as "}
                  {displayEmail}
                </strong>
              </div>
              <div className="account-strip-actions">
                <span className={`plan-badge${isFreeUser ? "" : " plan-badge--pro"}`}>
                  {user ? getPlanBadge(user) : "Free"}
                </span>
                <button className="ghost-link" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            </div>

            <div className="footer-actions">
              <button className="secondary-button" onClick={() => void handleOpenSidePanel()}>
                Open Side Panel
              </button>
              <button className="secondary-button" onClick={handleOpenDashboard}>
                View Dashboard
              </button>
              {isFreeUser ? (
                <button className="upgrade-button" onClick={handleUpgradeToPro}>
                  {"Upgrade to Pro \u26A1"}
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
              className="primary-button sign-in-button"
              disabled={status === "submitting"}
              type="submit"
            >
              {status === "submitting" ? "Signing in..." : "Sign in"}
            </button>

            <button
              className="create-account-link secondary-action"
              onClick={() => openWebPath("/signup")}
              type="button"
            >
              Create Free Account
            </button>
          </form>
        )}

        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
