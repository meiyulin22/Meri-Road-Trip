import { readFile } from "node:fs/promises";

import { runFirstRoundResearch } from "@/agents/planner/research-agent";
import { planHandoffSchema } from "@/domain/plan/plan-handoff";

async function main(): Promise<void> {
  const [path] = process.argv.slice(2);
  if (!path) {
    process.stderr.write("Usage: node --env-file=.env.local --import tsx scripts/verify-plan-research.ts <handoff.json>\n");
    process.exitCode = 1;
    return;
  }
  const handoff = planHandoffSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const startedAt = performance.now();
  const result = await runFirstRoundResearch(handoff);
  process.stdout.write(JSON.stringify({ ...result, durationMs: Math.round(performance.now() - startedAt) }, null, 2) + "\n");
  if (!result.cities.some((city) => city.status === "ready" || city.status === "partial")) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write("Plan research check failed (" + (error instanceof Error ? error.name : "unknown error") + ").\n");
  process.exitCode = 1;
});
