import { logger } from "@/platform/observability/logger";

import { createBochaDiscoverySearchFromEnvironment } from "./bocha-discovery-search";
import { DiscoverySearchError, type DiscoverySearchResult } from "./discovery-search";
import { createKimiSearchProFromEnvironment } from "./kimi-search-pro";

/** One web search for Generate plan, stopped when the caller's signal fires. */
export type PlanSearchCall = (query: string, signal: AbortSignal) => Promise<readonly DiscoverySearchResult[]>;

/**
 * Generate plan's two searches (1.2113 step 1, agreed with merlin 2026-11-19). `search` is the
 * first look: Bocha, which is far cheaper, and Kimi in its place when Bocha fails or its day is
 * spent, so a plan never goes without. `deep` is always Kimi: the agent's second look when Bocha's
 * results are thin or miss the facts. PLAN_SEARCH_PROVIDER=kimi makes the first look Kimi too.
 */
export type PlanSearch = { readonly search: PlanSearchCall; readonly deep: PlanSearchCall };

export type PlanSearchProvider = "bocha" | "kimi";

export function planSearchProviderFrom(value: string | undefined): PlanSearchProvider {
  const named = value?.trim().toLowerCase();
  if (!named || named === "bocha") return "bocha";
  if (named === "kimi") return "kimi";
  logger.warn({ variable: "PLAN_SEARCH_PROVIDER" }, "PLAN_SEARCH_PROVIDER is neither bocha nor kimi; using bocha");
  return "bocha";
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
