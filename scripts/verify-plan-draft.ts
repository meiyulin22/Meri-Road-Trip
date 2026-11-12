import { readFile } from "node:fs/promises";

import { z } from "zod";

import { draftPlan } from "@/agents/planner/plan-agent";
import { runFirstRoundResearch } from "@/agents/planner/research-agent";
import { cityResearchSchema } from "@/domain/plan/plan-draft-response";
import { planHandoffSchema } from "@/domain/plan/plan-handoff";
import type { CityResearch } from "@/domain/plan/spot-card";

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
  const result = await draftPlan(handoff, research);
  process.stdout.write(JSON.stringify({
    ...result,
    researchMs,
    draftMs: Math.round(performance.now() - startedAt) - researchMs,
  }, null, 2) + "\n");
  if (result.status !== "ready") process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write("Plan draft check failed (" + (error instanceof Error ? error.name : "unknown error") + ").\n");
  process.exitCode = 1;
});
