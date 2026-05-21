"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

export default function AuthGuard({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(() =>
    typeof window === "undefined" ? false : isAuthenticated()
  );

  useEffect(() => {
    const authenticated = isAuthenticated();
    if (!authenticated) {
      router.replace("/login");
    } else {
      setChecked(true);
    }
  }, [router]);

  if (!checked) {
    return fallback ?? (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="neutral-shell-card w-full max-w-md px-6 py-10 text-center text-sm font-semibold text-slate-500">
          Loading your workspace...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
