export interface RiskSummaryLike {
  net_pnl_today?: number | null;
  max_loss_threshold?: number | null;
}

export interface DebouncedCallback<TArgs extends unknown[]> {
  (...args: TArgs): void;
  cancel: () => void;
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function shouldLockTrading(summary: RiskSummaryLike | null | undefined): boolean {
  if (!summary) {
    return false;
  }

  const netPnl = toFiniteNumber(summary.net_pnl_today);
  const maxLoss = toFiniteNumber(summary.max_loss_threshold);

  if (netPnl === null || maxLoss === null || maxLoss <= 0) {
    return false;
  }

  return netPnl < -Math.abs(maxLoss);
}

export function createDebounced<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delayMs: number
): DebouncedCallback<TArgs> {
  let timeoutId: number | null = null;

  const debounced = (...args: TArgs) => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      timeoutId = null;
      callback(...args);
    }, delayMs);
  };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}
