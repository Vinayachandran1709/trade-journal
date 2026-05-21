"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
    icon: "📓",
    label: "JOURNAL",
    title: "Auto-Journal",
    desc: "Open Zerodha, open Groww - IndiaCircle sees every trade you make and logs it automatically. No screenshots, no Excel, no end-of-day typing. You trade. Your journal fills itself.",
  },
  {
    icon: "🔍",
    label: "RESEARCH",
    title: "AI Research",
    desc: "VEDL is suddenly up 4%. Why? Type the question, get the answer in 3 seconds - news, filings, sector moves, all summarized. Stop drowning in 30 open tabs every morning.",
  },
  {
    icon: "📊",
    label: "PATTERNS",
    title: "Behavioral Patterns",
    desc: "After 20 trades, IndiaCircle tells you things like: your win rate drops from 55% to 22% on volatile days, or revenge trades within 15 minutes of a loss have 18% win rate. Your data, in plain language.",
  },
  {
    icon: "🛡️",
    label: "GUARD",
    title: "Trade Guard",
    desc: "Before you click Buy, see a risk score built from YOUR past trades. Not generic advice - your own history scoring this exact setup. A pre-trade checkpoint for impulsive decisions.",
  },
  {
    icon: "📈",
    label: "MARKET",
    title: "Market Dashboard",
    desc: "Nifty, Bank Nifty, India VIX, FII/DII flows, sector heatmap, your watchlist - all live in the sidebar. No more juggling Moneycontrol, TradingView, and your broker in separate tabs.",
  },
  {
    icon: "🧮",
    label: "CALCULATE",
    title: "Calculators",
    desc: "Exact position size for your risk tolerance. R:R ratio before you enter. Brokerage breakdown for every Indian broker including STT, stamp duty, and GST. Numbers, not guesswork.",
  },
];

const howItWorks = [
  {
    num: "01",
    title: "Install & Connect",
    time: "2 minutes",
    desc: "Add the Chrome extension. Log in. That's it. No API keys, no broker credentials, no complicated setup. IndiaCircle reads what you already see on your broker's page.",
  },
  {
    num: "02",
    title: "Trade Like You Always Do",
    time: "Day 1 onward",
    desc: "Open Zerodha, Groww, or any supported broker. IndiaCircle silently captures every trade - entry, exit, price, time, quantity. Your journal builds itself while you focus on trading.",
  },
  {
    num: "03",
    title: "Your Patterns Surface",
    time: "After ~20 trades",
    desc: "The behavioral engine finds what you can't see - revenge trading habits, time-of-day weaknesses, which setups actually make you money, and which ones quietly drain your account.",
  },
  {
    num: "04",
    title: "Trade With Your Data as Coach",
    time: "Ongoing",
    desc: "Pre-trade risk scores before you click Buy. Real-time alerts when you're repeating a costly pattern. Weekly reports showing exactly what to fix. Your own data telling you what to do differently.",
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
  {
    q: "Can IndiaCircle see my broker password?",
    a: "No. IndiaCircle reads what's already visible on your screen - like a friend looking over your shoulder at your trades page. It never accesses your broker account, never places trades, and never touches your credentials.",
  },
  {
    q: "Does this work for options and F&O traders?",
    a: "Yes. IndiaCircle captures equity and F&O trades across all supported brokers. The behavioral engine works on any trade type - intraday, swing, options, delivery.",
  },
  {
    q: "I already use Excel for journaling. Why switch?",
    a: "Because you probably stopped updating it after 2 weeks. IndiaCircle captures everything automatically - no typing, no forgetting, no end-of-day chore. And it actually analyzes your patterns, which Excel never will.",
  },
];

function TypingLoop({ items }: { items: string[] }) {
  const [itemIndex, setItemIndex] = useState(0);
  const [value, setValue] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = items[itemIndex];
    let timeout = 40;

    if (!deleting) {
      if (value.length < current.length) {
        timeout = 40;
      } else {
        timeout = 2500;
      }
    } else if (value.length > 0) {
      timeout = 25;
    } else {
      timeout = 300;
    }

    const timer = window.setTimeout(() => {
      if (!deleting) {
        if (value.length < current.length) {
          setValue(current.slice(0, value.length + 1));
        } else {
          setDeleting(true);
        }
        return;
      }

      if (value.length > 0) {
        setValue(current.slice(0, value.length - 1));
        return;
      }

      setDeleting(false);
      setItemIndex((prev) => (prev + 1) % items.length);
    }, timeout);

    return () => window.clearTimeout(timer);
  }, [deleting, itemIndex, items, value]);

  return (
    <div className="mx-auto mt-5 min-h-[3.5rem] max-w-4xl text-xl font-semibold sm:min-h-[2.75rem] sm:text-2xl">
      <span className="bg-gradient-to-r from-indigo-300 via-violet-200 to-emerald-300 bg-clip-text text-transparent">
        {value}
      </span>
      <span className="typing-cursor" />
    </div>
  );
}

function ExtensionMockup() {
  return (
    <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-slate-900/80 p-3 shadow-2xl shadow-indigo-950/40 backdrop-blur lg:scale-[1.04]">
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
              <p className="text-xs font-medium text-slate-500 lg:text-sm">{label}</p>
              <p className="mt-2 text-xl font-black text-white lg:text-2xl">{value}</p>
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

function FeatureCard({
  icon,
  label,
  title,
  desc,
}: {
  icon: string;
  label: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="feature-card fade-in">
      <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        {icon} {label}
      </div>
      <h3 className="mt-5 text-xl font-black text-slate-950">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">{desc}</p>
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
            Founding member spots open · 3 months Pro free · Only 100 seats
          </div>
          <h1 className="fade-in fade-in-delay-1 mx-auto mt-8 max-w-7xl text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
            Your trades have a story. 
            <br />
            Most traders never read it.
          </h1>
          <div className="fade-in fade-in-delay-2">
            <TypingLoop
              items={[
                "Your revenge trades cost you Rs 8,240 last month",
                "Win rate drops from 62% to 28% after 2 PM",
                "Banking momentum setups win 68% of the time",
                "You overtrade 2.3x on high-VIX days",
                "VEDL is up 4.2% - here's why, in 3 seconds",
                "Position sizing saved you Rs 12,000 this week",
              ]}
            />
          </div>
          <p className="fade-in fade-in-delay-3 mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
            IndiaCircle watches your trades silently, finds the patterns you can&apos;t
            see, and shows you exactly where you&apos;re bleeding money - and where
            you&apos;re winning. Works with Zerodha, Groww, and every Indian broker.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">No API keys</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">No broker credentials</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Analytics tool, not advisory</span>
          </div>
          <div className="fade-in fade-in-delay-4 mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary w-full sm:w-auto">
              Get Started Free {"->"}
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15 sm:w-auto"
            >
              See How It Works
            </Link>
          </div>
          <div className="mt-8 grid gap-3 lg:grid-cols-3">
            <div className="proof-strip-card">
              <div className="proof-stat-label">Pattern / money leak</div>
              <p className="mt-2 text-sm font-semibold text-white">
                A midday re-entry cluster is draining P&amp;L faster than your average losing setup.
              </p>
            </div>
            <div className="proof-strip-card">
              <div className="proof-stat-label">Timing / behavior</div>
              <p className="mt-2 text-sm font-semibold text-white">
                Your weaker window shows up after lunch, not at the open, so review timing before size.
              </p>
            </div>
            <div className="proof-strip-card">
              <div className="proof-stat-label">Edge found</div>
              <p className="mt-2 text-sm font-semibold text-white">
                One setup family is doing the real work, which makes it easier to trade less and better.
              </p>
            </div>
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

      <section className="bg-white px-4 py-8 sm:px-6 lg:px-8">
        <div className="section-container grid gap-3 md:grid-cols-4">
          {[
            "No broker password access",
            "Private journal in your account",
            "Built for Indian brokers",
            "No buy or sell calls",
          ].map((item) => (
            <div key={item} className="neutral-shell-card px-4 py-4 text-sm font-semibold text-slate-700">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="section-padding bg-gray-50">
        <div className="section-container grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <span className="badge badge-rose">What SEBI&apos;s data actually says</span>
            <h2 className="mt-5 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              93% of Indian F&O traders lose money. The #1 reason? Behavioral
              mistakes they do not even see.
            </h2>
          </div>
          <div className="grid gap-4">
            {[
              ["Rs 51,689 Cr", "Lost by retail F&O traders in FY24 (SEBI data)", "Behavior mistakes are expensive when they stay invisible."],
            ].map((item) => (
              <div key={item[0]} className="stat-card">
                <p className="text-4xl font-black text-slate-950">{item[0]}</p>
                <p className="mt-2 text-sm leading-6 text-gray-500">{item[1]}</p>
                <p className="mt-2 text-xs font-semibold italic text-indigo-600">{item[2]}</p>
              </div>
            ))}
            <div className="stat-card">
              <p className="text-lg font-black text-slate-950">What IndiaCircle does with that lesson</p>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                It turns your own execution history into rules you can actually use before the next mistake repeats.
              </p>
            </div>
          </div>
        </div>
        <p className="section-container sebi-footnote">
          Source note: the SEBI-backed figure above refers to retail F&amp;O losses in FY24. IndiaCircle is an analytics and journaling product, not an investment advisor.
        </p>
      </section>

      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="max-w-2xl">
            <span className="badge badge-indigo">What&apos;s inside the sidebar</span>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950">
              Six tools that used to take six tabs. Now they live in one sidebar.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="section-padding bg-gray-50">
        <div className="section-container">
          <div className="text-center">
            <span className="badge badge-emerald">From install to insight in 20 trades</span>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950">
              How It Works
            </h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((step) => (
              <div key={step.num} className="relative rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
                <span className="absolute right-6 top-4 bg-gradient-to-r from-indigo-100 to-violet-100 bg-clip-text text-7xl font-black text-transparent">
                  {step.num}
                </span>
                <div className="relative mt-16">
                  <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-600">
                    {step.time}
                  </span>
                </div>
                <h3 className="relative mt-3 text-xl font-black text-slate-950">{step.title}</h3>
                <p className="relative mt-3 text-sm leading-6 text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-slate-950 text-white">
        <div className="section-container text-center">
          <h2 className="text-3xl font-black">What shows up in your sidebar</h2>
          <p className="mt-4 text-lg text-slate-400">
            Real output from IndiaCircle - not mockups, not promises
          </p>

          <div className="mt-12 grid gap-5 text-left sm:grid-cols-2">
            <div className="rounded-xl border-l-[3px] border-l-rose-500 bg-slate-900/80 p-5">
              <span className="text-xs font-bold uppercase tracking-wide text-rose-400">
                ⚠️ Pattern Alert
              </span>
              <p className="mt-2 text-base font-bold text-white">
                &quot;Your revenge trades cost you Rs 15,000/month&quot;
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                Trades entered within 15 min of a loss: 18% win rate vs normal 52%.
              </p>
            </div>
            <div className="rounded-xl border-l-[3px] border-l-blue-500 bg-slate-900/80 p-5">
              <span className="text-xs font-bold uppercase tracking-wide text-blue-400">
                🔍 AI Research
              </span>
              <p className="mt-2 text-base font-bold text-white">Why is VEDL up 4.2% today?</p>
              <p className="mt-1.5 text-sm text-slate-400">
                Coal ministry approved 3 new mining licenses. Sector-wide impact. HINDALCO,
                SAIL also moving on volume.
              </p>
            </div>
            <div className="rounded-xl border-l-[3px] border-l-amber-500 bg-slate-900/80 p-5">
              <span className="text-xs font-bold uppercase tracking-wide text-amber-400">
                🛡️ Trade Guard
              </span>
              <p className="mt-2 text-base font-bold text-white">
                This setup scores 34/100 based on your history
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                You&apos;ve taken 7 similar trades. Win rate: 14%. Average loss: Rs 3,200.
                Your data says: skip this one.
              </p>
            </div>
            <div className="rounded-xl border-l-[3px] border-l-emerald-500 bg-slate-900/80 p-5">
              <span className="text-xs font-bold uppercase tracking-wide text-emerald-400">
                📓 Auto-Journal
              </span>
              <p className="mt-2 text-base font-bold text-white">
                3 trades captured today - all logged
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                BUY RELIANCE 2,480 @ 9:32 AM → SELL 2,496 @ 11:15 AM → P&amp;L: +Rs 1,600.
                No manual entry.
              </p>
            </div>
            <div className="rounded-xl border-l-[3px] border-l-violet-500 bg-slate-900/80 p-5">
              <span className="text-xs font-bold uppercase tracking-wide text-violet-400">
                📊 Market Pulse
              </span>
              <p className="mt-2 text-base font-bold text-white">
                NIFTY 22,642 (+0.84%) · Bank Nifty 48,106 (-0.18%)
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                FII bought Rs 2,400 Cr today. Banking sector leading. 4 of 8 watchlist
                stocks green.
              </p>
            </div>
            <div className="rounded-xl border-l-[3px] border-l-cyan-500 bg-slate-900/80 p-5">
              <span className="text-xs font-bold uppercase tracking-wide text-cyan-400">
                🧮 Position Calculator
              </span>
              <p className="mt-2 text-base font-bold text-white">
                Risk Rs 5,000 on TATAMOTORS? Here&apos;s your exact size
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                Entry: 982. Stop: 968. Size: 35 shares. Target 1,010 = 2:1 R:R.
              </p>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-slate-500">
            Every card above is a real feature. Every number is the kind of insight
            IndiaCircle generates from your data.
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="section-container">
          <h2 className="text-center text-3xl font-black text-slate-950">
            Monday morning with IndiaCircle vs. without it
          </h2>

          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/30 p-8">
              <h3 className="text-lg font-bold text-rose-700">Without IndiaCircle</h3>
              <ul className="mt-4 space-y-4 text-sm text-rose-800">
                <li className="leading-relaxed">✗ You took a revenge trade Friday. You don&apos;t even know it was one.</li>
                <li className="leading-relaxed">✗ Position was 3x your normal size - emotions took over after a loss.</li>
                <li className="leading-relaxed">✗ Same failing setup for 6 weeks. No data to prove it.</li>
                <li className="leading-relaxed">✗ The mistake you made Thursday? Same one as Tuesday.</li>
                <li className="leading-relaxed">✗ 25 minutes across 8 tabs to figure out why VEDL moved.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-8">
              <h3 className="text-lg font-bold text-emerald-700">With IndiaCircle</h3>
              <ul className="mt-4 space-y-4 text-sm text-emerald-800">
                <li className="leading-relaxed">✓ IndiaCircle flagged the revenge trade before you clicked Buy.</li>
                <li className="leading-relaxed">✓ Position calculator showed the right size for your risk tolerance.</li>
                <li className="leading-relaxed">✓ Behavioral engine said this setup has 19% win rate across 12 trades.</li>
                <li className="leading-relaxed">✓ Weekly correction plan showed exactly which pattern to fix.</li>
                <li className="leading-relaxed">✓ &quot;Why is VEDL moving?&quot; - answered in 3 seconds from the sidebar.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="text-center">
            <span className="badge badge-indigo">One plan. Clear value.</span>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950">
              Rs 599/month to stop repeating mistakes that cost you lakhs.
            </h2>
            <p className="mt-4 text-sm font-semibold text-slate-600">
              Avoiding even one impulsive mistake can cover months of subscription.
            </p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
              <h3 className="text-xl font-black">Free</h3>
              <p className="mt-4 text-5xl font-black">Rs 0</p>
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
                  <span className="badge badge-indigo">Annual Rs 4,999/year · save 30%</span>
                </div>
                <p className="mt-4 text-5xl font-black">Rs 599</p>
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
            First 100 founding members get 3 months Pro free - use code FOUNDING at checkout.
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
            Your next revenge trade will cost you. 
            <br />
            Unless your data warns you first.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            The patterns are already in your data. IndiaCircle makes them visible.
          </p>
          <Link href="/signup" className="btn-primary mt-8">
            Get Started Free {"->"}
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
            <p className="mt-3 text-sm text-gray-500">Made in India for Indian traders</p>
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
