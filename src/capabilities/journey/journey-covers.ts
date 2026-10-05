import type { PlaceImage } from "@/domain/location/place-image";
import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { JourneySummary } from "@/platform/persistence/journey-summary-repository";
import type { PlacePhotoProvider } from "@/platform/place-photos/place-photo-provider";
import { coverImage, imagesShownInConversation } from "@/capabilities/destination/place-images";

/**
 * Cover photos for a list of Journeys, by Journey ID: the photo each one's Workspace
 * title shows. How a place got into the Journey does not matter — picked from a card,
 * added from what the user typed, or added by hand — because the photo is found from
 * the destination as it is saved now; a place picked from a card keeps that card's
 * photo, as it does in the Workspace.
 *
 * The page does not wait long for them. A Journey whose photo has been looked up
 * before answers from the photo cache at once; a cold lookup that misses `waitMs`
 * leaves that card on its illustration and keeps running, so the next visit has it.
 * A failure is only a missing photo.
 */
export async function journeyCovers(
  journeys: readonly JourneySummary[],
  dependencies: {
    readonly listMessages: (tripId: string) => Promise<readonly TripMessage[]>;
    readonly photos: PlacePhotoProvider;
    readonly waitMs: number;
  },
): Promise<Readonly<Record<string, PlaceImage>>> {
  const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), dependencies.waitMs));
  const found = await Promise.all(journeys.map(async (journey) => {
    if (journey.destinationAreas.length === 0) return null;
    const lookup = dependencies.listMessages(journey.id)
      .then((messages) => coverImage(journey.destinationAreas, dependencies.photos, imagesShownInConversation(messages)))
      .catch(() => null);
    const image = await Promise.race([lookup, deadline]);
    return image ? [journey.id, image] as const : null;
  }));
  return Object.fromEntries(found.filter((entry) => entry !== null));
}
