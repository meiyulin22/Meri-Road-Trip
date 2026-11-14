import { randomUUID } from "node:crypto";

import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import type { PlanHandoff, PlanHandoffResponse } from "@/domain/plan/plan-handoff";
import { samePreferenceQuote, toPlanPreference, type TripPreference } from "@/domain/plan/trip-preference";
import type { TripMessage } from "@/domain/trip-message/trip-message";
import { evaluateGeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { logger } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";

import type { ExtractedPreference } from "./extract-plan-preferences";

type HandoffContext = Pick<PlanHandoff, "referenceDate" | "timezone" | "locale">;
type HandoffDependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly listMessages: (tripId: string, ownerGuestId: string) => Promise<readonly TripMessage[]>;
  readonly extractPreferences: (messages: readonly TripMessage[], requestId: string) =>
    Promise<{ preferences: readonly ExtractedPreference[]; preferenceStatus: PlanHandoff["preferenceStatus"] }>;
  readonly listPreferences: (tripId: string) => Promise<readonly TripPreference[]>;
  readonly replaceConversationPreferences: (tripId: string, preferences: readonly TripPreference[]) => Promise<void>;
  readonly newId: () => string;
};

/**
 * A new extraction replaces the conversation's earlier one, except for preferences the
 * traveller removed: those stay removed. Ones added on the plan page are kept. When the
 * extraction is unavailable, the saved preferences stand.
 */
async function savePreferences(
  tripId: string,
  extraction: Awaited<ReturnType<HandoffDependencies["extractPreferences"]>>,
  dependencies: HandoffDependencies,
): Promise<TripPreference[]> {
  const saved = await dependencies.listPreferences(tripId);
  const active = saved.filter(({ status }) => status === "active");
  if (extraction.preferenceStatus === "unavailable") return active;

  const removed = saved.filter(({ status }) => status === "removed");
  const fresh: TripPreference[] = extraction.preferences
    .filter(({ quote }) => !removed.some((gone) => samePreferenceQuote(gone.quote, quote)))
    .map(({ messageId, quote, label, kind, createdAt }) => ({
      id: dependencies.newId(), tripId, label, kind, quote, source: "conversation", messageId, status: "active", createdAt,
    }));
  await dependencies.replaceConversationPreferences(tripId, fresh);
  return [...active.filter(({ source }) => source !== "conversation"), ...fresh]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

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
    const extraction = await dependencies.extractPreferences(messages, requestId);
    const preferences = await savePreferences(tripId, extraction, dependencies);
    const response: PlanHandoffResponse = {
      canProceed: true,
      handoff: {
        tripState, ...context,
        preferences: preferences.map(toPlanPreference),
        preferenceStatus: extraction.preferenceStatus,
      },
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
