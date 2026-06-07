import DemoBrokerCTA from "@/components/demo/DemoBrokerCTA";
import DemoGraveyardSetup from "@/components/demo/DemoGraveyardSetup";
import DemoPersonalitySnapshot from "@/components/demo/DemoPersonalitySnapshot";
import DemoSessionReplay from "@/components/demo/DemoSessionReplay";
import DemoUnlockLadder from "@/components/demo/DemoUnlockLadder";

export default function DemoPage() {
  return (
    <div className="bg-[#f7f1e8] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
      <div className="section-container">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <span className="badge badge-indigo">Public Demo</span>
          <h1 className="mt-4 max-w-4xl text-5xl font-black tracking-tight text-slate-950">
            Explore your future discipline layer before your real profile is live.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
            These demo surfaces show what IndiaCircle will highlight once broker history starts
            turning into real pattern memory: personality snapshot, graveyard setup, session
            replay, and unlock milestones.
          </p>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <DemoPersonalitySnapshot />
          <DemoGraveyardSetup />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <DemoSessionReplay />
          <DemoUnlockLadder />
        </section>

        <section className="mt-8">
          <DemoBrokerCTA />
        </section>
      </div>
    </div>
  );
}
