"use client";

import Link from "next/link";
import { useState } from "react";

const FREE_FEATURES = [
  "Import up to 100 trades",
  "CSV imports and trade review",
  "P&L summary and trade history",
  "Research preview access",
  "Build your sample before upgrading",
];

const PRO_FEATURES = [
  "Unlimited trade imports",
  "Live market sidebar",
  "Research / Why Is It Moving",
  "Trade Guard risk scoring",
  "Behavioral patterns",
  "Mistakes review",
  "Auto-capture from 10+ brokers",
  "Emotion tags",
  "Advanced P&L analytics",
];

const COMPARISON_ROWS = [
  { label: "Trade imports", free: "Up to 100", pro: "Unlimited" },
  { label: "Brokers supported", free: "Zerodha, Groww", pro: "10+ brokers" },
  { label: "Auto-capture extension", free: false, pro: true },
  { label: "Live market sidebar", free: false, pro: true },
  { label: "Research / Why Is It Moving", free: false, pro: true },
  { label: "Behavioral patterns", free: false, pro: true },
  { label: "Trade Guard risk scoring", free: false, pro: true },
  { label: "Mistakes review", free: false, pro: true },
  { label: "Emotion tagging", free: false, pro: true },
  { label: "Advanced P&L analytics", free: false, pro: true },
];

const FAQS = [
  ["Can I start without a card?", "Yes. The free plan does not require a credit card."],
  ["Can I use the FOUNDING coupon?", "Yes. Apply FOUNDING during checkout to unlock the founding offer."],
  ["Can I cancel Pro?", "Yes. Your account and review history stay available, and billing can be managed from your account."],
];

function Check() {
  return <span className="font-black text-emerald-500">✓</span>;
}

function Cross() {
  return <span className="font-black text-gray-300">×</span>;
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);
  const proPrice = annual ? "₹4,999" : "₹599";
  const proSuffix = annual ? "/year" : "/month";
  const checkoutPlan = annual ? "pro_annual" : "pro_monthly";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40 px-4 pb-20 pt-28 sm:px-6 lg:px-8">
      <div className="section-container">
        <div className="rounded-3xl bg-slate-950 p-6 text-center text-white shadow-xl shadow-slate-200">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-indigo-200">
            Founding member offer
          </p>
          <p className="mt-2 text-2xl font-black">First 100 users get 3 months Pro free</p>
          <p className="mt-2 text-sm text-slate-300">
            Use code <span className="font-mono font-black text-white">FOUNDING</span> at checkout.
          </p>
        </div>

        <div className="mt-14 text-center">
          <span className="badge badge-indigo">Pricing</span>
          <h1 className="mx-auto mt-5 max-w-3xl text-5xl font-black tracking-tight text-slate-950">
            Plans for traders who want better context and steadier discipline
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-gray-600">
            Start free with imports and review. Upgrade for auto-capture, live sidebar intelligence, behavioral coaching, and Trade Guard.
          </p>

          <div className="mt-8 inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                !annual ? "bg-slate-950 text-white" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                annual ? "bg-slate-950 text-white" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Annual · save 30%
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Free</h2>
            <div className="mt-5 flex items-end gap-2">
              <span className="text-5xl font-black">₹0</span>
              <span className="pb-2 text-sm font-semibold text-gray-500">/forever</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-gray-500">
              Review your trades. Build your sample.
            </p>
            <ul className="mt-8 space-y-4">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm font-medium text-gray-700">
                  <Check /> {feature}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="btn-secondary mt-10 w-full">
              Start Free
            </Link>
          </div>

          <div className="gradient-border">
            <div className="relative p-8 shadow-xl">
              <span className="badge badge-indigo absolute right-6 top-6">Popular</span>
              <h2 className="text-xl font-black text-indigo-600">Pro</h2>
              <div className="mt-5 flex items-end gap-2">
                <span className="text-5xl font-black">{proPrice}</span>
                <span className="pb-2 text-sm font-semibold text-gray-500">{proSuffix}</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-gray-500">
                Trade with live context and self-awareness.
              </p>
              <ul className="mt-8 space-y-4">
                {PRO_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm font-medium text-gray-700">
                    <Check /> {feature}
                  </li>
                ))}
              </ul>
              <Link href={`/checkout?plan=${checkoutPlan}`} className="btn-primary mt-10 w-full">
                Upgrade to Pro
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-16 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="grid grid-cols-[1.5fr_0.75fr_0.75fr] bg-gray-50 px-5 py-4 text-sm font-black text-gray-500">
            <span>Feature</span>
            <span className="text-center">Free</span>
            <span className="text-center text-indigo-600">Pro</span>
          </div>
          {COMPARISON_ROWS.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[1.5fr_0.75fr_0.75fr] border-t border-gray-100 px-5 py-4 text-sm"
            >
              <span className="font-semibold text-gray-800">{row.label}</span>
              <span className="text-center text-gray-600">
                {typeof row.free === "boolean" ? row.free ? <Check /> : <Cross /> : row.free}
              </span>
              <span className="text-center font-bold text-indigo-600">
                {typeof row.pro === "boolean" ? row.pro ? <Check /> : <Cross /> : row.pro}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {FAQS.map(([q, a]) => (
            <div key={q} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="font-black text-slate-950">{q}</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
