import { Mastra } from "@mastra/core";
import { InMemoryStore, MastraCompositeStore } from "@mastra/core/storage";
import { WorkflowsPG } from "@mastra/pg";

import { findPlaceImage } from "@/capabilities/destination/place-images";
import { createMoonshotChatModelFromEnvironment } from "@/platform/llm/moonshot-chat-model";
import { createPlacePhotoProvider } from "@/platform/map-providers";
import { createKimiSearchProFromEnvironment } from "@/platform/search/kimi-search-pro";
import { createTiandituClient } from "@/platform/tianditu/tianditu-fetch";
import { TiandituLocationProvider } from "@/platform/tianditu/tianditu-location-provider";
import { driveLegKey, sharedDriveLegMemory } from "@/platform/tianditu/drive-leg-memory";
import { sharedSpotLocationMemory } from "@/platform/tianditu/spot-location-memory";
import { createTiandituDrive } from "@/platform/tianditu/tianditu-drive";

import { researchCity } from "./planner/research-agent";
import { verifySpots } from "./planner/verify-spots";
import { scoutAgent } from "./scout-agent";
import { createPlanGenerationWorkflow, type PlanGenerationDependencies } from "./workflows/plan-generation";

// Mastra reports feature usage to its makers' PostHog unless this is set. Meri sends
// nothing anywhere it was not asked to, so it is off unless someone turns it on.
process.env.MASTRA_TELEMETRY_DISABLED ??= "1";

let map: TiandituLocationProvider | null = null;
let drive: ReturnType<typeof createTiandituDrive> | null = null;
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
    verifySpots: (cards, options, onProgress) => verifySpots(cards, options, {
      search: (query, signal) => createKimiSearchProFromEnvironment().search(query, signal),
      model: createMoonshotChatModelFromEnvironment,
    }, onProgress),
    map: {
      // One lookup a spot; the first failure stops the check, rate limits included, with no retry.
      search: (name, areas) => {
        map ??= new TiandituLocationProvider(createTiandituClient(fetch, { retryRateLimit: false }));
        return map.searchByKeyword(name, areas);
      },
      memory: sharedSpotLocationMemory,
    },
    drive: {
      // One lookup a leg; the first failure stops the rest, rate limits included, with no retry.
      drive: (from, to, mode) => (drive ??= createTiandituDrive(createTiandituClient(fetch, { retryRateLimit: false })))(from, to, mode),
      memory: sharedDriveLegMemory,
      key: driveLegKey,
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
 * Where Mastra keeps its state. Only workflow snapshots go to Postgres, in a `mastra`
 * schema beside Meri's tables: one table, mastra_workflow_snapshot, that @mastra/pg creates
 * and maintains itself on first use (not a Drizzle migration). A run waiting for an answer
 * therefore survives a restart. Every other Mastra domain stays in memory, unused. Without
 * DATABASE_URL (a script, a test) everything stays in memory.
 */
function mastraStorage() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return new InMemoryStore();
  return new MastraCompositeStore({
    id: "meri-storage",
    default: new InMemoryStore(),
    domains: { workflows: new WorkflowsPG({ connectionString, schemaName: "mastra" }) },
  });
}

/**
 * Every agent and workflow Meri runs, registered once. Meri keeps its own run records and
 * events in its tables; a run that was working when the server stopped is marked
 * interrupted, while one waiting for an answer resumes from its snapshot.
 */
export const mastra = new Mastra({
  agents: { scout: scoutAgent },
  workflows: { planGeneration },
  storage: mastraStorage(),
});
