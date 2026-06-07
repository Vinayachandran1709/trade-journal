import { demoActivationMeta } from "@/lib/demo-trader-data";

export default function DemoUnlockLadder() {
  return (
    <article className="rounded-[2rem] border border-emerald-100 bg-emerald-50/60 p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-emerald">What Unlocks Next</span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
          Broker by broker
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {demoActivationMeta.unlocks.map((item) => (
          <div key={item.label} className="rounded-2xl bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-black text-slate-950">{item.label}</div>
              <span className="text-sm font-semibold text-emerald-700">{item.tradeThreshold}+ trades</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{item.description}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
