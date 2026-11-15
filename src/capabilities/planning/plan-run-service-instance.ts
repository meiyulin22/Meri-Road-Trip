import { planRunRepository } from "./plan-run-repository-instance";
import { PlanRunService } from "./plan-run-service";

export const planRunService = new PlanRunService({
  repository: planRunRepository,
  // Imported on first run, so a route that only reads plans never loads the agents.
  workflow: async () => ({ workflow: (await import("@/agents")).mastra.getWorkflow("planGeneration") }),
});
