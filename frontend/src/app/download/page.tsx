export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-center text-4xl font-extrabold tracking-tight">
        Download the Extension
      </h1>
      <p className="mt-4 text-center text-lg text-gray-500">
        Auto-capture your trades directly from Zerodha, Groww, and 10+ other
        broker platforms — no manual CSV exports needed.
      </p>

      {/* CTA buttons */}
      <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <a
          href="https://chrome.google.com/webstore"
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-gray-200 bg-white px-6 py-4 shadow-sm transition hover:border-indigo-400 hover:shadow-md sm:w-auto"
        >
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#4285F4" />
            <circle cx="12" cy="12" r="4" fill="white" />
            <path d="M12 8h8.5" stroke="#EA4335" strokeWidth="2" />
            <path d="M16.24 16.24l-4.24-4.24-4.24 4.24" stroke="#FBBC05" strokeWidth="2" />
            <path d="M7.76 16.24L4 10" stroke="#34A853" strokeWidth="2" />
          </svg>
          <div className="text-left">
            <p className="text-xs text-gray-400">Available on</p>
            <p className="font-semibold text-gray-800">Chrome Web Store</p>
          </div>
        </a>

        <a
          href="https://microsoftedge.microsoft.com/addons"
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-gray-200 bg-white px-6 py-4 shadow-sm transition hover:border-indigo-400 hover:shadow-md sm:w-auto"
        >
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#0078D4" />
            <path d="M5 14c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="14" r="3" fill="white" />
          </svg>
          <div className="text-left">
            <p className="text-xs text-gray-400">Available on</p>
            <p className="font-semibold text-gray-800">Microsoft Edge Add-ons</p>
          </div>
        </a>
      </div>

      {/* Installation steps */}
      <div className="mt-16">
        <h2 className="text-xl font-bold">How to install</h2>
        <ol className="mt-6 space-y-6">
          {[
            {
              step: "1",
              title: "Add to your browser",
              desc: 'Click the Chrome or Edge button above and press "Add to Chrome" / "Get" on the store page.',
            },
            {
              step: "2",
              title: "Pin the extension",
              desc: 'Click the puzzle-piece icon in your browser toolbar and pin "TradeIntel" so it\'s always visible.',
            },
            {
              step: "3",
              title: "Log in with your account",
              desc: "Click the TradeIntel icon and sign in with the same email you use on the web app.",
            },
            {
              step: "4",
              title: "Visit your broker platform",
              desc: "Open your Zerodha or Groww order book page. The extension will automatically detect and offer to capture your trades.",
            },
            {
              step: "5",
              title: "Review & save",
              desc: "Open the side panel, review the captured trades, and click Save. They'll appear in your dashboard instantly.",
            },
          ].map((item) => (
            <li key={item.step} className="flex gap-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                {item.step}
              </div>
              <div>
                <p className="font-semibold">{item.title}</p>
                <p className="mt-0.5 text-sm text-gray-500">{item.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Supported brokers */}
      <div className="mt-16 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="font-semibold">Supported brokers</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            "Zerodha",
            "Groww",
            "Angel One",
            "Upstox",
            "Dhan",
            "5Paisa",
            "ICICI Direct",
            "HDFC Sec",
            "Kotak Sec",
            "Motilal Oswal",
          ].map((broker) => (
            <span
              key={broker}
              className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700"
            >
              {broker}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
