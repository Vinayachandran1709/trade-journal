import Link from "next/link";

export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-black text-white shadow-lg">
          SF
        </div>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">
          Welcome to StrategyForge AI
        </h1>
        <p className="mt-3 text-lg text-gray-500">
          Your trading copilot is installed. Here's how to get started in 3 minutes.
        </p>
      </div>

      {/* Steps */}
      <ol className="mt-12 space-y-8">
        <li className="flex gap-5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
            1
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Create your free account</h2>
            <p className="mt-1 text-sm text-gray-500">
              Sign up or log in to connect the extension to your personal trade journal.
              Your data stays private — we never read your portfolio value.
            </p>
            <div className="mt-4 flex gap-3">
              <Link
                href="/signup"
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Create Free Account
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Log In
              </Link>
            </div>
          </div>
        </li>

        <li className="flex gap-5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
            2
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Pin the extension</h2>
            <p className="mt-1 text-sm text-gray-500">
              Click the <strong>puzzle-piece icon</strong> (🧩) in your Chrome toolbar and
              pin <strong>StrategyForge AI</strong> so it's always one click away.
            </p>
            {/* Screenshot placeholder */}
            <div className="mt-4 flex h-28 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50">
              <p className="text-xs text-gray-400">
                [Screenshot: Chrome extensions menu with pin icon]
              </p>
            </div>
          </div>
        </li>

        <li className="flex gap-5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
            3
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Open your broker and watch the magic</h2>
            <p className="mt-1 text-sm text-gray-500">
              Visit{" "}
              <a
                href="https://kite.zerodha.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-600 hover:underline"
              >
                kite.zerodha.com
              </a>{" "}
              or{" "}
              <a
                href="https://web.groww.in"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-600 hover:underline"
              >
                web.groww.in
              </a>
              . Open your order book. The extension automatically detects and
              journals your trades — no clicks required.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Zero manual exports. Zero clicking. 100% automatic.
            </div>
          </div>
        </li>
      </ol>

      {/* What it does */}
      <div className="mt-14 rounded-2xl border border-indigo-100 bg-indigo-50 p-6">
        <h2 className="font-bold text-indigo-900">What StrategyForge AI does</h2>
        <ul className="mt-4 space-y-2 text-sm text-indigo-800">
          {[
            "Auto-captures trades from Zerodha, Groww & 10+ Indian brokers",
            "Calculates P&L with FIFO matching across all your positions",
            "Identifies behavioral patterns: overtrading, revenge trading, FOMO",
            "Lets you tag emotions and notes on every trade",
            "Syncs everything to your private web dashboard instantly",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Founding offer */}
      <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-sm font-semibold text-amber-800">Limited founding offer</p>
        <p className="mt-1 text-lg font-bold text-amber-900">
          First 100 users get 3 months Pro free
        </p>
        <p className="mt-1 text-sm text-amber-700">
          Use code <span className="font-mono font-bold">FOUNDING</span> at checkout
        </p>
        <Link
          href="/pricing"
          className="mt-4 inline-block rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600"
        >
          View Pricing
        </Link>
      </div>

      <p className="mt-8 text-center text-xs text-gray-400">
        StrategyForge AI · Analytics only, not investment advice · SEBI disclaimer applies
      </p>
    </div>
  );
}
