import Link from "next/link";

export default function DemoBrokerCTA() {
  return (
    <section className="rounded-[2rem] bg-slate-950 p-8 text-white shadow-xl">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <span className="badge bg-white/10 text-white ring-1 ring-white/10">Broker unlock</span>
          <h2 className="mt-4 text-3xl font-black">Start with the demo, then connect your real trade memory</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            The demo shows what IndiaCircle becomes. The MVP unlock path is Dhan-first, with other brokers opening as integrations mature.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/#waitlist" className="btn-primary">
            Join Waitlist
          </Link>
          <Link href="/demo" className="btn-secondary border-white/20 bg-white/5 text-white hover:bg-white/10">
            Explore Demo
          </Link>
        </div>
      </div>
    </section>
  );
}
