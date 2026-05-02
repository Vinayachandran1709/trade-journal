import { FormEvent, useEffect, useState } from "react";

import { fetchCurrentUser, loginWithPassword } from "../shared/api";
import { clearAuthToken, getAuthToken, setAuthToken } from "../shared/auth";
import type { User } from "../shared/types";

const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL || "https://indiacircle.in").replace(/\/$/, "");

type ViewState = "loading" | "ready" | "submitting";

function getPlanBadge(user: User): "Free" | "Pro" {
  if (user.subscription_plan === "pro_founding") {
    return "Pro";
  }

  return user.subscription_status?.startsWith("pro") ? "Pro" : "Free";
}

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<ViewState>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFreeUser = user ? getPlanBadge(user) === "Free" : false;

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const token = await getAuthToken();
        if (!token) {
          if (active) {
            setStatus("ready");
          }
          return;
        }

        const currentUser = await fetchCurrentUser(token);
        if (active) {
          setUser(currentUser);
        }
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
      setError(submitError instanceof Error ? submitError.message : "Unable to log in.");
      setUser(null);
    } finally {
      setStatus("ready");
    }
  }

  async function handleLogout() {
    await clearAuthToken();
    setUser(null);
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

  function handleCreateAccount() {
    void chrome.tabs.create({ url: `${WEB_APP_URL}/signup` });
    window.close();
  }

  return (
    <main className="popup-shell">
      <section className="panel">
        <div className="panel-header">
          <p className="eyebrow">IndiaCircle</p>
          <h1>IndiaCircle</h1>
          <p className="subcopy">
            Sign in, open your side panel, and jump to your dashboard from one compact popup.
          </p>
        </div>

        {status === "loading" ? (
          <div className="status-card">Checking saved session...</div>
        ) : user ? (
          <div className="popup-stack">
            <div className="account-strip">
              <div>
                <span className="account-strip-label">Account</span>
                <strong>
                  {"\u2713 Signed in as "}
                  {user.email}
                </strong>
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
              className="primary-button"
              disabled={status === "submitting"}
              type="submit"
            >
              {status === "submitting" ? "Signing in..." : "Sign in"}
            </button>

            <button
              className="secondary-button"
              onClick={handleCreateAccount}
              type="button"
            >
              Create Account
            </button>
          </form>
        )}

        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
