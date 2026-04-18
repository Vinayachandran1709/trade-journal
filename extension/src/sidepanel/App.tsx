import { useEffect, useState } from "react";

import { fetchCurrentUser } from "../shared/api";
import { clearAuthToken, getAuthToken, onAuthTokenChange } from "../shared/auth";
import type { User } from "../shared/types";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState("Checking connection...");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
          }
          return;
        }

        const currentUser = await fetchCurrentUser(token);
        if (active) {
          setUser(currentUser);
          setStatus("Connected to backend.");
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

  return (
    <main className="sidepanel-shell">
      <section className="hero-card">
        <p className="eyebrow">Trade Copilot Extension</p>
        <h1>Daily workflow will live here.</h1>
        <p className="hero-copy">
          Release 0 keeps this intentionally light while the extension shell,
          auth wiring, and side panel foundation settle in.
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

      <section className="placeholder-grid">
        <article className="placeholder-card">
          <h2>Capture</h2>
          <p>Broker-aware capture flows will plug in here in a later release.</p>
        </article>
        <article className="placeholder-card">
          <h2>Analytics</h2>
          <p>
            Completed trade analytics will continue using the backend FIFO
            processing source of truth.
          </p>
        </article>
        <article className="placeholder-card">
          <h2>Checklists</h2>
          <p>Pre-trade and post-trade workflows are scaffolded but not active yet.</p>
        </article>
      </section>
    </main>
  );
}
