import { kimiRefusalNow } from "@/platform/llm/kimi-spend";
import { providerLimits } from "@/platform/provider-limits";

import { planRunRepository } from "./plan-run-repository-instance";
import { tripPreferenceRepository } from "./trip-preference-repository-instance";
import { labelAnswer } from "./extract-plan-preferences";
import { PlanRunService } from "./plan-run-service";

export const planRunService = new PlanRunService({
  repository: planRunRepository,
  preferences: tripPreferenceRepository,
  labelAnswer: (text, question, cities) => labelAnswer(text, question, cities, crypto.randomUUID()),
  // Imported on first run, so a route that only reads plans never loads the agents.
  workflow: async () => ({ workflow: (await import("@/agents")).mastra.getWorkflow("planGeneration") }),
  // PLAN_RUNS_PER_DAY, KIMI_MAX_YUAN_PER_DAY and PAID_CALLS_ENABLED (step 2).
  limits: { runsPerDay: providerLimits.planRunsPerDay, kimiRefusal: () => kimiRefusalNow() },
});
