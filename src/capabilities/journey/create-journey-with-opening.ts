import { validateTripDraftDomain } from "@/domain/trip-draft/trip-draft";
import type { TripMessagePresentation } from "@/domain/trip-message/trip-message";
import type { LocationResolveResult } from "@/capabilities/destination/location-service";
import { applyDestinationEdit } from "@/capabilities/destination/apply-destination-edit";
import { resolveDestinationPlace } from "@/capabilities/destination/resolve-destination-place";

import type { Journey } from "./journey-service";

type CreateJourneyWithOpeningDependencies = {
  readonly createJourney: (draft: unknown, ownerGuestId: string, initialUserMessage?: string,
    openingAssistant?: { readonly content: string; readonly presentation?: TripMessagePresentation }) => Promise<Journey>;
  readonly resolveDestination: (expression: string) => Promise<LocationResolveResult>;
  readonly initializeOpening: (input: {
    readonly tripId: string; readonly ownerGuestId: string; readonly requestId: string;
    readonly referenceDate: string; readonly timezone: string;
  }) => Promise<unknown>;
};

export async function createJourneyWithOpening(
  input: {
    readonly draft: unknown; readonly ownerGuestId: string; readonly initialUserMessage?: string;
    readonly requestId: string; readonly referenceDate: string; readonly timezone: string;
  },
  dependencies: CreateJourneyWithOpeningDependencies,
): Promise<{ readonly journey: Journey; readonly opening: "completed" | "failed" | "not_requested";
  readonly openingError?: unknown }> {
  const draft = validateTripDraftDomain(input.draft);
  const result = input.initialUserMessage && draft.destinationEdit.operation !== "none"
    ? await applyDestinationEdit({ state: "missing" }, draft.destinationEdit,
      (expression) => resolveDestinationPlace(expression, dependencies.resolveDestination))
    : null;
  const openingAssistant = result?.choices ? {
    content: `找到「${result.choices.answering}」相关的地点了。选好后点击添加，才会记入旅程。${
      result.unresolved.length ? `「${result.unresolved.join("、")}」暂时没找到。` : ""}${
      result.lookupFailed.length ? `「${result.lookupFailed.join("、")}」查询暂时不可用。` : ""}`,
    presentation: result.choices.presentation,
  } : result && (result.unresolved.length || result.lookupFailed.length) ? {
    content: result.lookupFailed.length
      ? "地点查询暂时不可用，目的地还没有添加。请稍后再试。"
      : "暂时没找到可确认的地点，目的地还没有添加。试试更具体的名称。",
  } : undefined;
  const journey = await dependencies.createJourney(draft, input.ownerGuestId, input.initialUserMessage, openingAssistant);
  if (input.initialUserMessage === undefined) return { journey, opening: "not_requested" };
  if (openingAssistant) return { journey, opening: "completed" };
  try {
    await dependencies.initializeOpening({ tripId: journey.trip.id, ownerGuestId: input.ownerGuestId,
      requestId: input.requestId, referenceDate: input.referenceDate, timezone: input.timezone });
    return { journey, opening: "completed" };
  } catch (openingError) {
    return { journey, opening: "failed", openingError };
  }
}
