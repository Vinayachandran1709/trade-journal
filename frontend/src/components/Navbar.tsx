"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isAuthenticated, logout } from "@/lib/auth";

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${
          light ? "border border-white/20 bg-white/10" : "bg-slate-950"
        }`}
      >
        <span className="absolute h-4 w-4 rotate-45 rounded-[5px] bg-gradient-to-br from-indigo-500 to-emerald-400" />
        <span className="relative h-2 w-2 rounded-full bg-white" />
      </span>
      <span
        className={`text-xl font-black ${
          light
            ? "text-white"
            : "bg-gradient-to-r from-slate-950 via-indigo-700 to-slate-800 bg-clip-text text-transparent"
        }`}
      >
        IndiaCircle
      </span>
    </span>
  );
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setLoggedIn(isAuthenticated());
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    handler();
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const handleLogout = () => {
    logout();
    setLoggedIn(false);
    setMobileOpen(false);
    router.push("/");
  };

  const navLinks = [
    { href: "/pricing", label: "Pricing" },
    { href: "/research", label: "Research" },
    { href: "/download", label: "Download" },
    ...(loggedIn
      ? [
          { href: "/dashboard", label: "Dashboard" },
          { href: "/dashboard/trades", label: "Trades" },
          { href: "/dashboard/analytics", label: "Patterns" },
          { href: "/dashboard/mistakes", label: "Mistakes" },
        ]
      : []),
  ];

  const onDarkHero = pathname === "/" || pathname === "/download";
  const solid = scrolled || !onDarkHero;
  const desktopGhostClass = solid
    ? "btn-ghost"
    : "inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-slate-200 transition-all duration-200 hover:bg-white/10 hover:text-white";

  return (
    <nav
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        solid
          ? "border-b border-gray-100 bg-white/90 shadow-sm backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="IndiaCircle home" onClick={() => setMobileOpen(false)}>
          <Logo light={!solid} />
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-semibold transition ${
                solid ? "text-gray-700 hover:text-indigo-600" : "text-slate-200 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {loggedIn ? (
            <>
              <Link href="/account" className={desktopGhostClass}>
                Account
              </Link>
              <button
                onClick={handleLogout}
                className={`${desktopGhostClass} ${solid ? "!text-rose-600 hover:!bg-rose-50" : "!text-rose-200 hover:!bg-white/10 hover:!text-rose-100"}`}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className={desktopGhostClass}>
                Login
              </Link>
              <Link href="/signup" className="btn-primary">
                Sign Up
              </Link>
            </>
          )}
        </div>

        <button
          aria-label="Open navigation menu"
          onClick={() => setMobileOpen((open) => !open)}
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition md:hidden ${
            solid
              ? "border-gray-200 bg-white text-slate-900"
              : "border-white/15 bg-white/10 text-white"
          }`}
        >
          <span className="space-y-1.5">
            <span className="block h-0.5 w-5 bg-current" />
            <span className="block h-0.5 w-5 bg-current" />
            <span className="block h-0.5 w-5 bg-current" />
          </span>
        </button>
      </div>

      <div
        className={`fixed right-3 top-20 w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl transition-all duration-300 md:hidden ${
          mobileOpen
            ? "translate-x-0 opacity-100"
            : "pointer-events-none translate-x-8 opacity-0"
        }`}
      >
        <div className="space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="mt-4 border-t border-gray-100 pt-4">
          {loggedIn ? (
            <div className="grid gap-2">
              <Link
                href="/account"
                onClick={() => setMobileOpen(false)}
                className="btn-secondary w-full"
              >
                Account
              </Link>
              <button onClick={handleLogout} className="btn-ghost w-full text-rose-600 hover:bg-rose-50">
                Log out
              </button>
            </div>
          ) : (
            <div className="grid gap-2">
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="btn-ghost w-full"
              >
                Login
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileOpen(false)}
                className="btn-primary w-full"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
