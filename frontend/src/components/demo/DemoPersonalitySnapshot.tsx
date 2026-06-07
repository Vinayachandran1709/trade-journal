import { demoActivationMeta } from "@/lib/demo-trader-data";

export default function DemoPersonalitySnapshot() {
  return (
    <article className="rounded-[2rem] border border-indigo-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-indigo">Demo Personality Snapshot</span>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-indigo-700">
          Preview
        </span>
      </div>
      <h3 className="mt-4 text-2xl font-black text-slate-950">{demoActivationMeta.traderType}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-600">
        Your strongest edge is <span className="font-semibold text-slate-900">{demoActivationMeta.strongestEdge}</span>,
        while your biggest leak is <span className="font-semibold text-slate-900">{demoActivationMeta.biggestLeak}</span>.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-emerald-50 p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-600">Best window</div>
          <div className="mt-2 text-lg font-black text-slate-950">{demoActivationMeta.bestTimeWindow}</div>
        </div>
        <div className="rounded-2xl bg-rose-50 p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-rose-600">Weakest window</div>
          <div className="mt-2 text-lg font-black text-slate-950">{demoActivationMeta.worstTimeWindow}</div>
        </div>
      </div>
    </article>
  );
}
