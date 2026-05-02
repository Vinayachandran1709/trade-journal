import Link from "next/link";

function ChromeIcon() {
  return (
    <svg className="h-12 w-12" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#4285F4" />
      <path d="M24 24L5 24A22 22 0 0124 2h19L24 24z" fill="#EA4335" />
      <path d="M24 24l9.5 16.45A22 22 0 015 24h19z" fill="#34A853" />
      <path d="M24 24L43 2a22 22 0 01-9.5 38.45L24 24z" fill="#FBBC05" />
      <circle cx="24" cy="24" r="8" fill="white" />
      <circle cx="24" cy="24" r="5" fill="#4285F4" />
    </svg>
  );
}

function EdgeIcon() {
  return (
    <svg className="h-12 w-12" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#0078D4" />
      <path d="M10 28c0-9 7-16 16-16 7 0 12 4 14 10-4-4-10-5-15-2-5 3-7 8-5 14-6 0-10-2-10-6z" fill="#2BC7B4" />
      <path d="M18 33c2 6 12 7 18 2-4 7-14 11-22 5-5-4-6-9-4-14 1 5 4 7 8 7z" fill="white" opacity=".9" />
    </svg>
  );
}

function ExtensionMock() {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-2xl">
      <div className="rounded-2xl bg-slate-900 p-5">
        <div className="flex items-center justify-between">
          <p className="font-black text-white">IndiaCircle</p>
          <span className="badge bg-emerald-500/10 text-emerald-300">Capturing</span>
        </div>
        <div className="mt-5 space-y-3">
          {[
            ["RELIANCE", "BUY", "+₹1,240"],
            ["TCS", "SELL", "-₹420"],
            ["HDFCBANK", "BUY", "+₹860"],
          ].map(([symbol, side, pnl]) => (
            <div key={symbol} className="flex items-center justify-between rounded-xl bg-slate-800 p-3">
              <div>
                <p className="text-sm font-black text-white">{symbol}</p>
                <p className="text-xs text-slate-400">{side} · auto-captured</p>
              </div>
              <p className={`text-sm font-black ${pnl.startsWith("+") ? "text-emerald-400" : "text-rose-400"}`}>{pnl}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="bg-slate-950 px-4 pb-20 pt-32 text-white sm:px-6 lg:px-8">
        <div className="section-container grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <span className="badge bg-white/10 text-indigo-100 ring-1 ring-white/10">Browser extension</span>
            <h1 className="mt-6 text-5xl font-black tracking-tight">
              Get IndiaCircle for your browser
            </h1>
            <p className="mt-5 text-lg leading-8 text-slate-300">
              Auto-capture trades directly from Zerodha, Groww, and 10+ broker
              platforms. No manual CSV exports needed.
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-400">
              Also works on Brave and Opera
            </p>
          </div>
          <ExtensionMock />
        </div>
      </section>

      <section className="section-padding bg-gray-50">
        <div className="section-container">
          <div className="grid gap-6 md:grid-cols-2">
            <a
              href="https://chrome.google.com/webstore"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <ChromeIcon />
              <h2 className="mt-5 text-2xl font-black text-slate-950">Download for Chrome</h2>
              <p className="mt-2 text-sm text-gray-500">Chrome 88+ supported.</p>
              <span className="btn-primary mt-6">Open Chrome Web Store</span>
            </a>
            <a
              href="https://microsoftedge.microsoft.com/addons"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <EdgeIcon />
              <h2 className="mt-5 text-2xl font-black text-slate-950">Download for Edge</h2>
              <p className="mt-2 text-sm text-gray-500">Edge 88+ supported.</p>
              <span className="btn-primary mt-6">Open Edge Add-ons</span>
            </a>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <h2 className="text-3xl font-black text-slate-950">Install in three steps</h2>
              <p className="mt-3 text-gray-600">A clean setup path for Chrome, Edge, Brave, and Opera.</p>
            </div>
            <div className="grid gap-4">
              {[
                ["1", "Add to your browser", "Click the store button and approve the extension install."],
                ["2", "Pin IndiaCircle", "Use the puzzle-piece menu and pin IndiaCircle to your toolbar."],
                ["3", "Sign in and trade", "Open the side panel, login, and visit your broker platform."],
              ].map(([step, title, desc]) => (
                <div key={step} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <span className="gradient-text text-4xl font-black">{step}</span>
                  <h3 className="mt-3 font-black text-slate-950">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-gray-600">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-14 rounded-3xl border border-gray-100 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">System requirements</h2>
            <p className="mt-3 text-sm text-gray-600">Chrome 88+, Edge 88+, Brave, Opera</p>
            <Link href="/welcome" className="btn-secondary mt-6">View onboarding guide</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
