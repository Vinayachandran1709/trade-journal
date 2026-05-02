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
        name: "IndiaCircle",
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
            setErrorMsg(err instanceof Error ? err.message : "Payment verification failed");
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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4 pt-20 text-center">
        <div className="glass-card max-w-md p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-3xl font-black text-emerald-600">
            ✓
          </div>
          <h1 className="mt-6 text-3xl font-black text-slate-950">You&apos;re on Pro</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            Your subscription is active. Unlimited capture and analytics are ready.
          </p>
          <button onClick={() => router.push("/dashboard")} className="btn-primary mt-8 w-full">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40 px-4 pb-16 pt-28 sm:px-6 lg:px-8">
      <div className="section-container grid max-w-5xl gap-8 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <span className="badge badge-indigo">Secure checkout</span>
          <h1 className="mt-5 text-5xl font-black tracking-tight text-slate-950">
            Upgrade to Pro
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-gray-600">
            Unlock auto-capture, AI pattern analysis, risk context, and the full
            IndiaCircle trading dashboard.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <span className="rounded-2xl border border-gray-100 bg-white p-4 text-sm font-bold text-gray-700 shadow-sm">
              256-bit SSL
            </span>
            <span className="rounded-2xl border border-gray-100 bg-white p-4 text-sm font-bold text-gray-700 shadow-sm">
              Razorpay Secure Payments
            </span>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-xl shadow-slate-200/70">
          <h2 className="text-xl font-black text-slate-950">Order summary</h2>
          <div className="mt-6 rounded-2xl bg-slate-950 p-5 text-white">
            <p className="text-sm font-semibold text-indigo-200">{PLAN_LABELS[plan] || plan}</p>
            <p className="mt-3 text-4xl font-black">{PLAN_AMOUNTS[plan] || ""}</p>
          </div>

          <ul className="mt-6 space-y-3 text-sm font-medium text-gray-600">
            <li>✓ Unlimited trade imports</li>
            <li>✓ Auto-capture from 10+ brokers</li>
            <li>✓ AI pattern analysis</li>
            <li>✓ Advanced P&amp;L analytics</li>
          </ul>

          {step === "error" && (
            <div className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {errorMsg}
            </div>
          )}

          <button onClick={handlePayment} disabled={step === "loading"} className="btn-primary mt-6 w-full disabled:opacity-60">
            {step === "loading" ? "Opening Razorpay..." : "Pay with Razorpay"}
          </button>

          <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-black text-gray-700">Have a coupon?</h3>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="FOUNDING"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
              <button onClick={handleApplyCoupon} disabled={couponLoading} className="btn-secondary px-4 disabled:opacity-60">
                {couponLoading ? "..." : "Apply"}
              </button>
            </div>
            {couponMsg && <p className="mt-2 text-sm font-semibold text-emerald-600">{couponMsg}</p>}
            {couponError && <p className="mt-2 text-sm font-semibold text-rose-600">{couponError}</p>}
          </div>
        </div>
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
