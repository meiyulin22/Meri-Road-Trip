import { randomUUID } from "node:crypto";

import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import type { PlanHandoff, PlanHandoffResponse } from "@/domain/plan/plan-handoff";
import type { TripMessage } from "@/domain/trip-message/trip-message";
import { evaluateGeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { logger } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";

type HandoffContext = Pick<PlanHandoff, "referenceDate" | "timezone" | "locale">;
type HandoffDependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly listMessages: (tripId: string, ownerGuestId: string) => Promise<readonly TripMessage[]>;
  readonly extractPreferences: (messages: readonly TripMessage[], requestId: string) =>
    Promise<Pick<PlanHandoff, "preferences" | "preferenceStatus">>;
};

function noStore(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function planningJourneyNotFound(): Response {
  return noStore({ error: { code: "journey_not_found", message: "Journey not found." } }, 404);
}

export async function handlePlanningHandoffPost(
  tripId: string,
  ownerGuestId: string | null,
  context: HandoffContext,
  dependencies: HandoffDependencies,
): Promise<Response> {
  if (!ownerGuestId) return planningJourneyNotFound();

  const requestId = randomUUID();
  try {
    const { tripState } = await dependencies.loadJourney(tripId, ownerGuestId);
    const readiness = evaluateGeneratePlanReadiness(tripState);
    if (!readiness.canProceed) return noStore(readiness satisfies PlanHandoffResponse);

    const messages = await dependencies.listMessages(tripId, ownerGuestId);
    const preferences = await dependencies.extractPreferences(messages, requestId);
    const response: PlanHandoffResponse = {
      canProceed: true,
      handoff: { tripState, ...context, ...preferences },
    };
    return noStore(response);
  } catch (error) {
    if (error instanceof TripNotFoundError || error instanceof TripStateNotFoundError) {
      return planningJourneyNotFound();
    }
    logger.error({ requestId, tripId, error: serializeError(error) }, "Planning handoff failed");
    return noStore({ error: { code: "internal_error", message: "Failed to prepare the plan." } }, 500);
  }
}
