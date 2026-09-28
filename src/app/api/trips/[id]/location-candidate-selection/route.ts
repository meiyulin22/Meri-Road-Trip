import { cookies } from "next/headers";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { GeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { AmapLocationProvider } from "@/platform/location-provider/amap-location-provider";
import { readGuestId } from "@/platform/identity/guest-identity";
import { TripStateNotFoundError } from "@/server/journey/journey-errors";
import { checkGeneratePlanReadiness } from "@/server/location/generate-plan-readiness";
import { LocationService } from "@/server/location/location-service";
import { locationCandidateSelectionReply } from "@/server/location/location-candidate-selection-reply";
import { locationCandidateSelectionMessageId } from "@/server/trip-message/location-candidate-selection-id";

type Dependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly listMessages: (tripId: string, ownerGuestId: string) => Promise<TripMessage[]>;
  readonly updateTripState: (tripId: string, ownerGuestId: string, patch: TripStatePatch) => Promise<TripState>;
  readonly checkReadiness: (tripState: TripState) => Promise<GeneratePlanReadiness>;
  readonly persistFollowUp: (input: {
    tripId: string; ownerGuestId: string; candidateMessageId: string; candidateIndex: number; content: string;
  }) => Promise<TripMessage>;
};

export async function handleLocationCandidateSelectionPost(
  tripId: string,
  ownerGuestId: string | null,
  body: unknown,
  dependencies: Dependencies,
): Promise<Response> {
  if (!ownerGuestId) return Response.json({ error: "Journey not found." }, { status: 404 });
  if (typeof body !== "object" || body === null || !("messageId" in body) ||
    typeof body.messageId !== "string" || !("candidateIndex" in body) ||
    !Number.isSafeInteger(body.candidateIndex) || (body.candidateIndex as number) < 0 ||
    Object.keys(body).length !== 2) {
    return Response.json({ error: "Invalid candidate selection." }, { status: 400 });
  }

  try {
    const { tripState: currentState } = await dependencies.loadJourney(tripId, ownerGuestId);
    const messages = await dependencies.listMessages(tripId, ownerGuestId);
    const message = messages.find((item) => item.id === body.messageId && item.tripId === tripId && item.role === "assistant");
    const presentation = message?.presentation;
    if (!message || presentation?.type !== "location_candidates") {
      return Response.json({ error: "Candidate selection not found." }, { status: 404 });
    }
    const candidate = presentation.candidates[body.candidateIndex as number];
    if (!candidate) return Response.json({ error: "Candidate selection not found." }, { status: 404 });
    const candidateIndex = body.candidateIndex as number;
    const followUpId = locationCandidateSelectionMessageId(tripId, message.id, candidateIndex);
    const existingFollowUp = messages.find((item) => item.id === followUpId && item.role === "assistant");
    if (existingFollowUp) {
      const currentDestination = currentState.destination;
      if (currentDestination.state !== "known" || currentDestination.value !== candidate.name ||
        currentDestination.selection?.providerId !== candidate.providerId) {
        return Response.json({ error: "Candidate selection is no longer current." }, { status: 409 });
      }
      return Response.json({ tripState: currentState, assistantMessage: existingFollowUp });
    }
    const tripState = await dependencies.updateTripState(tripId, ownerGuestId, {
      destination: {
        state: "known",
        value: candidate.name,
        source: "user",
        selection: {
          provider: "amap",
          providerId: candidate.providerId,
          ...(candidate.region !== null ? { region: candidate.region } : {}),
          ...(candidate.address !== null ? { address: candidate.address } : {}),
          coordinates: {
            longitude: candidate.longitude,
            latitude: candidate.latitude,
            coordinateSystem: candidate.coordinateSystem,
          },
        },
      },
    });
    try {
      const readiness = await dependencies.checkReadiness(tripState);
      const assistantMessage = await dependencies.persistFollowUp({
        tripId, ownerGuestId, candidateMessageId: message.id, candidateIndex,
        content: locationCandidateSelectionReply(tripState, readiness),
      });
      return Response.json({ tripState, assistantMessage });
    } catch {
      return Response.json({ error: "Destination saved, but the follow-up is unavailable.",
        code: "follow_up_unavailable", tripState }, { status: 500 });
    }
  } catch (error) {
    const missing = error instanceof TripNotFoundError || error instanceof TripStateNotFoundError;
    return Response.json({ error: missing ? "Journey not found." : "Candidate selection unavailable." },
      { status: missing ? 404 : 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid candidate selection." }, { status: 400 });
  }
  const { journeyService } = await import("@/server/journey/journey-service-instance");
  const { tripMessageService } = await import("@/server/trip-message/trip-message-service-instance");
  return handleLocationCandidateSelectionPost(id, readGuestId(await cookies()), body, {
    loadJourney: (tripId, owner) => journeyService.loadJourney(tripId, owner),
    listMessages: (tripId, owner) => tripMessageService.listMessages(tripId, owner),
    updateTripState: (tripId, owner, patch) => journeyService.updateTripState(tripId, owner, patch),
    checkReadiness: (tripState) => checkGeneratePlanReadiness(tripState,
      new LocationService(new AmapLocationProvider())),
    persistFollowUp: (input) => tripMessageService.persistLocationCandidateSelectionReply(input),
  });
}
