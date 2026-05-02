"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signup } from "@/lib/auth";

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

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.email) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Invalid email";
    if (!form.password) e.password = "Password is required";
    else if (form.password.length < 6)
      e.password = "Password must be at least 6 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setApiError("");
    if (!validate()) return;

    setLoading(true);
    try {
      await signup({
        email: form.email,
        password: form.password,
        name: form.name || undefined,
      });
      router.push("/login?registered=1");
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Signup failed");
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
              Create your account
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Start auto-capturing trades and finding behavior patterns today.
            </p>
          </div>

          {apiError && (
            <div className="mt-6 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {[
              { id: "name", label: "Name", type: "text", placeholder: "Your name" },
              { id: "email", label: "Email", type: "email", placeholder: "you@example.com" },
              { id: "password", label: "Password", type: "password", placeholder: "At least 6 characters" },
            ].map((field) => (
              <div key={field.id}>
                <label htmlFor={field.id} className="text-sm font-bold text-gray-700">
                  {field.label}
                </label>
                <input
                  id={field.id}
                  type={field.type}
                  placeholder={field.placeholder}
                  value={form[field.id as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [field.id]: e.target.value })}
                  className={`mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${
                    errors[field.id] ? "border-rose-300" : "border-gray-200"
                  }`}
                />
                {errors[field.id] && (
                  <p className="mt-1 text-xs font-medium text-rose-600">
                    {errors[field.id]}
                  </p>
                )}
              </div>
            ))}

            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
              {loading ? "Creating account..." : "Sign Up"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-indigo-600 hover:text-indigo-500">
              Login
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
