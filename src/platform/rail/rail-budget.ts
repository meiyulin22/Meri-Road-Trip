import { join } from "node:path";

import { createDailyBudget, type BudgetRefusal, type DailyBudget } from "@/platform/http/daily-budget";
import type { Clock, Gate } from "@/platform/http/request-pacer";
import { providerLimits } from "@/platform/provider-limits";

/**
 * How Meri talks to 12306 (agreed 2026-11-17): slowly, like one person looking things up. One
 * request at a time, process-wide, at least three seconds apart; at most `dailyUnits` requests a day,
 * counted across restarts; and after any failure a half-hour pause with no retry. These are
 * starting values, raised only if real use needs it.
 */
export const railLimits = {
  intervalMs: 3_000,
  // RAIL_MAX_REQUESTS_PER_DAY, 100 by default.
  dailyUnits: providerLimits.railRequestsPerDay,
  pauseMs: 30 * 60 * 1_000,
} as const;

const countFile = join(process.cwd(), ".cache", "rail-requests.json");

export type RailRefusal = BudgetRefusal;
export type RailBudget = DailyBudget;

/** `file: null` keeps the day's count in memory only, as the tests use it. */
export function createRailBudget(
  options: { readonly file?: string | null; readonly clock?: Clock; readonly gate?: Gate } = {},
): RailBudget {
  return createDailyBudget(railLimits, {
    ...options,
    file: options.file === undefined ? countFile : options.file,
    label: { provider: "12306", units: (count) => `${count} requests` },
  });
}

/** One budget per server process. */
export const sharedRailBudget = createRailBudget();
