import { Mastra } from "@mastra/core";
import { InMemoryStore } from "@mastra/core/storage";

import { findPlaceImage } from "@/capabilities/destination/place-images";
import { createMoonshotChatModelFromEnvironment } from "@/platform/llm/moonshot-chat-model";
import { createPlacePhotoProvider } from "@/platform/map-providers";
import { createKimiSearchProFromEnvironment } from "@/platform/search/kimi-search-pro";
import { createTiandituClient } from "@/platform/tianditu/tianditu-fetch";
import { TiandituLocationProvider } from "@/platform/tianditu/tianditu-location-provider";
import { sharedSpotLocationMemory } from "@/platform/tianditu/spot-location-memory";

import { researchCity } from "./planner/research-agent";
import { scoutAgent } from "./scout-agent";
import { createPlanGenerationWorkflow, type PlanGenerationDependencies } from "./workflows/plan-generation";

// Mastra reports feature usage to its makers' PostHog unless this is set. Meri sends
// nothing anywhere it was not asked to, so it is off unless someone turns it on.
process.env.MASTRA_TELEMETRY_DISABLED ??= "1";

let map: TiandituLocationProvider | null = null;
let photos: ReturnType<typeof createPlacePhotoProvider> | null = null;

/**
 * Generate plan's real providers, each built on first use so importing needs no keys.
 * The verify script passes its own research and its own place to save versions.
 */
export function planGenerationDependencies(
  overrides: Partial<PlanGenerationDependencies> = {},
): PlanGenerationDependencies {
  return {
    researchCity: (task, handoff, onProgress) => researchCity(task, handoff, {
      search: (query, signal) => createKimiSearchProFromEnvironment().search(query, signal),
      model: createMoonshotChatModelFromEnvironment,
    }, onProgress),
    planModel: { model: createMoonshotChatModelFromEnvironment },
    map: {
      // One lookup a spot; the first failure stops the check, rate limits included, with no retry.
      search: (name, areas) => {
        map ??= new TiandituLocationProvider(createTiandituClient(fetch, { retryRateLimit: false }));
        return map.searchByKeyword(name, areas);
      },
      memory: sharedSpotLocationMemory,
    },
    // The local catalog and photos already downloaded: no remote photo service is asked.
    findImage: (subject) => findPlaceImage(subject, photos ??= createPlacePhotoProvider()),
    saveVersion: async (version) => {
      const { planRunRepository } = await import("@/capabilities/planning/plan-run-repository-instance");
      return planRunRepository.createVersion(version);
    },
    now: () => new Date(),
    ...overrides,
  };
}

const planGeneration = createPlanGenerationWorkflow(planGenerationDependencies());

/**
 * Every agent and workflow Meri runs, registered once. Workflow state lives in memory:
 * Meri keeps its own run records and events in Postgres, and a run cut off by a restart
 * is marked interrupted rather than resumed. Durable snapshots come with suspend/resume.
 */
export const mastra = new Mastra({
  agents: { scout: scoutAgent },
  workflows: { planGeneration },
  storage: new InMemoryStore(),
});
