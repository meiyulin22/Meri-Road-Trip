import { validateTripDraftDomain, type TripDraft } from "@/domain/trip-draft/trip-draft";
import type { TripMessagePresentation } from "@/domain/trip-message/trip-message";
import type { LocationResolveResult } from "@/capabilities/destination/location-service";
import type { DestinationDisambiguationResult } from "@/capabilities/destination/verify-destination-disambiguation";
import { replyForDestinationDisambiguation } from "@/capabilities/destination/verify-destination-disambiguation";

import type { Journey } from "./journey-service";

type CreateJourneyWithOpeningDependencies = {
  readonly createJourney: (
    draft: unknown,
    ownerGuestId: string,
    initialUserMessage?: string,
    openingAssistant?: { readonly content: string; readonly presentation?: TripMessagePresentation },
  ) => Promise<Journey>;
  readonly resolveDestination: (expression: string) => Promise<LocationResolveResult>;
  readonly verifyDisambiguation?: (expressions: readonly string[]) => Promise<DestinationDisambiguationResult>;
  readonly initializeOpening: (input: {
    readonly tripId: string;
    readonly ownerGuestId: string;
    readonly requestId: string;
    readonly referenceDate: string;
    readonly timezone: string;
  }) => Promise<unknown>;
};

export async function createJourneyWithOpening(
  input: {
    readonly draft: unknown;
    readonly ownerGuestId: string;
    readonly initialUserMessage?: string;
    readonly requestId: string;
    readonly referenceDate: string;
    readonly timezone: string;
  },
  dependencies: CreateJourneyWithOpeningDependencies,
): Promise<{
  readonly journey: Journey;
  readonly opening: "completed" | "failed" | "not_requested";
  readonly openingError?: unknown;
}> {
  const draft = validateTripDraftDomain(input.draft);
  const destinationExpression = draft.destination.state === "missing" ? null : draft.destination.value;
  if (draft.destinationDisambiguation?.state === "known" && !dependencies.verifyDisambiguation) {
    throw new Error("Destination disambiguation verification is not configured.");
  }
  const disambiguationResult = draft.destinationDisambiguation?.state === "known"
    ? await dependencies.verifyDisambiguation!(draft.destinationDisambiguation.value)
    : null;
  const resolution = destinationExpression === null || disambiguationResult !== null
    ? null
    : await dependencies.resolveDestination(destinationExpression);
  const rejected = disambiguationResult !== null || (resolution !== null && resolution.status !== "resolved");
  const creationDraft: TripDraft = rejected
    ? { ...draft, destination: { state: "missing" }, name: { state: "missing" },
        destinationDisambiguation: { state: "missing", value: null } }
    : draft;
  const openingAssistant = input.initialUserMessage === undefined || !rejected || destinationExpression === null
    ? undefined
    : disambiguationResult !== null
      ? openingAfterDisambiguation(destinationExpression, disambiguationResult)
      : openingAfterRejectedDestination(destinationExpression, resolution!);
  const journey = await dependencies.createJourney(
    creationDraft,
    input.ownerGuestId,
    input.initialUserMessage,
    openingAssistant,
  );
  if (input.initialUserMessage === undefined) {
    return { journey, opening: "not_requested" };
  }
  if (openingAssistant) {
    return { journey, opening: "completed" };
  }

  try {
    await dependencies.initializeOpening({
      tripId: journey.trip.id,
      ownerGuestId: input.ownerGuestId,
      requestId: input.requestId,
      referenceDate: input.referenceDate,
      timezone: input.timezone,
    });
    return { journey, opening: "completed" };
  } catch (openingError) {
    return { journey, opening: "failed", openingError };
  }
}

function openingAfterDisambiguation(
  expression: string,
  result: DestinationDisambiguationResult,
): { readonly content: string; readonly presentation?: TripMessagePresentation } {
  return {
    content: replyForDestinationDisambiguation(expression, result, false),
    ...(result.status === "verified"
      ? { presentation: { type: "location_candidates" as const, candidates: result.candidates } }
      : {}),
  };
}

function openingAfterRejectedDestination(
  expression: string,
  resolution: LocationResolveResult,
): { readonly content: string; readonly presentation?: TripMessagePresentation } {
  const waysForward = "你也可以告诉我更多地点信息，或在右侧 Journey Overview 中手动选择目的地。";
  if (resolution.status === "ambiguous") {
    return {
      content: `「${expression}」可能对应下方几个地点，请选一个。${waysForward}`,
      presentation: { type: "location_candidates", candidates: resolution.candidates },
    };
  }
  if (resolution.status === "provider_error") {
    return { content: `我暂时无法验证「${expression}」对应的地点，所以还没有记录目的地。请稍后再告诉我一次，或在右侧 Journey Overview 中手动选择目的地。` };
  }
  return { content: `我暂时没找到「${expression}」对应的地点，所以还没有记录目的地。${waysForward}` };
}
