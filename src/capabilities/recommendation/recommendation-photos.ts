import { findPlaceImage } from "@/capabilities/destination/place-images";
import type { PlaceImage } from "@/domain/location/place-image";
import {
  recommendationsAwaitingPhoto,
  type DestinationRecommendationPresentation,
} from "@/domain/trip-message/trip-message";
import type { RemotePhotoFinder } from "@/platform/place-photos/pixabay-photo-finder";
import type { PlacePhotoProvider } from "@/platform/place-photos/place-photo-provider";

/** One card's answer: its photo, or null when there is none to show. */
export interface RecommendationPhoto {
  readonly id: string;
  readonly image: PlaceImage | null;
}

/** A card whose photo could not be looked up this time, and why; it stays unanswered. */
export interface DeferredRecommendationPhoto {
  readonly id: string;
  readonly reason: string;
}

/**
 * Looks up the photo of every card that has none yet and reports each one the moment
 * it is known, so the browser can fill cards in as they arrive instead of waiting for
 * the slowest. The lookups all start at once; the provider's own queue spaces them out.
 *
 * Local photos are asked first (the bundled catalog, then photos downloaded earlier).
 * A card with an English landmark name the local ones lack may then be searched on
 * Pixabay. When that search cannot run — the network, a rate limit, the per-set budget
 * — the card gets no answer at all: it is not reported, stays unlooked-up in the saved
 * message, and is asked again on a later visit, instead of being saved as having no photo.
 *
 * Two places under the same picture read as one place, so a photo already shown in
 * this set goes to whichever card got it first and a later card goes without — first
 * by arrival rather than by position, because a card's answer is final once it is sent.
 */
export async function findRecommendationPhotos(
  presentation: DestinationRecommendationPresentation,
  photos: PlacePhotoProvider,
  onPhoto: (photo: RecommendationPhoto) => void,
  remote: RemotePhotoFinder | null = null,
  onDeferred: (deferred: DeferredRecommendationPhoto) => void = () => undefined,
): Promise<DestinationRecommendationPresentation> {
  const shown = new Set(presentation.destinations.flatMap((item) => item.image ? [item.image.url] : []));
  const answers = new Map<string, PlaceImage | null>();
  const batch = remote?.startBatch() ?? null;
  await Promise.all(recommendationsAwaitingPhoto(presentation).map(async (item) => {
    let found = await findPlaceImage({ province: item.province, place: item.name, spot: null,
      landmark: item.landmark ?? null }, photos);
    if (!found && remote && batch && item.landmark && item.landmarkEn) {
      const result = await remote.find({ province: item.province, region: item.name,
        landmark: item.landmark, english: item.landmarkEn }, batch);
      if (result.status === "unavailable") {
        onDeferred({ id: item.id, reason: result.reason });
        return;
      }
      found = result.status === "found" ? result.image : null;
    }
    const image = found && !shown.has(found.url) ? found : null;
    if (image) shown.add(image.url);
    answers.set(item.id, image);
    onPhoto({ id: item.id, image });
  }));
  return {
    ...presentation,
    destinations: presentation.destinations.map((item) =>
      answers.has(item.id) ? { ...item, image: answers.get(item.id) ?? null } : item),
  };
}
