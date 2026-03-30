import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-4 text-center">
        <h1 className="max-w-3xl text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Decode Your{" "}
          <span className="text-indigo-600">Trading Patterns</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-gray-600">
          Import trades from Zerodha, Groww, or CSV files. Get AI-powered
          analysis of your trading behavior, identify recurring patterns, and
          make smarter decisions.
        </p>
        <div className="mt-10 flex gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Get Started Free
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Login
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-24">
        <h2 className="text-center text-3xl font-bold">
          Everything You Need to Trade Smarter
        </h2>
        <div className="mt-14 grid gap-8 sm:grid-cols-3">
          {[
            {
              title: "Import Trades",
              desc: "Connect your Zerodha or Groww account, or upload CSV files to import your complete trade history.",
              icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
            },
            {
              title: "Pattern Analysis",
              desc: "AI identifies your trading patterns — overtrading, revenge trading, sector bias, and more.",
              icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
            },
            {
              title: "Actionable Insights",
              desc: "Get personalized recommendations to improve your strategy based on your actual trading data.",
              icon: "M13 10V3L4 14h7v7l9-11h-7z",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-4 inline-flex rounded-lg bg-indigo-50 p-3">
                <svg
                  className="h-6 w-6 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={f.icon}
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
