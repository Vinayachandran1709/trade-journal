import { FormEvent, useEffect, useState } from "react";

import { fetchCurrentUser, loginWithPassword } from "../shared/api";
import { clearAuthToken, getAuthToken, setAuthToken } from "../shared/auth";
import type { User } from "../shared/types";

const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL || "https://indiacircle.in").replace(/\/$/, "");

type ViewState = "loading" | "ready" | "submitting";

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<ViewState>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      // Open the side panel directly from the popup. The popup was opened by
      // clicking the extension icon, so the user-gesture context persists here
      // and covers chrome.sidePanel.open() regardless of how many awaits came
      // before. The background storage.onChanged also tries as a fallback.
      const win = await chrome.windows.getCurrent();
      if (win.id) {
        await chrome.sidePanel.open({ windowId: win.id }).catch(() => undefined);
      }
      window.close();
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
    setError(null);
  }

  function handleUpgradeToPro() {
    void chrome.tabs.create({ url: `${WEB_APP_URL}/pricing` });
    window.close();
  }

  return (
    <main className="popup-shell">
      <section className="panel">
        <div className="panel-header">
          <p className="eyebrow">StrategyForge AI</p>
          <h1>Trading Copilot</h1>
          <p className="subcopy">
            Auto-journal trades from Zerodha, Groww &amp; 10+ Indian brokers.
          </p>
        </div>

        {status === "loading" ? (
          <div className="status-card">Checking saved session...</div>
        ) : user ? (
          <div className="status-stack">
            <div className="status-card success">
              <span className="status-label">Signed in</span>
              <strong>{user.email}</strong>
            </div>
            {user.subscription_status !== "pro" && (
              <button className="upgrade-button" onClick={handleUpgradeToPro}>
                ⚡ Upgrade to Pro
              </button>
            )}
            <button className="secondary-button" onClick={handleLogout}>
              Log out
            </button>
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
