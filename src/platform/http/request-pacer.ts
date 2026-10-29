/**
 * A queue that spaces the starts of outgoing requests, for providers that refuse a key
 * going too fast (Tianditu's CC protection answers 418). Written for Amap in 1.0018 and
 * kept when Amap was removed in 1.0702.
 */
export interface Gate {
  /** Waits for a turn, then runs the task. `first` takes the next turn instead of the last. */
  run<T>(task: () => Promise<T>, options?: { readonly first?: boolean }): Promise<T>;
  /** Holds every waiting and future task back for at least `ms` from now. */
  pause(ms: number): void;
}

export interface Clock {
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
}

const systemClock: Clock = {
  now: Date.now,
  sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

/**
 * Starts tasks no closer together than `intervalMs`, in the order they asked. Turns
 * are handed out one at a time rather than booked ahead, so a pause also holds back
 * the tasks that were already waiting.
 */
export function createPacer(intervalMs: number, clock: Clock = systemClock): Gate {
  const waiting: (() => void)[] = [];
  let nextStart = 0;
  let handingOut = false;

  async function handOutTurns(): Promise<void> {
    handingOut = true;
    while (waiting.length > 0) {
      const wait = nextStart - clock.now();
      if (wait > 0) {
        await clock.sleep(wait);
        // A pause may have moved nextStart while this slept, so look again.
        continue;
      }
      nextStart = clock.now() + intervalMs;
      waiting.shift()?.();
    }
    handingOut = false;
  }

  return {
    async run(task, options = {}) {
      await new Promise<void>((resolve) => {
        if (options.first) waiting.unshift(resolve);
        else waiting.push(resolve);
        if (!handingOut) void handOutTurns();
      });
      return task();
    },
    pause(ms) {
      nextStart = Math.max(nextStart, clock.now() + ms);
    },
  };
}
