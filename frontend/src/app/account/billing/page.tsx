"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { cancelSubscription, getBillingStatus } from "@/lib/billing";
import type { BillingStatus } from "@/lib/billing";

const PLAN_LABELS: Record<string, string> = {
  pro_monthly: "Pro Monthly — ₹599/month",
  pro_annual: "Pro Annual — ₹4,999/year",
  pro_founding: "Pro — Founding Member (3 months free)",
};

function BillingContent() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getBillingStatus()
      .then(setBilling)
      .catch(() => setError("Failed to load billing info"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCancel() {
    setCancelling(true);
    setError("");
    try {
      await cancelSubscription();
      setCancelDone(true);
      setBilling((prev) =>
        prev ? { ...prev, subscription_status: "pro_cancelled" } : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancellation failed");
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <svg className="h-8 w-8 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  const isPro = billing?.subscription_status === "pro";
  const isCancelled = billing?.subscription_status === "pro_cancelled";
  const planLabel = billing?.subscription_plan
    ? PLAN_LABELS[billing.subscription_plan] || billing.subscription_plan
    : "Free";

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center gap-3">
        <Link href="/account" className="text-sm text-gray-500 hover:text-gray-700">
          ← Account
        </Link>
      </div>
      <h1 className="mt-4 text-2xl font-bold">Billing</h1>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {cancelDone && (
        <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          Subscription cancelled. You'll retain Pro access until the expiry date.
        </div>
      )}

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Current Plan
        </h2>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="font-semibold">{planLabel}</p>
            {billing?.subscription_expires_at && (
              <p className="mt-0.5 text-sm text-gray-500">
                {isCancelled ? "Expires" : "Next billing date"}{" "}
                {new Date(billing.subscription_expires_at).toLocaleDateString("en-IN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isPro
                ? "bg-green-100 text-green-700"
                : isCancelled
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {isPro ? "Active" : isCancelled ? "Cancels at period end" : "Free"}
          </span>
        </div>
      </div>

      {!isPro && !isCancelled && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">
            You're on the Free plan.{" "}
            <Link href="/pricing" className="text-indigo-600 hover:underline">
              Upgrade to Pro
            </Link>{" "}
            to unlock all features.
          </p>
        </div>
      )}

      {(isPro || isCancelled) && !isCancelled && (
        <div className="mt-6 rounded-xl border border-red-100 bg-white p-6">
          <h2 className="font-semibold text-red-700">Cancel Subscription</h2>
          <p className="mt-2 text-sm text-gray-500">
            You'll keep Pro access until your current billing period ends. No
            refunds for partial months.
          </p>
          {confirmCancel ? (
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {cancelling ? "Cancelling..." : "Yes, cancel my subscription"}
              </button>
              <button
                onClick={() => setConfirmCancel(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Keep subscription
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmCancel(true)}
              className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Cancel subscription
            </button>
          )}
        </div>
      )}

      {isCancelled && (
        <div className="mt-4 rounded-xl border border-yellow-100 bg-yellow-50 p-4 text-sm text-yellow-800">
          Your subscription is cancelled and will not renew. Pro access continues
          until the expiry date above.
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <AuthGuard>
      <BillingContent />
    </AuthGuard>
  );
}
