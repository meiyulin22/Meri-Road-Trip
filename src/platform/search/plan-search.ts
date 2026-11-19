import { logger } from "@/platform/observability/logger";

import { createBochaDiscoverySearchFromEnvironment } from "./bocha-discovery-search";
import { DiscoverySearchError, type DiscoverySearchResult } from "./discovery-search";
import { createKimiSearchProFromEnvironment } from "./kimi-search-pro";

/** One web search for Generate plan, stopped when the caller's signal fires. */
export type PlanSearchCall = (query: string, signal: AbortSignal) => Promise<readonly DiscoverySearchResult[]>;

/**
 * Generate plan's two searches (1.2113 step 1). `search` is the first look, `deep` the second look
 * the agent or the checks ask for, always Kimi. Kimi is the default first look too (merlin,
 * 2026-11-19): the 2026-10-29 comparison found the closures and limits only Kimi found, and the
 * saving with Bocha is about ¥0.34 a plan. PLAN_SEARCH_PROVIDER=bocha makes the first look Bocha,
 * with Kimi in its place when Bocha fails or its day is spent.
 */
export type PlanSearch = { readonly search: PlanSearchCall; readonly deep: PlanSearchCall };

export type PlanSearchProvider = "bocha" | "kimi";

export function planSearchProviderFrom(value: string | undefined): PlanSearchProvider {
  const named = value?.trim().toLowerCase();
  if (!named || named === "kimi") return "kimi";
  if (named === "bocha") return "bocha";
  logger.warn({ variable: "PLAN_SEARCH_PROVIDER" }, "PLAN_SEARCH_PROVIDER is neither kimi nor bocha; using kimi");
  return "kimi";
}

export function createPlanSearch(provider: PlanSearchProvider, bocha: PlanSearchCall, kimi: PlanSearchCall): PlanSearch {
  return {
    deep: kimi,
    search: provider === "kimi" ? kimi : async (query, signal) => {
      try {
        return await bocha(query, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        // Only the failure's kind: a provider message may carry the key.
        logger.info({ reason: error instanceof DiscoverySearchError ? error.kind : "unknown" }, "Bocha search unavailable; this search used Kimi");
        return kimi(query, signal);
      }
    },
  };
}

// Generate plan reads 550 characters a page, the length its research and checks were tuned to.
const planSnippetCharacters = 550;

export function createPlanSearchFromEnvironment(): PlanSearch {
  const bocha = createBochaDiscoverySearchFromEnvironment({ maxSnippetCharacters: planSnippetCharacters });
  const kimi = createKimiSearchProFromEnvironment();
  return createPlanSearch(
    planSearchProviderFrom(process.env.PLAN_SEARCH_PROVIDER),
    (query, signal) => bocha.search(query, signal),
    (query, signal) => kimi.search(query, signal),
  );
}
