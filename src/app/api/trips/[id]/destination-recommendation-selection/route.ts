import { cookies } from "next/headers";

import type { DestinationChoice, TripMessage } from "@/domain/trip-message/trip-message";
import { destinationPreferenceId, groupDestinationChoices } from "@/domain/trip-message/destination-choice-identity";
import { addToDestination, destinationContains, type DestinationArea, type DestinationPick } from "@/domain/trip-state/destination-areas";
import type { TripState, TripStatePatch, DestinationField } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { AmapLocationProvider } from "@/platform/location-provider/amap-location-provider";
import { readGuestId } from "@/platform/identity/guest-identity";
import { TripStateNotFoundError, TripStateConflictError } from "@/capabilities/journey/journey-errors";
import { LocationService } from "@/capabilities/destination/location-service";
import { picksFromSearch } from "@/capabilities/destination/resolve-destination-place";
import { verifyDestinationChoice } from "@/capabilities/destination/verified-destination-choice";
import { destinationSelectionReply } from "@/capabilities/destination/destination-selection-reply";
import { destinationRecommendationSelectionMessageId } from "@/capabilities/conversation/destination-selection-message-id";

type Dependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly listMessages: (tripId: string, ownerGuestId: string) => Promise<TripMessage[]>;
  readonly updateTripState: (tripId: string, ownerGuestId: string, patch: TripStatePatch, expectedDestination?: DestinationField) => Promise<TripState>;
  readonly verifyChoice?: (choice: DestinationChoice) => Promise<{ status: "verified"; pick: DestinationPick } | { status: "unresolved" | "provider_error" }>;
  readonly persistFollowUp: (input: {
    tripId: string; ownerGuestId: string; messageId: string; content: string;
  }) => Promise<TripMessage>;
};

function offerChoices(message: TripMessage): { choices: readonly DestinationChoice[]; mode: "add" | "replace";
  baseDestination?: string } | null {
  const presentation = message.presentation;
  if (presentation?.type === "destination_choices") return presentation;
  if (presentation?.type === "destination_recommendations") {
    return { mode: "add", choices: presentation.destinations.flatMap((item) =>
      item.province === null ? [] : [{ id: item.id, name: item.name, province: item.province }]) };
  }
  if (presentation?.type === "location_candidates") {
    return { mode: "add", choices: picksFromSearch(presentation.candidates).map((pick) => ({
      id: pick.id, name: pick.spot ?? pick.place ?? pick.province, province: pick.province,
      ...(pick.place === null ? {} : { city: pick.place }),
      ...(pick.spot === null ? {} : { spot: pick.spot }),
      ...(pick.detail ? { detail: pick.detail } : {}),
    })) };
  }
  return null;
}

export async function handleDestinationRecommendationSelectionPost(
  tripId: string,
  ownerGuestId: string | null,
  body: unknown,
  dependencies: Dependencies,
): Promise<Response> {
  if (!ownerGuestId) return Response.json({ error: "Journey not found." }, { status: 404 });
  if (typeof body !== "object" || body === null || Array.isArray(body) ||
    Object.keys(body).length !== 2 || !("messageId" in body) ||
    typeof body.messageId !== "string" || !body.messageId.trim() || !("destinationIds" in body) ||
    !Array.isArray(body.destinationIds) || body.destinationIds.length === 0 ||
    body.destinationIds.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(body.destinationIds).size !== body.destinationIds.length) {
    return Response.json({ error: "Invalid destination selection." }, { status: 400 });
  }
  const destinationIds: readonly string[] = body.destinationIds;
  try {
    let { tripState: currentState } = await dependencies.loadJourney(tripId, ownerGuestId);
    const messages = await dependencies.listMessages(tripId, ownerGuestId);
    const message = messages.find((item) => item.id === body.messageId && item.tripId === tripId && item.role === "assistant");
    const offer = message ? offerChoices(message) : null;
    if (!message || !offer) return Response.json({ error: "Destination offer not found." }, { status: 404 });
    const chosen = offer.choices.filter((choice) => destinationIds.includes(choice.id));
    if (chosen.length !== destinationIds.length) {
      return Response.json({ error: "Destination offer not found." }, { status: 404 });
    }
    const followUpId = destinationRecommendationSelectionMessageId(tripId, message.id, destinationIds);
    const existingFollowUp = messages.find((item) => item.id === followUpId && item.role === "assistant");
    if (!existingFollowUp && messages.at(-1)?.id !== message.id) {
      return Response.json({ error: "Destination offer expired. Please ask again.", code: "offer_expired" }, { status: 409 });
    }
    if (offer.mode === "replace" && !existingFollowUp && offer.baseDestination !== JSON.stringify(currentState.destination)) {
      return Response.json({ error: "Destination changed since this offer. Please ask again." }, { status: 409 });
    }

    const service = new LocationService(new AmapLocationProvider());
    const verify = dependencies.verifyChoice ?? ((choice: DestinationChoice) => verifyDestinationChoice(choice, service));
    // Older cards submitted all POI IDs behind a displayed preference. Verify the
    // preference once instead of repeating identical map queries for that city.
    const verificationChoices = groupDestinationChoices(chosen).flatMap(({ choice, ids }) =>
      choice.city && ids.length > 1 ? [{ ...choice,
        id: destinationPreferenceId(choice.province, choice.city, choice.spot ?? null), name: choice.city }]
        : chosen.filter((item) => ids.includes(item.id)));
    const resolved = await Promise.all(verificationChoices.map(verify));
    if (resolved.some((item) => item.status !== "verified")) {
      return Response.json({ error: "Some places could not be verified. Please search again." }, { status: 409 });
    }
    // Verification can take seconds; merge into the state that exists afterwards.
    ({ tripState: currentState } = await dependencies.loadJourney(tripId, ownerGuestId));
    const currentAreas = currentState.destination.state === "known" ? currentState.destination.areas : [];
    const alreadyAdded = resolved.every((item) => item.status === "verified" &&
      destinationContains(currentAreas, item.pick));
    const replacementAreas = resolved.reduce<readonly DestinationArea[]>((all, item) =>
      item.status === "verified" ? addToDestination(all, item.pick) : all, []);
    const replacementMatches = currentState.destination.state === "known" &&
      !currentState.destination.legacyText && JSON.stringify(currentAreas) === JSON.stringify(replacementAreas);
    if (existingFollowUp && alreadyAdded && (offer.mode === "add" || replacementMatches)) {
      return Response.json({ tripState: currentState, assistantMessage: existingFollowUp });
    }
    // A cached response may be returned, but an old card must never mutate state
    // after another turn or restore a destination the user subsequently removed.
    const latestMessages = await dependencies.listMessages(tripId, ownerGuestId);
    if (existingFollowUp || latestMessages.at(-1)?.id !== message.id) {
      return Response.json({ error: "Destination offer expired. Please ask again.", code: "offer_expired" }, { status: 409 });
    }
    if (offer.mode === "replace" && offer.baseDestination !== JSON.stringify(currentState.destination)) {
      return Response.json({ error: "Destination changed since this offer. Please ask again." }, { status: 409 });
    }
    const initial: readonly DestinationArea[] = offer.mode === "replace" ? [] : currentAreas;
    const areas = resolved.reduce<readonly DestinationArea[]>((all, item) =>
      item.status === "verified" ? addToDestination(all, item.pick) : all, initial);
    const tripState = await dependencies.updateTripState(tripId, ownerGuestId, {
      destination: { state: "known", source: "user", areas,
        ...(offer.mode === "add" && currentState.destination.state === "known" && currentState.destination.legacyText
          ? { legacyText: currentState.destination.legacyText } : {}) },
    }, currentState.destination);
    try {
      const assistantMessage = await dependencies.persistFollowUp({
        tripId, ownerGuestId, messageId: followUpId,
        content: destinationSelectionReply(tripState, currentState),
      });
      return Response.json({ tripState, assistantMessage });
    } catch {
      return Response.json({ error: "Destination saved, but the follow-up is unavailable.",
        code: "follow_up_unavailable", tripState }, { status: 500 });
    }
  } catch (error) {
    if (error instanceof TripStateConflictError) {
      return Response.json({ error: "Destination changed while saving. Please retry." }, { status: 409 });
    }
    const missing = error instanceof TripNotFoundError || error instanceof TripStateNotFoundError;
    return Response.json({ error: missing ? "Journey not found." : "Destination selection unavailable." },
      { status: missing ? 404 : 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid destination selection." }, { status: 400 }); }
  const { journeyService } = await import("@/capabilities/journey/journey-service-instance");
  const { tripMessageService } = await import("@/capabilities/conversation/trip-message-service-instance");
  return handleDestinationRecommendationSelectionPost(id, readGuestId(await cookies()), body, {
    loadJourney: (tripId, owner) => journeyService.loadJourney(tripId, owner),
    listMessages: (tripId, owner) => tripMessageService.listMessages(tripId, owner),
    updateTripState: (tripId, owner, patch, expected) => journeyService.updateTripState(tripId, owner, patch, expected),
    persistFollowUp: (input) => tripMessageService.persistDestinationSelectionReply(input),
  });
}
