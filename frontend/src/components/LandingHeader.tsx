"use client";

import Link from "next/link";

function LogoMark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 shadow-sm">
        <span className="absolute h-4 w-4 rotate-45 rounded-[5px] bg-gradient-to-br from-indigo-500 to-emerald-400" />
        <span className="relative h-2 w-2 rounded-full bg-white" />
      </span>
      <span className="bg-gradient-to-r from-slate-950 via-indigo-700 to-slate-800 bg-clip-text text-xl font-black text-transparent">
        IndiaCircle
      </span>
    </span>
  );
}

export default function LandingHeader() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-gray-100 bg-white/90 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="IndiaCircle home">
          <LogoMark />
        </Link>
        <Link href="/#waitlist" className="btn-primary">
          Join Waitlist
        </Link>
      </div>
    </header>
  );
}
