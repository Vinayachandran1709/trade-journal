"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/auth";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LogoMark() {
  return (
    <div className="mx-auto flex w-fit items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950">
        <span className="h-4 w-4 rotate-45 rounded-[5px] bg-gradient-to-br from-indigo-500 to-emerald-400" />
      </span>
      <span className="text-2xl font-black text-slate-950">IndiaCircle</span>
    </div>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";

  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.email) e.email = "Email is required";
    if (!form.password) e.password = "Password is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setApiError("");
    if (!validate()) return;

    setLoading(true);
    try {
      await login({ email: form.email, password: form.password });
      router.push("/dashboard");
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 via-white to-indigo-50/40 px-4 pb-16 pt-28">
      <div className="w-full max-w-md">
        <div className="glass-card p-8">
          <LogoMark />
          <div className="mt-8 text-center">
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              Welcome back
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Login to review your trades, patterns, and risk context.
            </p>
          </div>

          {justRegistered && (
            <div className="mt-6 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
              Account created successfully. Please login.
            </div>
          )}

          {apiError && (
            <div className="mt-6 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="text-sm font-bold text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={`mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${
                  errors.email ? "border-rose-300" : "border-gray-200"
                }`}
              />
              {errors.email && <p className="mt-1 text-xs font-medium text-rose-600">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="text-sm font-bold text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Your password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={`mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${
                  errors.password ? "border-rose-300" : "border-gray-200"
                }`}
              />
              {errors.password && <p className="mt-1 text-xs font-medium text-rose-600">{errors.password}</p>}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-bold text-indigo-600 hover:text-indigo-500">
              Sign up
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-sm font-semibold text-gray-500">
          Join 100+ Indian traders
        </p>
      </div>
    </div>
  );
}
