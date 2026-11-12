import { readFile } from "node:fs/promises";

import { z } from "zod";

import { draftPlan } from "@/agents/planner/plan-agent";
import { runFirstRoundResearch } from "@/agents/planner/research-agent";
import { planHandoffSchema } from "@/domain/plan/plan-handoff";
import type { CityResearch } from "@/domain/plan/spot-card";

const evidenceSchema = z.object({
  url: z.string(),
  title: z.string(),
  publishedAt: z.string().nullable(),
  checkedAt: z.string(),
  quote: z.string(),
}).nullable();

// The JSON printed by verify-plan-research.ts, so a draft can be rerun without searching again.
const researchFileSchema = z.object({
  cities: z.array(z.object({
    province: z.string(),
    city: z.string(),
    status: z.enum(["ready", "partial", "unavailable", "deferred"]),
    searchCalls: z.number(),
    spots: z.array(z.object({
      id: z.string(),
      province: z.string(),
      city: z.string(),
      name: z.string(),
      requested: z.boolean(),
      location: evidenceSchema,
      opening: evidenceSchema,
      reservation: evidenceSchema,
      setting: evidenceSchema,
      walking: evidenceSchema,
      suggestedDuration: evidenceSchema,
    })),
  })),
});

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
