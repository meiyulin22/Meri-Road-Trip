import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { createPacer, type Clock, type Gate } from "@/platform/http/request-pacer";

/**
 * How Meri talks to 12306 (agreed 2026-11-17): slowly, like one person looking things up. One
 * request at a time, process-wide, at least three seconds apart; at most `dailyRequests` a day,
 * counted across restarts; and after any failure a half-hour pause with no retry. These are
 * starting values, raised only if real use needs it.
 */
export const railLimits = {
  intervalMs: 3_000,
  dailyRequests: 100,
  pauseMs: 30 * 60 * 1_000,
} as const;

const countFile = join(process.cwd(), ".cache", "rail-requests.json");

export type RailRefusal = "daily_limit" | "paused";

export interface RailBudget {
  /**
   * Waits for a turn and runs `task`, counting `requests` against the day, or refuses without
   * running it when the day's requests are spent or a failure paused 12306 for now.
   */
  run<T>(requests: number, task: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; reason: RailRefusal }>;
  /** A request failed: no more requests until the pause is over. */
  pause(): void;
}

type Day = { date: string; count: number };

function shanghaiDate(now: number): string {
  return new Date(now + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

/** `file: null` keeps the day's count in memory only, as the tests use it. */
export function createRailBudget(
  options: { readonly file?: string | null; readonly clock?: Clock; readonly gate?: Gate } = {},
): RailBudget {
  const file = options.file === undefined ? countFile : options.file;
  const now = options.clock?.now ?? Date.now;
  const gate = options.gate ?? createPacer(railLimits.intervalMs, options.clock);
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
        if (current.count + requests > railLimits.dailyRequests) return { ok: false as const, reason: "daily_limit" as const };
        current.count += requests;
        save(current);
        return { ok: true as const, value: await task() };
      });
    },
    pause() {
      pausedUntil = now() + railLimits.pauseMs;
    },
  };
}

/** One budget per server process. */
export const sharedRailBudget = createRailBudget();
