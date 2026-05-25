import assert from "node:assert/strict";

import {
  createDebounced,
  shouldLockTrading,
  toFiniteNumber,
} from "../src/content-scripts/lockout.ts";

async function runTests(): Promise<void> {
  assert.equal(toFiniteNumber(42), 42);
  assert.equal(toFiniteNumber("12.5"), 12.5);
  assert.equal(toFiniteNumber(""), null);
  assert.equal(toFiniteNumber("nope"), null);

  assert.equal(
    shouldLockTrading({ net_pnl_today: -2500, max_loss_threshold: 2000 }),
    true
  );
  assert.equal(
    shouldLockTrading({ net_pnl_today: -1500, max_loss_threshold: 2000 }),
    false
  );
  assert.equal(
    shouldLockTrading({ net_pnl_today: -2500, max_loss_threshold: 0 }),
    false
  );
  assert.equal(
    shouldLockTrading({ net_pnl_today: Number.NaN, max_loss_threshold: 2000 }),
    false
  );

  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextTimerId = 1;
  const originalWindow = globalThis.window;
  const stubWindow = {
    setTimeout: ((callback: () => void, delayMs: number) => {
      const timerId = nextTimerId++;
      const handle = setTimeout(() => {
        timers.delete(timerId);
        callback();
      }, delayMs);
      timers.set(timerId, handle);
      return timerId;
    }) as typeof window.setTimeout,
    clearTimeout: ((timerId: number) => {
      const handle = timers.get(timerId);
      if (handle) {
        clearTimeout(handle);
        timers.delete(timerId);
      }
    }) as typeof window.clearTimeout,
  } as Window & typeof globalThis;
  Object.assign(globalThis, { window: stubWindow });

  try {
    const calls: number[] = [];
    const debounced = createDebounced((value: number) => {
      calls.push(value);
    }, 20);

    debounced(1);
    debounced(2);
    debounced(3);
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.deepEqual(calls, [3]);

    debounced(4);
    debounced.cancel();
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.deepEqual(calls, [3]);
  } finally {
    if (originalWindow) {
      Object.assign(globalThis, { window: originalWindow });
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }

  console.log("lockout tests passed");
}

void runTests();
