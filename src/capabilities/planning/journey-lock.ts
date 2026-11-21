import type { PlanRun } from "@/domain/plan/plan-run";

/**
 * After Generate plan the Workspace is closed (merlin, 2026-11-12 and 2026-11-21): the plan was
 * built from the journey as it stood, so the journey no longer changes behind it. A journey with
 * any plan run is locked: its Workspace page sends the traveller to the plan page, and every route
 * that writes the journey from the Workspace refuses with 409 `journey_locked`. The plan page's own
 * writes (preferences, the setting-off card, train or flight) stay open.
 */
export type JourneyLockDependencies = {
  readonly findLatestRun: (tripId: string) => Promise<PlanRun | null>;
  /** Throws when the trip is not this visitor's; the route's own handler then answers 404. */
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<unknown>;
};

export async function isJourneyLocked(tripId: string, deps: Pick<JourneyLockDependencies, "findLatestRun">): Promise<boolean> {
  return (await deps.findLatestRun(tripId)) !== null;
}

export function journeyLockedResponse(): Response {
  return Response.json(
    { error: { code: "journey_locked", message: "This journey has a plan; it can only be read and filled in on its plan page." } },
    { status: 409, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * The 409 answer for a Workspace write to a locked journey, or null to let the route go on. A
 * visitor who does not own the trip, or no visitor, gets null too, so the route answers as it does
 * for any trip that is not theirs and nothing is said about whether it has a plan.
 */
export async function refuseIfLocked(
  tripId: string,
  ownerGuestId: string | null,
  deps: JourneyLockDependencies,
): Promise<Response | null> {
  if (!ownerGuestId) return null;
  if (!(await isJourneyLocked(tripId, deps))) return null;
  try {
    await deps.loadJourney(tripId, ownerGuestId);
  } catch {
    return null;
  }
  return journeyLockedResponse();
}

/** The real dependencies, loaded on first use like the routes' other services. */
export async function journeyLockDependencies(): Promise<JourneyLockDependencies> {
  const [{ planRunRepository }, { journeyService }] = await Promise.all([
    import("@/capabilities/planning/plan-run-repository-instance"),
    import("@/capabilities/journey/journey-service-instance"),
  ]);
  return {
    findLatestRun: (tripId) => planRunRepository.findLatestRun(tripId),
    loadJourney: (tripId, owner) => journeyService.loadJourney(tripId, owner),
  };
}
