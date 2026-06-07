import { demoActivationMeta } from "@/lib/demo-trader-data";

export default function DemoGraveyardSetup() {
  const graveyardSetup = demoActivationMeta.graveyardSetup;

  return (
    <article className="rounded-[2rem] border border-rose-200 bg-rose-50/70 p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-rose">Demo Graveyard Setup</span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-rose-700">
          Costly repeat
        </span>
      </div>
      <h3 className="mt-4 text-2xl font-black text-slate-950">{graveyardSetup.pattern}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-700">
        {graveyardSetup.similarTrades} similar trades. {Math.round(graveyardSetup.winRate * 100)}% win rate.
        Around ₹{graveyardSetup.netLoss.toLocaleString("en-IN")} lost in this one repeating setup.
      </p>
      <div className="mt-5 rounded-2xl bg-white p-4 text-sm font-semibold text-slate-900">
        {graveyardSetup.message}
      </div>
    </article>
  );
}
