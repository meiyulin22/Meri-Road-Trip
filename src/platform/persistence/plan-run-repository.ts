import type { PlanProgressEnvelope } from "@/domain/plan/plan-progress";
import type { PlanRun, PlanRunFinish, PlanVersion } from "@/domain/plan/plan-run";

/** Plan runs, their progress events and the plan versions they save. */
export interface PlanRunRepository {
  createRun(run: PlanRun): Promise<void>;
  /** Moves a run between running and waiting for an answer; false when it was not in `from`. */
  moveRun(runId: string, from: "running" | "suspended", to: "running" | "suspended"): Promise<boolean>;
  /** Ends a run that is still running; false when it had already ended. */
  finishRun(runId: string, finish: PlanRunFinish): Promise<boolean>;
  findRun(tripId: string, runId: string): Promise<PlanRun | null>;
  findLatestRun(tripId: string): Promise<PlanRun | null>;
  appendEvent(envelope: PlanProgressEnvelope): Promise<void>;
  /** A run's events after the given sequence number, in order. */
  listEvents(runId: string, afterSeq: number): Promise<PlanProgressEnvelope[]>;
  /** Saves the plan as the trip's next version number. */
  createVersion(version: Omit<PlanVersion, "version">): Promise<PlanVersion>;
  findVersionByRun(runId: string): Promise<PlanVersion | null>;
  findLatestVersion(tripId: string): Promise<PlanVersion | null>;
}
