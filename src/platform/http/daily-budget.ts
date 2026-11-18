import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { createPacer, type Clock, type Gate } from "./request-pacer";

/** How a provider that costs requests or money is asked: spacing, a daily cap, and a pause after failing. */
export type DailyLimits = {
  readonly intervalMs: number;
  readonly dailyRequests: number;
  readonly pauseMs: number;
};

export type BudgetRefusal = "daily_limit" | "paused";

export interface DailyBudget {
  /**
   * Waits for a turn and runs `task`, counting `requests` against the day, or refuses without
   * running it when the day's requests are spent or a failure paused the provider for now.
   */
  run<T>(requests: number, task: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; reason: BudgetRefusal }>;
  /** A request failed: no more requests until the pause is over, `ms` or the limits' own pause. */
  pause(ms?: number): void;
}

type Day = { date: string; count: number };

function shanghaiDate(now: number): string {
  return new Date(now + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

/**
 * One provider's daily budget (1.2108, shared since 1.2111): requests one at a time `intervalMs`
 * apart, at most `dailyRequests` a Beijing day counted in `file` across restarts (`null` keeps it in
 * memory, as the tests do), and nothing sent while paused after a failure.
 */
export function createDailyBudget(
  limits: DailyLimits,
  options: { readonly file: string | null; readonly clock?: Clock; readonly gate?: Gate },
): DailyBudget {
  const file = options.file;
  const now = options.clock?.now ?? Date.now;
  const gate = options.gate ?? createPacer(limits.intervalMs, options.clock);
  let pausedUntil = 0;
  let day: Day | null = null;

  function load(): Day {
    const today = shanghaiDate(now());
    if (day?.date === today) return day;
    day = { date: today, count: 0 };
    try {
      if (file && existsSync(file)) {
        const saved = JSON.parse(readFileSync(file, "utf8")) as Partial<Day>;
        if (saved.date === today && typeof saved.count === "number") day = { date: today, count: saved.count };
      }
    } catch {
      // An unreadable count starts the day again; the interval and pause still hold.
    }
    return day;
  }

  function save(current: Day): void {
    if (!file) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify(current));
      renameSync(temporary, file);
    } catch {
      // A count that cannot be written still counts for this process.
    }
  }

  return {
    async run(requests, task) {
      return gate.run(async () => {
        if (now() < pausedUntil) return { ok: false as const, reason: "paused" as const };
        const current = load();
        if (current.count + requests > limits.dailyRequests) return { ok: false as const, reason: "daily_limit" as const };
        current.count += requests;
        save(current);
        return { ok: true as const, value: await task() };
      });
    },
    pause(ms = limits.pauseMs) {
      pausedUntil = Math.max(pausedUntil, now() + ms);
    },
  };
}

