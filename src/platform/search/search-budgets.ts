import { join } from "node:path";

import { createDailyBudget, type DailyBudget } from "@/platform/http/daily-budget";
import type { Gate } from "@/platform/http/request-pacer";
import { providerLimits } from "@/platform/provider-limits";

import { DiscoverySearchError } from "./discovery-search";

/**
 * Searches run side by side (a city's research sends four at once), so the budgets count calls but
 * do not queue them; a failed search is the caller's to handle, so nothing pauses either.
 */
const sideBySide: Gate = { run: (task) => task(), pause: () => {} };

/** Bocha calls a Beijing day, plans and Workspace together (1.2113 step 1): BOCHA_MAX_CALLS_PER_DAY, default 500. */
export const sharedBochaBudget = createDailyBudget({ intervalMs: 0, dailyUnits: providerLimits.bochaCallsPerDay, pauseMs: 0 }, {
  file: join(process.cwd(), ".cache", "bocha-calls.json"),
  gate: sideBySide,
  label: { provider: "Bocha", units: (count) => `${count} searches` },
});

/** Kimi web searches a Beijing day: KIMI_MAX_SEARCHES_PER_DAY, default 500. */
export const sharedKimiSearchBudget = createDailyBudget({ intervalMs: 0, dailyUnits: providerLimits.kimiSearchesPerDay, pauseMs: 0 }, {
  file: join(process.cwd(), ".cache", "kimi-searches.json"),
  gate: sideBySide,
  label: { provider: "Kimi search", units: (count) => `${count} searches` },
});

/** One search through a day's budget; a spent day throws `daily_limit`, which callers treat like any failed search. */
export async function withinBudget<T>(budget: DailyBudget | undefined, search: () => Promise<T>): Promise<T> {
  if (!budget) return search();
  const asked = await budget.run(1, search);
  if (!asked.ok) throw new DiscoverySearchError("daily_limit");
  return asked.value;
}
