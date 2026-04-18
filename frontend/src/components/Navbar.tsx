"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isAuthenticated, logout } from "@/lib/auth";

export default function Navbar() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(isAuthenticated());
  }, []);

  const handleLogout = () => {
    logout();
    setLoggedIn(false);
    router.push("/");
  };

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-bold text-indigo-600">
          TradeIntel
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/pricing"
            className="text-sm font-medium text-gray-700 hover:text-indigo-600"
          >
            Pricing
          </Link>
          <Link
            href="/download"
            className="text-sm font-medium text-gray-700 hover:text-indigo-600"
          >
            Download
          </Link>
          {loggedIn ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm font-medium text-gray-700 hover:text-indigo-600"
              >
                Dashboard
              </Link>
              <Link
                href="/account"
                className="text-sm font-medium text-gray-700 hover:text-indigo-600"
              >
                Account
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-gray-700 hover:text-indigo-600"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
