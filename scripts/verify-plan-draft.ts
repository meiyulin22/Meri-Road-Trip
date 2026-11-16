import { readFile } from "node:fs/promises";

import { Mastra } from "@mastra/core";
import { InMemoryStore } from "@mastra/core/storage";
import { z } from "zod";

import { planGenerationDependencies } from "@/agents";
import { createPlanGenerationWorkflow } from "@/agents/workflows/plan-generation";
import { labelAnswer } from "@/capabilities/planning/extract-plan-preferences";
import { PlanRunService } from "@/capabilities/planning/plan-run-service";
import { cityResearchSchema } from "@/domain/plan/plan-draft-response";
import { planHandoffSchema } from "@/domain/plan/plan-handoff";
import { InMemoryPlanRunRepository } from "@/platform/persistence/in-memory/in-memory-plan-run-repository";

// The JSON printed by verify-plan-research.ts, so a plan can be rerun without searching again.
const researchFileSchema = z.object({ cities: z.array(cityResearchSchema) });

/**
 * Runs the plan-generation workflow once against the real providers, as the plan page
 * would, but keeps the run and its version in memory. Each progress event is printed as
 * one JSON line the moment it arrives, then the saved plan.
 */
async function main(): Promise<void> {
  const [handoffPath, researchPath] = process.argv.slice(2);
  if (!handoffPath) {
    process.stderr.write("Usage: node --env-file=.env.local --import tsx scripts/verify-plan-draft.ts <handoff.json> [research.json]\n");
    process.exitCode = 1;
    return;
  }
  const handoff = planHandoffSchema.parse(JSON.parse(await readFile(handoffPath, "utf8")));
  const saved = researchPath ? researchFileSchema.parse(JSON.parse(await readFile(researchPath, "utf8"))).cities : null;

  const repository = new InMemoryPlanRunRepository();
  const workflow = createPlanGenerationWorkflow(planGenerationDependencies({
    saveVersion: (version) => repository.createVersion(version),
    ...(saved ? {
      researchCity: async (task) => {
        const city = saved.find(({ province, city: name }) => province === task.province && name === task.city);
        if (!city) throw new Error(`No saved research for ${task.city}.`);
        return city;
      },
    } : {}),
  }));
  const mastra = new Mastra({ workflows: { planGeneration: workflow }, storage: new InMemoryStore(), logger: false });
  const service = new PlanRunService({
    repository,
    // The answer to a question is printed, not saved: this run has no trip in the database.
    preferences: { listByTripId: async () => [], create: async () => {} },
    labelAnswer: (text, question, cities) => labelAnswer(text, question, cities, crypto.randomUUID()),
    workflow: async () => ({ workflow: mastra.getWorkflow("planGeneration") }),
  });

  const tripId = "00000000-0000-4000-8000-00000000f00d";
  const started = await service.start(tripId, handoff);
  const run = await repository.findRun(tripId, started.runId);
  if (!run) throw new Error("The run was not recorded.");
  let after = 0;
  // A question is answered with its first option, so the resumed half is checked too.
  for (;;) {
    let waiting: { id: string; choice: string } | null = null;
    for await (const { seq, at, event } of service.follow(run, after, new AbortController().signal)) {
      process.stdout.write(JSON.stringify({ seq, at, ...event }) + "\n");
      after = seq;
      if (event.type === "run.waiting") waiting = { id: event.question.id, choice: event.question.options[0].label };
    }
    if (!waiting) break;
    await service.answer(tripId, run.id, { questionId: waiting.id, choice: waiting.choice });
  }
  const finished = repository.runs.get(started.runId);
  process.stdout.write(JSON.stringify({ run: finished && { ...finished, handoff: undefined }, plan: repository.versions[0]?.plan ?? null }, null, 2) + "\n");
  if (finished?.status !== "succeeded") process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write("Plan workflow check failed (" + (error instanceof Error ? error.name : "unknown error") + ").\n");
  process.exitCode = 1;
});
