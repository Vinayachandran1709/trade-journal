"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { applyCoupon, createOrder, verifyPayment } from "@/lib/billing";
import { isAuthenticated } from "@/lib/auth";

const PLAN_LABELS: Record<string, string> = {
  pro_monthly: "Pro Monthly — ₹599/month",
  pro_annual: "Pro Annual — ₹4,999/year",
};

const PLAN_AMOUNTS: Record<string, string> = {
  pro_monthly: "₹599",
  pro_annual: "₹4,999",
};

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: () => void) => void;
    };
  }
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const plan = searchParams.get("plan") || "pro_monthly";

  const [step, setStep] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMsg, setCouponMsg] = useState("");
  const [couponError, setCouponError] = useState("");
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push(`/login?redirect=/checkout?plan=${plan}`);
    }
  }, [plan, router]);

  function loadRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (scriptLoaded.current) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => {
        scriptLoaded.current = true;
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
      document.body.appendChild(script);
    });
  }

  async function handlePayment() {
    setStep("loading");
    setErrorMsg("");
    try {
      await loadRazorpayScript();
      const order = await createOrder(plan);

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: "TradeIntel",
        description: PLAN_LABELS[plan] || plan,
        prefill: {},
        theme: { color: "#4f46e5" },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await verifyPayment(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature
            );
            setStep("success");
          } catch (err) {
            setStep("error");
            setErrorMsg(
              err instanceof Error ? err.message : "Payment verification failed"
            );
          }
        },
        modal: {
          ondismiss: () => {
            setStep("idle");
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", () => {
        setStep("error");
        setErrorMsg("Payment failed. Please try again.");
      });
      rzp.open();
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleApplyCoupon() {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError("");
    setCouponMsg("");
    try {
      const res = await applyCoupon(couponCode.trim());
      setCouponMsg(res.message);
      setStep("success");
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : "Invalid coupon");
    } finally {
      setCouponLoading(false);
    }
  }

  if (step === "success") {
    return (
      <div className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-4 text-center">
        <div className="rounded-full bg-green-100 p-5">
          <svg
            className="h-10 w-10 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-bold">You're on Pro!</h1>
        <p className="mt-2 text-gray-500">
          Your subscription is now active. Enjoy unlimited access.
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          className="mt-8 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold">Upgrade to Pro</h1>
        <p className="mt-1 text-gray-500">
          {PLAN_LABELS[plan] || plan}
        </p>

        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <span className="font-medium">{PLAN_LABELS[plan] || plan}</span>
            <span className="text-lg font-bold">
              {PLAN_AMOUNTS[plan] || ""}
            </span>
          </div>

          <ul className="mt-4 space-y-2 text-sm text-gray-500">
            <li>✓ Unlimited trade imports</li>
            <li>✓ Auto-capture from 10+ brokers</li>
            <li>✓ AI pattern analysis</li>
            <li>✓ Advanced P&amp;L analytics</li>
          </ul>

          {step === "error" && (
            <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <button
            onClick={handlePayment}
            disabled={step === "loading"}
            className="mt-6 w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {step === "loading" ? "Opening payment..." : "Pay with Razorpay"}
          </button>
        </div>

        {/* Coupon section */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-700">
            Have a coupon? (e.g. FOUNDING)
          </h2>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              placeholder="Enter code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <button
              onClick={handleApplyCoupon}
              disabled={couponLoading}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
            >
              {couponLoading ? "..." : "Apply"}
            </button>
          </div>
          {couponMsg && (
            <p className="mt-2 text-sm text-green-600">{couponMsg}</p>
          )}
          {couponError && (
            <p className="mt-2 text-sm text-red-600">{couponError}</p>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Secured by Razorpay · Cancel anytime
        </p>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutContent />
    </Suspense>
  );
}
