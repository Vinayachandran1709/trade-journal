"use client";

import { FormEvent, startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isAuthenticated, signupAndLogin, updatePreferences } from "@/lib/auth";
import type { UserPreferences } from "@/types/user";

const BROKER_OPTIONS = [
  "Zerodha",
  "Groww",
  "Angel One",
  "Upstox",
  "Dhan",
  "5Paisa",
  "Other",
] as const;

const SECTOR_OPTIONS = [
  "Banking",
  "IT",
  "Pharma",
  "Auto",
  "Energy",
  "FMCG",
  "Metals",
  "Realty",
] as const;

const STYLE_OPTIONS = [
  "Intraday",
  "Swing (2-7 days)",
  "Positional (weeks-months)",
  "Mixed",
] as const;

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

function SelectionGroup({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((option) => {
        const checked = selected.includes(option);
        return (
          <label
            key={option}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
              checked
                ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              checked={checked}
              onChange={() => onToggle(option)}
            />
            <span className="font-medium">{option}</span>
          </label>
        );
      })}
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"account" | "preferences">("account");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [preferences, setPreferences] = useState<UserPreferences>({
    brokers: [],
    sectors: [],
    style: null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const passwordWarning =
    form.password.length >= 6 && form.password.length < 8
      ? "Weak password. Use 8+ characters for better security."
      : "";

  useEffect(() => {
    router.prefetch("/dashboard");
    router.prefetch("/welcome");
    if (isAuthenticated()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const canSavePreferences = useMemo(() => {
    return (
      preferences.brokers.length > 0 ||
      preferences.sectors.length > 0 ||
      preferences.style !== null
    );
  }, [preferences]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "Name is required";
    if (!form.email) nextErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) nextErrors.email = "Invalid email";
    if (!form.password) nextErrors.password = "Password is required";
    else if (form.password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const finishSignupFlow = () => {
    startTransition(() => {
      router.push("/welcome?source=signup");
    });
  };

  const togglePreference = (key: "brokers" | "sectors", value: string) => {
    setPreferences((current) => {
      const exists = current[key].includes(value);
      return {
        ...current,
        [key]: exists
          ? current[key].filter((item) => item !== value)
          : [...current[key], value],
      };
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setApiError("");
    if (!validate()) return;

    setLoading(true);
    try {
      await signupAndLogin({
        email: form.email,
        password: form.password,
        name: form.name || undefined,
      });
      setStep("preferences");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    setApiError("");
    setSavingPreferences(true);
    try {
      await updatePreferences(preferences);
      finishSignupFlow();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to save preferences");
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleSkip = () => {
    finishSignupFlow();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 via-white to-indigo-50/40 px-4 pb-16 pt-28">
      <div className="w-full max-w-2xl">
        <div className="glass-card p-8">
          <LogoMark />

          {step === "account" ? (
            <>
              <div className="mt-8 text-center">
                <h1 className="text-3xl font-black tracking-tight text-slate-950">
                  Create your account
                </h1>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Start auto-capturing trades and finding behavior patterns today.
                </p>
              </div>

              {apiError ? (
                <div className="mt-6 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">
                  {apiError}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                {[
                  { id: "name", label: "Name", type: "text", placeholder: "Your name" },
                  { id: "email", label: "Email", type: "email", placeholder: "you@example.com" },
                  {
                    id: "password",
                    label: "Password",
                    type: "password",
                    placeholder: "At least 6 characters",
                  },
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
                    {errors[field.id] ? (
                      <p className="mt-1 text-xs font-medium text-rose-600">
                        {errors[field.id]}
                      </p>
                    ) : null}
                    {field.id === "password" && !errors.password && passwordWarning ? (
                      <p className="mt-1 text-xs font-medium text-amber-600">
                        {passwordWarning}
                      </p>
                    ) : null}
                  </div>
                ))}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full disabled:opacity-60"
                >
                  {loading ? "Creating account..." : "Sign Up"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-500">
                Already have an account?{" "}
                <Link href="/login" className="font-bold text-indigo-600 hover:text-indigo-500">
                  Login
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="mt-8 text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
                  Help us personalize your dashboard
                </p>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                  Tell us what you trade
                </h1>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  We&apos;ll use this to prioritize relevant sectors and broker workflows.
                </p>
              </div>

              {apiError ? (
                <div className="mt-6 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">
                  {apiError}
                </div>
              ) : null}

              <div className="mt-8 space-y-8">
                <section>
                  <h2 className="text-sm font-bold text-gray-800">Which brokers do you use?</h2>
                  <div className="mt-3">
                    <SelectionGroup
                      options={BROKER_OPTIONS}
                      selected={preferences.brokers}
                      onToggle={(value) => togglePreference("brokers", value)}
                    />
                  </div>
                </section>

                <section>
                  <h2 className="text-sm font-bold text-gray-800">Which sectors interest you?</h2>
                  <div className="mt-3">
                    <SelectionGroup
                      options={SECTOR_OPTIONS}
                      selected={preferences.sectors}
                      onToggle={(value) => togglePreference("sectors", value)}
                    />
                  </div>
                </section>

                <section>
                  <h2 className="text-sm font-bold text-gray-800">Your trading style?</h2>
                  <div className="mt-3 grid gap-3">
                    {STYLE_OPTIONS.map((option) => {
                      const selected = preferences.style === option;
                      return (
                        <label
                          key={option}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                            selected
                              ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="trading-style"
                            className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            checked={selected}
                            onChange={() =>
                              setPreferences((current) => ({ ...current, style: option }))
                            }
                          />
                          <span className="font-medium">{option}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>

                <div className="space-y-4">
                  <button
                    type="button"
                    disabled={savingPreferences || !canSavePreferences}
                    onClick={handleSavePreferences}
                    className="btn-primary w-full disabled:opacity-60"
                  >
                    {savingPreferences ? "Saving preferences..." : "Save and Continue"}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleSkip}
                      className="text-sm font-semibold text-gray-500 underline-offset-4 hover:text-gray-700 hover:underline"
                    >
                      Skip for now
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
