"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/auth";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
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
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-gray-500">
          Login to access your trading dashboard.
        </p>

        {justRegistered && (
          <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            Account created successfully! Please login.
          </div>
        )}

        {apiError && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            id="email"
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={errors.email}
          />
          <Input
            id="password"
            label="Password"
            type="password"
            placeholder="Your password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            error={errors.password}
          />
          <Button type="submit" loading={loading} className="w-full">
            Login
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign Up
          </Link>
        </p>
      </Card>
    </div>
  );
}
