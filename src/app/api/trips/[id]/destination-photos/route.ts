import { cookies } from "next/headers";

import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { readGuestId } from "@/platform/identity/guest-identity";
import { AmapPlacePhotoProvider } from "@/platform/place-photos/amap-place-photo-provider";
import type { PlacePhotoProvider } from "@/platform/place-photos/place-photo-provider";
import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import { imagesShownInConversation, selectedPlaceImages } from "@/capabilities/destination/place-images";
import type { TripMessage } from "@/domain/trip-message/trip-message";

type Dependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly listMessages: (tripId: string, ownerGuestId: string) => Promise<readonly TripMessage[]>;
  readonly photos: PlacePhotoProvider;
};

/**
 * Photos for the places the Journey holds right now, for the ring around the globe and
 * the title thumbnail. Read-only and derived: nothing is stored, and repeat lookups are
 * answered from the photo provider's own cache.
 */
export async function handleDestinationPhotosGet(
  tripId: string,
  ownerGuestId: string | null,
  dependencies: Dependencies,
): Promise<Response> {
  if (!ownerGuestId) return Response.json({ error: "Journey not found." }, { status: 404 });
  try {
    const { tripState } = await dependencies.loadJourney(tripId, ownerGuestId);
    const areas = tripState.destination.state === "known" ? tripState.destination.areas : [];
    const shown = imagesShownInConversation(await dependencies.listMessages(tripId, ownerGuestId));
    return Response.json({ photos: await selectedPlaceImages(areas, dependencies.photos, shown) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const missing = error instanceof TripNotFoundError || error instanceof TripStateNotFoundError;
    return Response.json({ error: missing ? "Journey not found." : "Photos are unavailable." },
      { status: missing ? 404 : 500 });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const { journeyService } = await import("@/capabilities/journey/journey-service-instance");
  const { tripMessageService } = await import("@/capabilities/conversation/trip-message-service-instance");
  return handleDestinationPhotosGet(id, readGuestId(await cookies()), {
    loadJourney: (tripId, owner) => journeyService.loadJourney(tripId, owner),
    listMessages: (tripId, owner) => tripMessageService.listMessages(tripId, owner),
    photos: new AmapPlacePhotoProvider(),
  });
}
