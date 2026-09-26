import { cookies } from "next/headers";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { readGuestId } from "@/server/identity/guest-identity";
import { TripStateNotFoundError } from "@/server/journey/journey-errors";
import { journeyService } from "@/server/journey/journey-service-instance";
import { tripMessageService } from "@/server/trip-message/trip-message-service-instance";

type Dependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly listMessages: (tripId: string, ownerGuestId: string) => Promise<TripMessage[]>;
  readonly updateTripState: (tripId: string, ownerGuestId: string, patch: TripStatePatch) => Promise<TripState>;
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
    await dependencies.loadJourney(tripId, ownerGuestId);
    const messages = await dependencies.listMessages(tripId, ownerGuestId);
    const message = messages.find((item) => item.id === body.messageId && item.tripId === tripId && item.role === "assistant");
    const presentation = message?.presentation;
    if (presentation?.type !== "location_candidates") {
      return Response.json({ error: "Candidate selection not found." }, { status: 404 });
    }
    const candidate = presentation.candidates[body.candidateIndex as number];
    if (!candidate) return Response.json({ error: "Candidate selection not found." }, { status: 404 });
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
    return Response.json({ tripState });
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
  return handleLocationCandidateSelectionPost(id, readGuestId(await cookies()), body, {
    loadJourney: (tripId, owner) => journeyService.loadJourney(tripId, owner),
    listMessages: (tripId, owner) => tripMessageService.listMessages(tripId, owner),
    updateTripState: (tripId, owner, patch) => journeyService.updateTripState(tripId, owner, patch),
  });
}
