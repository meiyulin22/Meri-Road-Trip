import { validateTripDraftDomain } from "@/domain/trip-draft/trip-draft";
import type { TripMessagePresentation } from "@/domain/trip-message/trip-message";
import type { LocationResolveResult } from "@/capabilities/destination/location-service";
import { applyDestinationEdit } from "@/capabilities/destination/apply-destination-edit";
import { resolveDestinationPlace } from "@/capabilities/destination/resolve-destination-place";
import { destinationEditReply } from "@/capabilities/conversation/turn-reply";
import { withChoiceImages } from "@/capabilities/destination/place-images";
import type { PlacePhotoProvider } from "@/platform/place-photos/place-photo-provider";
import { initializeTripState, type DestinationField } from "@/domain/trip-state/trip-state";

import type { Journey } from "./journey-service";

type CreateJourneyWithOpeningDependencies = {
  readonly createJourney: (draft: unknown, ownerGuestId: string, initialUserMessage?: string,
    openingAssistant?: { readonly content: string; readonly presentation?: TripMessagePresentation },
    initialDestination?: DestinationField) => Promise<Journey>;
  readonly resolveDestination: (expression: string) => Promise<LocationResolveResult>;
  readonly photos: PlacePhotoProvider;
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
      (expression) => resolveDestinationPlace(expression, dependencies.resolveDestination), input.initialUserMessage)
    : null;
  // Only a turn that needs the user — a card, or a name that could not be placed —
  // opens with the application's own sentence. A destination that simply landed is
  // in the Journey already, and the model's opening greets it like any other state.
  const initialState = initializeTripState(draft);
  const createdState = result?.changed ? { ...initialState, destination: result.destination } : initialState;
  const reply = result ? destinationEditReply(result, "", initialState, createdState) : "";
  const openingAssistant = result && reply !== "" && (result.choices || result.unresolved.length || result.lookupFailed.length)
    ? { content: reply, ...(result.choices
      ? { presentation: await withChoiceImages(result.choices.presentation, dependencies.photos) } : {}) }
    : undefined;
  const journey = await dependencies.createJourney(draft, input.ownerGuestId, input.initialUserMessage, openingAssistant,
    result?.changed ? result.destination : undefined);
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
