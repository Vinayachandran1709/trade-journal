import { demoActivationMeta } from "@/lib/demo-trader-data";

export default function DemoSessionReplay() {
  const sessionReplay = demoActivationMeta.sessionReplay;

  return (
    <article className="rounded-[2rem] border border-amber-200 bg-amber-50/80 p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge bg-amber-100 text-amber-800 ring-1 ring-amber-200">Demo Session Replay</span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-amber-700">
          Discipline view
        </span>
      </div>
      <h3 className="mt-4 text-2xl font-black text-slate-950">
        Discipline Score {sessionReplay.disciplineScore}/100
      </h3>
      <p className="mt-3 text-sm leading-7 text-slate-700">
        A replay of how the day tightened or broke discipline, trade by trade.
      </p>
      <div className="mt-5 space-y-3">
        {sessionReplay.trades.map((trade) => (
          <div key={trade.id} className="rounded-2xl bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-black text-slate-950">{trade.label}</div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${
                  trade.status === "planned"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {trade.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{trade.outcome}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
