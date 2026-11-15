import { planRunRepository } from "./plan-run-repository-instance";
import { tripPreferenceRepository } from "./trip-preference-repository-instance";
import { PlanRunService } from "./plan-run-service";

export const planRunService = new PlanRunService({
  repository: planRunRepository,
  preferences: tripPreferenceRepository,
  // Imported on first run, so a route that only reads plans never loads the agents.
  workflow: async () => ({ workflow: (await import("@/agents")).mastra.getWorkflow("planGeneration") }),
});
