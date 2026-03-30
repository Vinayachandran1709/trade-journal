"use client";

import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import Card from "@/components/ui/Card";
import { getMe } from "@/lib/auth";
import type { User } from "@/types/user";

function DashboardContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load user")
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <svg
          className="h-8 w-8 animate-spin text-indigo-600"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p className="mt-1 text-gray-500">
        Welcome back, {user?.name || user?.email}!
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <Card>
          <h2 className="text-sm font-medium text-gray-500">Account</h2>
          <p className="mt-1 text-lg font-semibold">{user?.email}</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Joined {new Date(user!.created_at).toLocaleDateString()}
          </p>
        </Card>

        <Card>
          <h2 className="text-sm font-medium text-gray-500">Trades</h2>
          <p className="mt-1 text-lg font-semibold">0 trades</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Import your first trades to get started
          </p>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex flex-col items-center py-8 text-center">
          <div className="rounded-full bg-indigo-50 p-4">
            <svg
              className="h-8 w-8 text-indigo-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold">Upload Trades</h3>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            Trade import from Zerodha, Groww, and CSV files coming soon. Stay
            tuned!
          </p>
        </div>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
