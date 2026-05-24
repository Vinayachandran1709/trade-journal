"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { getMe } from "@/lib/auth";
import type { User } from "@/types/user";

const PLAN_LABELS: Record<string, string> = {
  pro_monthly: "Pro Monthly",
  pro_annual: "Pro Annual",
  pro_founding: "Pro — Founding Member",
  free: "Free",
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pro: { label: "Active", className: "bg-green-100 text-green-700" },
  pro_cancelled: { label: "Cancels at period end", className: "bg-yellow-100 text-yellow-700" },
  free: { label: "Free", className: "bg-gray-100 text-gray-600" },
};

function AccountContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch((nextError) =>
        setError(nextError instanceof Error ? nextError.message : "Unable to load account")
      )
      .finally(() => setLoading(false));
  }, []);

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

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {error}
        </div>
      </div>
    );
  }

  const status = user?.subscription_status || "free";
  const badge = STATUS_BADGES[status] || STATUS_BADGES.free;
  const planLabel = user?.subscription_plan
    ? PLAN_LABELS[user.subscription_plan] || user.subscription_plan
    : "Free";

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Account</h1>

      <div className="mt-8 space-y-4">
        {/* Profile */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Profile
          </h2>
          <div className="mt-4 space-y-2">
            <div>
              <span className="text-sm text-gray-500">Name</span>
              <p className="font-medium">{user?.name || "—"}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Email</span>
              <p className="font-medium">{user?.email}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Member since</span>
              <p className="font-medium">
                {user?.created_at
                  ? new Date(user.created_at).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Subscription */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Access
          </h2>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="font-semibold">{planLabel}</p>
              <p className="mt-0.5 text-sm text-gray-500">Live market context, behavioral coaching, and Trade Guard access.</p>
              {user?.subscription_expires_at && (
                <p className="mt-0.5 text-sm text-gray-500">
                  {status === "pro_cancelled" ? "Expires" : "Renews"}{" "}
                  {new Date(user.subscription_expires_at).toLocaleDateString("en-IN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>
          <div className="mt-4 flex gap-3">
            {status !== "pro" ? (
              <Link
                href="/pricing"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Upgrade to Pro
              </Link>
            ) : (
              <Link
                href="/account/billing"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Manage Billing
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <AuthGuard>
      <AccountContent />
    </AuthGuard>
  );
}
