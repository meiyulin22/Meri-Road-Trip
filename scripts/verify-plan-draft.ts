import { readFile } from "node:fs/promises";

import { z } from "zod";

import { checkSpotsOnMap } from "@/agents/planner/map-check";
import { draftPlan } from "@/agents/planner/plan-agent";
import { runFirstRoundResearch } from "@/agents/planner/research-agent";
import { cityResearchSchema } from "@/domain/plan/plan-draft-response";
import { planHandoffSchema } from "@/domain/plan/plan-handoff";
import type { CityResearch } from "@/domain/plan/spot-card";
import { createTiandituClient } from "@/platform/tianditu/tianditu-fetch";
import { TiandituLocationProvider } from "@/platform/tianditu/tianditu-location-provider";
import { sharedSpotLocationMemory } from "@/platform/tianditu/spot-location-memory";

// The JSON printed by verify-plan-research.ts, so a draft can be rerun without searching again.
const researchFileSchema = z.object({ cities: z.array(cityResearchSchema) });

async function main(): Promise<void> {
  const [handoffPath, researchPath] = process.argv.slice(2);
  if (!handoffPath) {
    process.stderr.write("Usage: node --env-file=.env.local --import tsx scripts/verify-plan-draft.ts <handoff.json> [research.json]\n");
    process.exitCode = 1;
    return;
  }
  const handoff = planHandoffSchema.parse(JSON.parse(await readFile(handoffPath, "utf8")));
  const startedAt = performance.now();
  const research: CityResearch[] = researchPath
    ? researchFileSchema.parse(JSON.parse(await readFile(researchPath, "utf8"))).cities
    : (await runFirstRoundResearch(handoff)).cities;
  const researchMs = Math.round(performance.now() - startedAt);
  // Stops at the first failed Tianditu lookup, with no retry; the draft still runs.
  const map = new TiandituLocationProvider(createTiandituClient(fetch, { retryRateLimit: false }));
  const mapCheck = await checkSpotsOnMap(research, {
    search: (name, areas) => map.searchByKeyword(name, areas),
    memory: sharedSpotLocationMemory,
  });
  const mapMs = Math.round(performance.now() - startedAt) - researchMs;
  const result = await draftPlan(handoff, mapCheck.cities);
  process.stdout.write(JSON.stringify({
    ...result,
    mapCheck: mapCheck.status,
    mapLookups: mapCheck.lookups,
    located: mapCheck.cities.flatMap(({ spots }) => spots.map(({ name, mapCheck: check }) => [name, check])),
    researchMs,
    mapMs,
    draftMs: Math.round(performance.now() - startedAt) - researchMs - mapMs,
  }, null, 2) + "\n");
  if (result.status !== "ready") process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write("Plan draft check failed (" + (error instanceof Error ? error.name : "unknown error") + ").\n");
  process.exitCode = 1;
});
