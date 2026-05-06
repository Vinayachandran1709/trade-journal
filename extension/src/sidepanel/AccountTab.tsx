import { useEffect, useState } from "react";

import { fetchTradesSummary, type TradesSummary } from "../shared/api";
import { getAuthToken } from "../shared/auth";
import { storageGet, storageSet } from "../shared/chrome";
import type { User } from "../shared/types";
import SkeletonLine from "./SkeletonLine";

const CACHED_ACCOUNT_SUMMARY_KEY = "cachedAccountSummary";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function formatDate(value?: string | null): string {
  if (!value) {
    return "Recently joined";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently joined";
  }

  return DATE_FORMATTER.format(parsed);
}

function getSubscriptionLabel(user: User): "Free" | "Pro" | "Pro Founding" {
  if (user.subscription_plan === "pro_founding") {
    return "Pro Founding";
  }
  if (user.subscription_status?.startsWith("pro")) {
    return "Pro";
  }
  return "Free";
}

function getBadgeClass(label: "Free" | "Pro" | "Pro Founding"): string {
  switch (label) {
    case "Pro Founding":
      return "account-badge account-badge--founding";
    case "Pro":
      return "account-badge account-badge--pro";
    default:
      return "account-badge account-badge--free";
  }
}

export default function AccountTab({
  user,
  webAppUrl,
  isLoggingOut,
  onLogout,
}: {
  user: User | null;
  webAppUrl: string;
  isLoggingOut: boolean;
  onLogout: () => void;
}) {
  const [summary, setSummary] = useState<TradesSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      if (!user) {
        if (active) {
          setSummary(null);
          setSummaryError(null);
          setLoadingSummary(false);
        }
        return;
      }

      const cachedSummary = await storageGet<TradesSummary>(CACHED_ACCOUNT_SUMMARY_KEY).catch(
        () => null
      );
      if (!active) return;
      if (cachedSummary) {
        setSummary(cachedSummary);
      }
      setLoadingSummary(!cachedSummary);

      try {
        const token = await getAuthToken();
        if (!token) {
          throw new Error("Sign in to load account stats.");
        }

        const nextSummary = await fetchTradesSummary(token);
        if (active) {
          setSummary(nextSummary);
          setSummaryError(null);
        }
        void storageSet(CACHED_ACCOUNT_SUMMARY_KEY, nextSummary).catch(() => undefined);
      } catch (error) {
        if (active) {
          setSummary(null);
          setSummaryError(
            error instanceof Error ? error.message : "Unable to load account stats."
          );
        }
      } finally {
        if (active) {
          setLoadingSummary(false);
        }
      }
    }

    void loadSummary();
    return () => {
      active = false;
    };
  }, [user]);

  function openPath(path: string) {
    void chrome.tabs.create({ url: `${webAppUrl}${path}` });
  }

  if (!user) {
    return (
      <section className="placeholder-grid">
        <article className="placeholder-card">
          <h2>Account</h2>
          <p>Sign in from the popup to see your subscription details and trade stats.</p>
        </article>
      </section>
    );
  }

  const badgeLabel = getSubscriptionLabel(user);
  const isFreePlan = badgeLabel === "Free";
  const tradeCount = summary
      ? summary.total_trades === 0
        ? "0 trades — import CSV or open your broker"
        : summary.total_trades.toLocaleString("en-IN")
      : "—";

  const subscriptionLabel = isFreePlan
    ? "Free plan"
    : user.subscription_expires_at
      ? new Intl.DateTimeFormat("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }).format(new Date(user.subscription_expires_at))
      : "Active";

  return (
    <section className="placeholder-grid">
      <article className="placeholder-card account-card">
        <div className="account-card-header">
          <div>
            <h2>Account</h2>
            <p className="account-email">{user.email}</p>
          </div>
          <span className={getBadgeClass(badgeLabel)}>{badgeLabel}</span>
        </div>

        <div className="account-metrics">
          <div className="account-metric">
            <span className="account-metric-label">Member since</span>
            <strong>{formatDate(user.created_at)}</strong>
          </div>
          <div className="account-metric">
            <span className="account-metric-label">Total trades captured</span>
            <strong>
              {loadingSummary ? <SkeletonLine width="72px" height="14px" /> : tradeCount}
            </strong>
          </div>
          <div className="account-metric">
            <span className="account-metric-label">
              {isFreePlan ? "Subscription" : "Expiry date"}
            </span>
            <strong>{subscriptionLabel}</strong>
          </div>
        </div>

        {summaryError ? <p className="error-copy">{summaryError}</p> : null}

        <div className="account-actions">
          {isFreePlan ? (
            <button className="pro-banner-button" onClick={() => openPath("/pricing")}>
              Upgrade to Pro
            </button>
          ) : null}
          <button className="account-link-button" onClick={() => openPath("/account/billing")}>
            Manage Billing
          </button>
          <button className="account-link-button" onClick={() => openPath("/dashboard")}>
            View Full Dashboard
          </button>
          <button
            className="account-link-button account-logout-button"
            disabled={isLoggingOut}
            onClick={onLogout}
          >
            {isLoggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      </article>
    </section>
  );
}
