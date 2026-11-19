import type { PlanProgressEnvelope } from "@/domain/plan/plan-progress";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { PlanRun, PlanRunFinish, PlanVersion } from "@/domain/plan/plan-run";
import type { TripState } from "@/domain/trip-state/trip-state";

/**
 * A fact filled in once on the plan page after the run (1.2107): the version gets the new
 * TripState and plan, and the run the handoff that now matches them, so the page finds the
 * same plan again on its next visit.
 */
export type FilledPlanFacts = {
  readonly versionId: string;
  readonly runId: string;
  readonly tripState: TripState;
  readonly plan: ReadyPlan;
  readonly handoff: PlanHandoff;
  readonly handoffKey: string;
};

/** Plan runs, their progress events and the plan versions they save. */
export interface PlanRunRepository {
  createRun(run: PlanRun): Promise<void>;
  /** Moves a run between running and waiting for an answer; false when it was not in `from`. */
  moveRun(runId: string, from: "running" | "suspended", to: "running" | "suspended"): Promise<boolean>;
  /** Ends a run that is still running; false when it had already ended. */
  finishRun(runId: string, finish: PlanRunFinish): Promise<boolean>;
  findRun(tripId: string, runId: string): Promise<PlanRun | null>;
  findLatestRun(tripId: string): Promise<PlanRun | null>;
  /** How many runs started at or after `since`, every trip together: the site's daily cap (step 2). */
  countRunsStartedSince(since: string): Promise<number>;
  appendEvent(envelope: PlanProgressEnvelope): Promise<void>;
  /** A run's events after the given sequence number, in order. */
  listEvents(runId: string, afterSeq: number): Promise<PlanProgressEnvelope[]>;
  /** Saves the plan as the trip's next version number. */
  createVersion(version: Omit<PlanVersion, "version">): Promise<PlanVersion>;
  findVersionByRun(runId: string): Promise<PlanVersion | null>;
  findLatestVersion(tripId: string): Promise<PlanVersion | null>;
  /** Writes the version first, then the run; false when either row is gone. */
  fillPlanFacts(filled: FilledPlanFacts): Promise<boolean>;
}
