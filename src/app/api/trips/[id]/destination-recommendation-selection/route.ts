import { cookies } from "next/headers";

import type { DestinationRecommendationPresentation, TripMessage } from "@/domain/trip-message/trip-message";
import { destinationAreasText, groupDestinationAreas, sameDestinationAreas, type DestinationArea } from "@/domain/trip-state/destination-areas";
import type { GeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { AmapLocationProvider } from "@/platform/location-provider/amap-location-provider";
import { readGuestId } from "@/platform/identity/guest-identity";
import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import { checkGeneratePlanReadiness } from "@/capabilities/destination/generate-plan-readiness";
import { LocationService } from "@/capabilities/destination/location-service";
import { destinationSelectionReply } from "@/capabilities/destination/destination-selection-reply";
import { destinationRecommendationSelectionMessageId } from "@/capabilities/conversation/destination-selection-message-id";

type Dependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly listMessages: (tripId: string, ownerGuestId: string) => Promise<TripMessage[]>;
  readonly updateTripState: (tripId: string, ownerGuestId: string, patch: TripStatePatch) => Promise<TripState>;
  readonly checkReadiness: (tripState: TripState) => Promise<GeneratePlanReadiness>;
  readonly persistFollowUp: (input: {
    tripId: string; ownerGuestId: string; messageId: string; content: string;
  }) => Promise<TripMessage>;
};

export async function handleDestinationRecommendationSelectionPost(
  tripId: string,
  ownerGuestId: string | null,
  body: unknown,
  dependencies: Dependencies,
): Promise<Response> {
  if (!ownerGuestId) return Response.json({ error: "Journey not found." }, { status: 404 });
  if (typeof body !== "object" || body === null || Object.keys(body).length !== 2 ||
    !("messageId" in body) || typeof body.messageId !== "string" ||
    !("destinationIds" in body) || !Array.isArray(body.destinationIds) ||
    body.destinationIds.length === 0 ||
    body.destinationIds.some((id) => typeof id !== "string") ||
    new Set(body.destinationIds).size !== body.destinationIds.length) {
    return Response.json({ error: "Invalid recommendation selection." }, { status: 400 });
  }
  const destinationIds: readonly string[] = body.destinationIds;

  try {
    const { tripState: currentState } = await dependencies.loadJourney(tripId, ownerGuestId);
    const messages = await dependencies.listMessages(tripId, ownerGuestId);
    const message = messages.find((item) => item.id === body.messageId && item.tripId === tripId && item.role === "assistant");
    const presentation = message?.presentation;
    if (!message || presentation?.type !== "destination_recommendations") {
      return Response.json({ error: "Recommendation selection not found." }, { status: 404 });
    }
    // Only the cards Meri actually offered can be picked: every name and province
    // comes from the persisted presentation, never from the request.
    const chosen = destinationIds.map((id) => presentation.destinations.find((item) => item.id === id));
    if (chosen.some((item) => item === undefined)) {
      return Response.json({ error: "Recommendation selection not found." }, { status: 404 });
    }
    const areas = chosenAreas(chosen as OfferedDestinations);
    if (areas === null) {
      return Response.json({ error: "Recommendation selection is no longer current." }, { status: 409 });
    }
    const value = destinationAreasText(areas);
    const followUpId = destinationRecommendationSelectionMessageId(tripId, message.id, destinationIds);
    const existingFollowUp = messages.find((item) => item.id === followUpId && item.role === "assistant");
    if (existingFollowUp) {
      if (!stillHolds(currentState.destination, areas, value)) {
        return Response.json({ error: "Recommendation selection is no longer current." }, { status: 409 });
      }
      return Response.json({ tripState: currentState, assistantMessage: existingFollowUp });
    }
    const tripState = await dependencies.updateTripState(tripId, ownerGuestId, {
      destination: { state: "known", value, source: "user", areas },
    });
    try {
      // The readiness check resolves the name against the Location Provider, so
      // the reply describes the destination Meri can really plan from.
      const readiness = await dependencies.checkReadiness(tripState);
      const assistantMessage = await dependencies.persistFollowUp({
        tripId, ownerGuestId, messageId: followUpId,
        content: destinationSelectionReply(tripState, readiness),
      });
      return Response.json({ tripState, assistantMessage });
    } catch {
      return Response.json({ error: "Destination saved, but the follow-up is unavailable.",
        code: "follow_up_unavailable", tripState }, { status: 500 });
    }
  } catch (error) {
    const missing = error instanceof TripNotFoundError || error instanceof TripStateNotFoundError;
    return Response.json({ error: missing ? "Journey not found." : "Recommendation selection unavailable." },
      { status: missing ? 404 : 500 });
  }
}

type OfferedDestinations = DestinationRecommendationPresentation["destinations"];

/**
 * A reply already written means this same set of cards was picked before, so the only
 * question left is whether the Journey still holds that choice: if the user has since
 * moved somewhere else, replaying the old reply would describe a destination that is
 * gone. The places are compared rather than the text, because the follow-up id does
 * not depend on the order they were clicked in. Destinations saved before places were
 * grouped carry no areas, and their text is all there is to compare.
 */
function stillHolds(
  destination: TripState["destination"],
  areas: readonly DestinationArea[],
  value: string,
): boolean {
  if (destination.state !== "known") return false;
  return destination.areas ? sameDestinationAreas(destination.areas, areas) : destination.value === value;
}

/**
 * The picks become the destination itself, grouped by the provinces they were offered
 * under. Cards from before places were grouped can carry no province, and there is
 * nowhere truthful to file those: the offer is stale rather than wrong, so it is
 * refused as stale and a fresh list can be asked for.
 */
function chosenAreas(chosen: OfferedDestinations): ReturnType<typeof groupDestinationAreas> | null {
  const places: { province: string; name: string }[] = [];
  for (const destination of chosen) {
    if (destination.province === null) return null;
    places.push({ province: destination.province, name: destination.name });
  }
  return groupDestinationAreas(places);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid recommendation selection." }, { status: 400 });
  }
  const { journeyService } = await import("@/capabilities/journey/journey-service-instance");
  const { tripMessageService } = await import("@/capabilities/conversation/trip-message-service-instance");
  return handleDestinationRecommendationSelectionPost(id, readGuestId(await cookies()), body, {
    loadJourney: (tripId, owner) => journeyService.loadJourney(tripId, owner),
    listMessages: (tripId, owner) => tripMessageService.listMessages(tripId, owner),
    updateTripState: (tripId, owner, patch) => journeyService.updateTripState(tripId, owner, patch),
    checkReadiness: (tripState) => checkGeneratePlanReadiness(tripState,
      new LocationService(new AmapLocationProvider())),
    persistFollowUp: (input) => tripMessageService.persistDestinationSelectionReply(input),
  });
}
