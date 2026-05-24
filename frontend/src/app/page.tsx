"use client";

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

const featureCards = [
  {
    label: "Market Intelligence Feed",
    title: "See why the market is moving",
    desc: "Track sector narratives, FII/DII context, earnings reactions, and retail attention previews inside one Chrome sidebar.",
  },
  {
    label: "Trade Guard",
    title: "Catch risk before execution quality slips",
    desc: "Use your own history, discipline patterns, and market regime context to spot higher-risk moments before they repeat.",
  },
  {
    label: "Behavioral Coaching",
    title: "Turn post-close review into usable rules",
    desc: "IndiaCircle surfaces repeat mistakes, missing review gaps, and the behaviors quietly draining your P&L.",
  },
  {
    label: "Auto-Capture",
    title: "Keep your history connected",
    desc: "Capture trades automatically or import CSVs from 10+ brokers without sharing broker credentials.",
  },
];

const previewCards = [
  {
    title: "Sidepanel",
    label: "Market Pulse + Trade Guard",
    body: "Example output: market context, risk warnings, and a trader-specific behavior alert beside your broker screen.",
  },
  {
    title: "Dashboard",
    label: "Today's Trader Insight",
    body: "Sample insight: your discipline weakens after 2 PM, so late-session entries deserve extra review.",
  },
  {
    title: "Patterns",
    label: "Your Trading Identity",
    body: "Sample insight: short swing trades and banking momentum are doing more of the work than broad activity.",
  },
  {
    title: "Mistakes",
    label: "Estimated Avoidable Loss",
    body: "Example output: repeated checklist-free losses and late chase entries are the costliest behavior cluster.",
  },
  {
    title: "Research",
    label: "Why is TCS moving?",
    body: "Example intelligence card: connect stock movement, sector context, and your own trade history in one answer.",
  },
];

const marketNarrativeCards = [
  "Banking is leading today's sector strength",
  "Retail attention is rising in PSU banks",
  "Late chase entries are risky in low-conviction markets",
  "FII/DII context and sector flow appear inside the sidebar",
];

const faqs = [
  {
    q: "Is IndiaCircle SEBI-registered?",
    a: "IndiaCircle is an analytics software product, not an investment advisor. It does not provide buy, sell, or hold recommendations.",
  },
  {
    q: "Which brokers work with it?",
    a: "IndiaCircle works with 10+ Indian brokers across extension capture and import flows, including Zerodha, Groww, Angel One, Upstox, and more.",
  },
  {
    q: "Do I have to share broker credentials?",
    a: "No. IndiaCircle does not need broker passwords or API keys to capture and analyze your activity.",
  },
  {
    q: "What makes it different from a journal?",
    a: "It combines in-session market context with after-close behavioral coaching, so you are not left with only raw trade logs and P&L tables.",
  },
];

function SidebarPreview() {
  return (
    <div id="sidebar-preview" className="mx-auto max-w-xl rounded-[2rem] border border-white/10 bg-slate-900/85 p-3 shadow-2xl shadow-indigo-950/40 backdrop-blur">
      <div className="rounded-[1.5rem] border border-slate-700 bg-slate-950 p-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">IndiaCircle Sidebar</p>
            <p className="mt-1 text-lg font-bold text-white">Market Pulse</p>
          </div>
          <span className="badge bg-indigo-500/10 text-indigo-200 ring-1 ring-indigo-500/20">Sample preview</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ["Why Is It Moving", "Banking breadth is improving", "Market intelligence"],
            ["Trade Guard", "Risk score 68/100", "Behavioral check"],
            ["Top Warning", "Late-session chasing is costly", "Coaching"],
          ].map(([title, value, note]) => (
            <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{title}</p>
              <p className="mt-2 text-base font-black text-white">{value}</p>
              <p className="mt-2 text-xs text-slate-400">{note}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-white">Why market moving</p>
              <span className="badge bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20">Example</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Financials are providing leadership while participation improves. Use this as context, not a trade call.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-white">Behavioral warning</p>
              <span className="badge bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20">Sample insight</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Your weaker window begins after 2 PM. Review timing discipline before activity expands.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="overflow-hidden bg-white">
      <section className="relative bg-slate-950 px-4 pb-24 pt-28 text-white sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:42px_42px]" />
        <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_30%_0%,rgba(14,165,233,0.24),transparent_56%),radial-gradient(circle_at_70%_0%,rgba(79,70,229,0.3),transparent_58%)]" />
        <div className="section-container relative grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-indigo-100 backdrop-blur">
              Built for Indian traders · No broker credentials · Works with 10+ brokers
            </div>
            <h1 className="mt-8 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
              See why the market is moving. Catch the mistakes draining your P&amp;L.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              IndiaCircle gives Indian traders live market context during the session and behavioral coaching after the close — inside one Chrome sidebar.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Market intelligence</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Trade Guard</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Behavioral coaching</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Risk warnings</span>
            </div>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="btn-primary">
                Get Started Free
              </Link>
              <Link
                href="#sidebar-preview"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Preview the Sidebar
              </Link>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ["Market intelligence", "Why market moving, sector flow, and context that supports review."],
                ["Risk warnings", "Trade Guard and behavioral alerts built from your own history."],
                ["Behavior correction", "Post-close coaching that turns mistakes into repeatable rules."],
              ].map(([title, body]) => (
                <div key={title} className="proof-strip-card">
                  <div className="proof-stat-label">{title}</div>
                  <p className="mt-2 text-sm font-semibold text-white">{body}</p>
                </div>
              ))}
            </div>
          </div>
          <SidebarPreview />
        </div>
      </section>

      <section className="border-b border-gray-100 bg-white px-4 py-10 sm:px-6 lg:px-8">
        <div className="section-container text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-400">Works with 10+ Indian brokers</p>
          <div className="mt-6 flex min-w-max gap-6 overflow-hidden text-sm font-semibold text-gray-500 sm:flex-wrap sm:justify-center">
            {brokers.map((broker) => (
              <span key={broker}>{broker}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-8 sm:px-6 lg:px-8">
        <div className="section-container grid gap-3 md:grid-cols-4">
          {[
            "No broker credentials required",
            "Built for Indian retail traders",
            "AI-powered market context + behavioral analytics",
            "Analytics only, not advisory",
          ].map((item) => (
            <div key={item} className="neutral-shell-card px-4 py-4 text-sm font-semibold text-slate-700">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="section-padding bg-gray-50">
        <div className="section-container">
          <div className="max-w-2xl">
            <span className="badge badge-indigo">Product overview</span>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950">Trade with context and self-awareness.</h2>
            <p className="mt-4 text-base leading-8 text-slate-600">
              IndiaCircle combines a market intelligence feed for the session with behavioral intelligence after the close, so traders are not left with only static logs and P&amp;L tables.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {featureCards.map((card) => (
              <article key={card.title} className="feature-card">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  {card.label}
                </div>
                <h3 className="mt-5 text-xl font-black text-slate-950">{card.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{card.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <span className="badge badge-emerald">Sample market narrative</span>
              <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950">Today&apos;s Market Narrative</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Example intelligence cards show how market context appears inside the sidebar. These are product previews, not live public data.
              </p>
            </div>
            <div className="text-sm font-semibold text-slate-500">Example intelligence card</div>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {marketNarrativeCards.map((card) => (
              <div key={card} className="rounded-2xl border border-gray-100 bg-slate-50 p-5 shadow-sm">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">Market narrative</div>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-800">{card}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-slate-950 text-white">
        <div className="section-container">
          <div className="max-w-2xl">
            <span className="badge bg-white/10 text-white ring-1 ring-white/10">Preview surfaces</span>
            <h2 className="mt-4 text-4xl font-black tracking-tight">See the full operating system</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Public preview cards below are sample product surfaces. Personalized versions unlock after import or auto-capture.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-5">
            {previewCards.map((card) => (
              <article key={card.title} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{card.title}</div>
                <h3 className="mt-3 text-lg font-black text-white">{card.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="section-container grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-8">
            <span className="badge badge-rose">During the session</span>
            <h3 className="mt-4 text-2xl font-black text-slate-950">Market intelligence beside your broker</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Track market narratives, FII/DII context, earnings reactions, sector rotation, and behavioral warnings without opening a stack of separate tabs.
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-8">
            <span className="badge badge-indigo">After the close</span>
            <h3 className="mt-4 text-2xl font-black text-slate-950">Behavioral coaching that compounds</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Review repeat mistakes, missing emotions, setup quality, and avoidable loss clusters so the next rule is specific and grounded in your own trade history.
            </p>
          </div>
        </div>
      </section>

      <section className="section-padding bg-gray-50">
        <div className="section-container max-w-4xl">
          <h2 className="text-center text-4xl font-black tracking-tight text-slate-950">Questions traders ask before trusting a platform like this</h2>
          <div className="mt-10 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {faqs.map((faq) => (
              <details key={faq.q} className="group p-6">
                <summary className="cursor-pointer list-none text-base font-bold text-slate-950">{faq.q}</summary>
                <p className="mt-3 text-sm leading-6 text-gray-600">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-20 text-center text-white sm:px-6 lg:px-8">
        <div className="section-container">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">Live market intelligence during the session. Behavioral execution coaching after the close.</h2>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-slate-300">
            IndiaCircle helps traders review context, risk, discipline, and repeat behavior in one operating system.
          </p>
          <Link href="/signup" className="btn-primary mt-8">
            Get Started Free
          </Link>
          <p className="mt-4 text-sm text-slate-400">No credit card required · Works with 10+ Indian brokers</p>
        </div>
      </section>

      <footer className="bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="section-container flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xl font-black text-slate-950">IndiaCircle</p>
            <p className="mt-3 text-sm text-gray-500">Market intelligence + behavioral intelligence for Indian traders</p>
            <p className="mt-2 text-xs text-gray-400">© 2026 IndiaCircle. Not a SEBI-registered investment advisor.</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-gray-600">
            {[
              ["Pricing", "/pricing"],
              ["Research Preview", "/research"],
              ["Download", "/download"],
              ["Sign In", "/login"],
              ["Get Started", "/signup"],
            ].map(([label, href]) => (
              <Link key={label} href={href} className="hover:text-indigo-600">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
