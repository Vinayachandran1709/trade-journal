import Link from "next/link";

const brokers = [
  "Zerodha",
  "Groww",
  "Angel One",
  "Upstox",
  "Dhan",
  "5Paisa",
  "ICICI Direct",
  "HDFC Securities",
  "Kotak",
  "Motilal Oswal",
];

const features = [
  {
    icon: "📝",
    title: "Auto Trade Journal",
    desc: "Every trade auto-captured from your broker. Zero typing, zero effort. Works with Zerodha, Groww, and 8 more.",
  },
  {
    icon: "🤖",
    title: "AI Market Intelligence",
    desc: "Ask 'Why is TCS moving?' and get a 3-sentence answer citing real news. Hover any stock name for instant data.",
  },
  {
    icon: "📊",
    title: "Behavioral Patterns",
    desc: "Discover hidden patterns: 'Your win rate drops 40% after 2 PM' or 'Revenge trades cost you ₹8,400/month.'",
  },
  {
    icon: "🛡️",
    title: "Trade Guard",
    desc: "Before you trade, see your risk score based on your history. Not advice, just data from your own execution.",
  },
  {
    icon: "📈",
    title: "Market Dashboard",
    desc: "Nifty, Bank Nifty, VIX, FII/DII flows, global cues, and movers in one sidebar. Stop juggling 10 tabs.",
  },
  {
    icon: "🧮",
    title: "Smart Calculators",
    desc: "Position sizing, R:R ratio, exact brokerage breakdown with STT, GST, and stamp duty for 7 Indian brokers.",
  },
];

const faqs = [
  {
    q: "Is this SEBI registered?",
    a: "IndiaCircle is a SaaS analytics tool, not an investment advisor. We do not provide buy, sell, or hold recommendations.",
  },
  {
    q: "Which brokers are supported?",
    a: "Zerodha, Groww, Angel One, Upstox, Dhan, 5Paisa, ICICI Direct, HDFC Securities, Kotak, and Motilal Oswal.",
  },
  {
    q: "Is my data safe?",
    a: "Trade data is encrypted in transit and stored on secure cloud infrastructure. Your journal is private to your account.",
  },
  {
    q: "How is this different from Sensibull?",
    a: "Sensibull focuses on options strategies. IndiaCircle focuses on your trade journal, behavior, risk patterns, and execution quality.",
  },
  {
    q: "Do you give buy/sell recommendations?",
    a: "No. We analyze your data and show patterns, risk context, and market information so you can make your own decisions.",
  },
];

function ExtensionMockup() {
  return (
    <div className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-slate-900/80 p-3 shadow-2xl shadow-indigo-950/40 backdrop-blur">
      <div className="rounded-[1.5rem] border border-slate-700 bg-slate-950 p-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              IndiaCircle Sidebar
            </p>
            <p className="mt-1 text-lg font-bold text-white">Market Pulse</p>
          </div>
          <span className="badge bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20">
            Live
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ["NIFTY 50", "22,642.75", "+0.84%", "text-emerald-400"],
            ["BANK NIFTY", "48,106.20", "-0.18%", "text-rose-400"],
            ["INDIA VIX", "13.42", "Moderate", "text-amber-300"],
          ].map(([label, value, change, color]) => (
            <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-2 text-xl font-black text-white">{value}</p>
              <p className={`mt-1 text-sm font-semibold ${color}`}>{change}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-white">Behavior Alert</p>
              <span className="badge bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20">
                Risk
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Afternoon trades are dragging your P&L. Your win rate after 2 PM is 31%
              across the last 43 completed trades.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="font-semibold text-white">Trade Guard</p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-emerald-400 to-indigo-500" />
            </div>
            <div className="mt-3 flex justify-between text-xs text-slate-400">
              <span>Setup score</span>
              <span className="font-semibold text-white">68/100</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="overflow-hidden bg-white">
      <section className="relative bg-slate-950 px-4 pb-36 pt-32 text-white sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:42px_42px]" />
        <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.38),transparent_60%)]" />
        <div className="section-container relative text-center">
          <div className="fade-in inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-indigo-100 shadow-sm backdrop-blur">
            🚀 First 100 users get 3 months Pro free · Code: FOUNDING
          </div>
          <h1 className="fade-in fade-in-delay-1 mx-auto mt-8 max-w-4xl text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl">
            Your AI copilot for the Indian stock market
          </h1>
          <p className="fade-in fade-in-delay-2 mt-4 text-3xl font-black sm:text-4xl">
            <span className="bg-gradient-to-r from-indigo-300 via-violet-200 to-emerald-300 bg-clip-text text-transparent">
              Trade smarter, not harder
            </span>
          </p>
          <p className="fade-in fade-in-delay-3 mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
            Auto-capture trades from Zerodha, Groww, and 10+ brokers. Get
            AI-powered insights, behavioral pattern analysis, and real-time market data
            all in one Chrome extension.
          </p>
          <div className="fade-in fade-in-delay-4 mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary w-full sm:w-auto">
              Get Started Free →
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15 sm:w-auto"
            >
              See How It Works
            </Link>
          </div>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <div className="flex -space-x-2">
              {["VI", "AK", "SM", "RJ", "NP"].map((avatar, index) => (
                <span
                  key={avatar}
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-slate-950 bg-gradient-to-br from-slate-700 to-indigo-500 text-[10px] font-bold text-white"
                  style={{ zIndex: 10 - index }}
                >
                  {avatar}
                </span>
              ))}
            </div>
            <p className="text-sm font-medium text-slate-300">
              Join 100+ traders already using IndiaCircle
            </p>
          </div>
        </div>
        <div className="absolute inset-x-4 -bottom-24 sm:-bottom-28">
          <ExtensionMockup />
        </div>
      </section>

      <section className="border-b border-gray-100 bg-white px-4 pb-12 pt-36 sm:px-6 lg:px-8">
        <div className="section-container text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-400">
            Supports all major Indian brokers
          </p>
          <div className="mt-6 overflow-hidden">
            <div className="flex min-w-max gap-6 text-sm font-semibold text-gray-500 sm:flex-wrap sm:justify-center">
              {brokers.map((broker) => (
                <span key={broker}>{broker}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding bg-gray-50">
        <div className="section-container grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <span className="badge badge-rose">Behavior is the hidden cost</span>
            <h2 className="mt-5 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              93% of Indian F&O traders lose money. The #1 reason? Behavioral
              mistakes they don&apos;t even see.
            </h2>
          </div>
          <div className="grid gap-4">
            {[
              ["₹51,689 Cr", "Lost by retail F&O traders in FY24 (SEBI data)"],
              ["95%", "of traders never review their past trades"],
              ["3x", "more losses from afternoon trading vs morning (avg pattern)"],
            ].map(([value, label]) => (
              <div key={value} className="stat-card">
                <p className="text-4xl font-black text-slate-950">{value}</p>
                <p className="mt-2 text-sm leading-6 text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="max-w-2xl">
            <span className="badge badge-indigo">Copilot stack</span>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950">
              One sidebar for journaling, market context, and self-awareness.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {features.map((feature) => (
              <div key={feature.title} className="feature-card fade-in">
                <div className="text-3xl">{feature.icon}</div>
                <h3 className="mt-5 text-xl font-black text-slate-950">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-gray-600">{feature.desc}</p>
                <Link href="/download" className="mt-5 inline-block text-sm font-bold text-indigo-600">
                  Learn more →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="section-padding bg-gray-50">
        <div className="section-container">
          <div className="text-center">
            <span className="badge badge-emerald">3 minute setup</span>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950">
              How It Works
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              ["01", "Install the Extension", "One click from Chrome Web Store. Works on Chrome, Edge, Brave."],
              ["02", "Trade Normally", "Open your broker as usual. IndiaCircle captures everything in the background."],
              ["03", "Get Smarter", "Review patterns, check risk scores, and make data-backed decisions."],
            ].map(([num, title, desc]) => (
              <div key={num} className="relative rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
                <span className="absolute right-6 top-4 bg-gradient-to-r from-indigo-100 to-violet-100 bg-clip-text text-7xl font-black text-transparent">
                  {num}
                </span>
                <h3 className="relative mt-16 text-xl font-black text-slate-950">{title}</h3>
                <p className="relative mt-3 text-sm leading-6 text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="text-center">
            <span className="badge badge-indigo">Simple pricing</span>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950">
              Start free. Upgrade when your journal gets serious.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
              <h3 className="text-xl font-black">Free</h3>
              <p className="mt-4 text-5xl font-black">₹0</p>
              <p className="mt-2 text-sm text-gray-500">forever</p>
              <ul className="mt-8 space-y-3 text-sm text-gray-600">
                {["Import up to 100 trades", "CSV imports", "P&L summary", "Basic trade history"].map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
              <Link href="/signup" className="btn-secondary mt-8 w-full">
                Start Free
              </Link>
            </div>
            <div className="gradient-border">
              <div className="p-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black">Pro</h3>
                  <span className="badge badge-indigo">Annual ₹4,999/year · save 30%</span>
                </div>
                <p className="mt-4 text-5xl font-black">₹599</p>
                <p className="mt-2 text-sm text-gray-500">per month</p>
                <ul className="mt-8 space-y-3 text-sm text-gray-600">
                  {["Unlimited trade imports", "Auto-capture from 10+ brokers", "AI pattern analysis", "Trade Guard risk context"].map((item) => (
                    <li key={item}>✓ {item}</li>
                  ))}
                </ul>
                <Link href="/checkout?plan=pro_monthly" className="btn-primary mt-8 w-full">
                  Upgrade to Pro
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-8 rounded-2xl bg-indigo-50 p-6 text-center text-sm font-semibold text-indigo-800">
            Founding members get 3 months Pro free with code FOUNDING.
          </div>
        </div>
      </section>

      <section className="section-padding bg-gray-50">
        <div className="section-container max-w-4xl">
          <h2 className="text-center text-4xl font-black tracking-tight text-slate-950">
            Questions traders ask before trusting a copilot
          </h2>
          <div className="mt-10 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {faqs.map((faq) => (
              <details key={faq.q} className="group p-6">
                <summary className="cursor-pointer list-none text-base font-bold text-slate-950">
                  {faq.q}
                </summary>
                <p className="mt-3 text-sm leading-6 text-gray-600">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-20 text-center text-white sm:px-6 lg:px-8">
        <div className="section-container">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
            Stop losing money to patterns you can&apos;t see
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Join IndiaCircle — your AI trading copilot
          </p>
          <Link href="/signup" className="btn-primary mt-8">
            Get Started Free →
          </Link>
          <p className="mt-4 text-sm text-slate-400">
            No credit card required · Works with all Indian brokers
          </p>
        </div>
      </section>

      <footer className="bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="section-container flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xl font-black text-slate-950">IndiaCircle</p>
            <p className="mt-3 text-sm text-gray-500">Made in India 🇮🇳 for Indian traders</p>
            <p className="mt-2 text-xs text-gray-400">
              © 2026 IndiaCircle. Not a SEBI-registered investment advisor.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-gray-600">
            {["Pricing", "Download", "Login", "Sign Up", "Privacy Policy", "Terms", "Twitter/X", "LinkedIn"].map((item) => (
              <Link
                key={item}
                href={
                  item === "Pricing"
                    ? "/pricing"
                    : item === "Download"
                      ? "/download"
                      : item === "Login"
                        ? "/login"
                        : item === "Sign Up"
                          ? "/signup"
                          : "#"
                }
                className="hover:text-indigo-600"
              >
                {item}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
