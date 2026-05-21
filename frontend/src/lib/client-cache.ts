"use client";

type CachedEnvelope<T> = {
  cachedAt: number;
  value: T;
};

export function readSessionCache<T>(key: string, maxAgeMs = 15 * 60_000): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedEnvelope<T>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.cachedAt !== "number" ||
      !("value" in parsed)
    ) {
      return null;
    }

    if (Date.now() - parsed.cachedAt > maxAgeMs) {
      return null;
    }

    return parsed.value;
  } catch {
    return null;
  }
}

export function writeSessionCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;

  try {
    const envelope: CachedEnvelope<T> = {
      cachedAt: Date.now(),
      value,
    };
    window.sessionStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Best-effort client cache only.
  }
}
