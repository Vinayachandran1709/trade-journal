import Link from "next/link";

const FREE_FEATURES = [
  "Import up to 100 trades",
  "Zerodha & Groww CSV import",
  "P&L summary",
  "Basic trade history",
];

const PRO_FEATURES = [
  "Unlimited trade imports",
  "Auto-capture from 10+ brokers",
  "AI pattern analysis",
  "Behavioral insights & alerts",
  "Trade emotion tagging",
  "Advanced P&L analytics",
  "Priority support",
];

const COMPARISON_ROWS = [
  { label: "Trade imports", free: "Up to 100", pro: "Unlimited" },
  { label: "Brokers supported", free: "Zerodha, Groww", pro: "10+ brokers" },
  { label: "Auto-capture extension", free: false, pro: true },
  { label: "AI pattern analysis", free: false, pro: true },
  { label: "Behavioral insights", free: false, pro: true },
  { label: "Emotion tagging", free: false, pro: true },
  { label: "Advanced P&L analytics", free: false, pro: true },
  { label: "Priority support", free: false, pro: true },
];

function Check() {
  return (
    <svg
      className="mx-auto h-5 w-5 text-indigo-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function Cross() {
  return (
    <svg
      className="mx-auto h-5 w-5 text-gray-300"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      {/* Founding member banner */}
      <div className="mb-10 rounded-xl bg-indigo-600 px-6 py-4 text-center text-white">
        <p className="text-sm font-semibold tracking-wide uppercase opacity-80">
          Limited offer
        </p>
        <p className="mt-1 text-xl font-bold">
          First 100 users get 3 months Pro free
        </p>
        <p className="mt-1 text-sm opacity-80">
          Use code <span className="font-mono font-bold">FOUNDING</span> at checkout — no credit card required
        </p>
      </div>

      <h1 className="text-center text-4xl font-extrabold tracking-tight">
        Simple, transparent pricing
      </h1>
      <p className="mt-3 text-center text-lg text-gray-500">
        Start free. Upgrade when you need more power.
      </p>

      {/* Plan cards */}
      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        {/* Free */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-700">Free</h2>
          <p className="mt-2 text-4xl font-extrabold">₹0</p>
          <p className="mt-1 text-sm text-gray-400">forever</p>
          <ul className="mt-8 space-y-3">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-gray-600">
                <Check />
                {f}
              </li>
            ))}
          </ul>
          <Link
            href="/signup"
            className="mt-8 block rounded-lg border border-gray-300 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Start Free
          </Link>
        </div>

        {/* Pro */}
        <div className="relative rounded-2xl border-2 border-indigo-600 bg-white p-8 shadow-lg">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold text-white">
            Most popular
          </span>
          <h2 className="text-lg font-semibold text-indigo-600">Pro</h2>
          <div className="mt-2 flex items-end gap-2">
            <p className="text-4xl font-extrabold">₹599</p>
            <p className="mb-1 text-sm text-gray-400">/month</p>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            or{" "}
            <span className="font-semibold text-gray-700">₹4,999/year</span>{" "}
            <span className="text-green-600">(save ₹2,189)</span>
          </p>
          <ul className="mt-8 space-y-3">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-gray-600">
                <Check />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-8 space-y-3">
            <Link
              href="/checkout?plan=pro_annual"
              className="block rounded-lg bg-indigo-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Upgrade to Pro Annual
            </Link>
            <Link
              href="/checkout?plan=pro_monthly"
              className="block rounded-lg border border-indigo-200 py-2.5 text-center text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
            >
              Monthly — ₹599/month
            </Link>
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div className="mt-20">
        <h2 className="mb-6 text-center text-2xl font-bold">
          Feature comparison
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left font-medium text-gray-500">
                  Feature
                </th>
                <th className="px-6 py-3 text-center font-medium text-gray-500">
                  Free
                </th>
                <th className="px-6 py-3 text-center font-medium text-indigo-600">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label}>
                  <td className="px-6 py-4 font-medium text-gray-700">
                    {row.label}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {typeof row.free === "boolean" ? (
                      row.free ? (
                        <Check />
                      ) : (
                        <Cross />
                      )
                    ) : (
                      <span className="text-gray-600">{row.free}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {typeof row.pro === "boolean" ? (
                      row.pro ? (
                        <Check />
                      ) : (
                        <Cross />
                      )
                    ) : (
                      <span className="font-semibold text-indigo-600">
                        {row.pro}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Founding coupon CTA */}
      <div className="mt-16 rounded-xl bg-gray-50 px-8 py-10 text-center">
        <h3 className="text-xl font-bold">Already have a coupon?</h3>
        <p className="mt-2 text-sm text-gray-500">
          Apply your <span className="font-mono font-semibold">FOUNDING</span> code on the checkout page.
        </p>
        <Link
          href="/checkout?plan=pro_monthly"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Redeem Coupon
        </Link>
      </div>
    </div>
  );
}
