import Link from "next/link";

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40 px-4 pb-20 pt-28 sm:px-6 lg:px-8">
      <div className="section-container max-w-4xl">
        <div className="text-center">
          <span className="badge badge-indigo">Onboarding</span>
          <h1 className="mt-5 text-5xl font-black tracking-tight text-slate-950">
            Welcome to IndiaCircle
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-gray-600">
            Your trading copilot is ready. Follow these steps to start auto-capturing
            broker activity in minutes.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            ["1", "Create your account", "Sign up or log in to connect the extension to your private trade journal."],
            ["2", "Pin the extension", "Click the puzzle-piece icon, then pin IndiaCircle for one-click access."],
            ["3", "Visit your broker", "Open Zerodha, Groww, or another supported broker to start auto-capturing."],
          ].map(([num, title, desc]) => (
            <div key={num} className="relative rounded-3xl border border-gray-100 bg-white p-7 shadow-sm">
              <span className="gradient-text text-6xl font-black">{num}</span>
              <h2 className="mt-8 text-xl font-black text-slate-950">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-gray-600">{desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-3xl bg-slate-950 p-8 text-white shadow-xl">
          <div className="grid gap-8 md:grid-cols-[1fr_0.9fr] md:items-center">
            <div>
              <h2 className="text-3xl font-black">Pin the extension</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Look for the extensions icon in your browser toolbar. Pin IndiaCircle
                so the sidebar is always available during market hours.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-end gap-3 rounded-xl bg-slate-900 p-3">
                <span className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">Extensions</span>
                <span className="text-3xl text-indigo-300">→</span>
                <span className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">Pin IndiaCircle</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <a
            href="https://kite.zerodha.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            Visit your broker to start auto-capturing
          </a>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/import/csv" className="btn-secondary">Import CSV</Link>
            <Link href="/pricing" className="btn-secondary">View Pricing</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
