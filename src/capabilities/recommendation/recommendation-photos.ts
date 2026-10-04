import { findPlaceImage } from "@/capabilities/destination/place-images";
import type { PlaceImage } from "@/domain/location/place-image";
import {
  recommendationsAwaitingPhoto,
  type DestinationRecommendationPresentation,
} from "@/domain/trip-message/trip-message";
import type { PlacePhotoProvider } from "@/platform/place-photos/place-photo-provider";

/** One card's answer: its photo, or null when there is none to show. */
export interface RecommendationPhoto {
  readonly id: string;
  readonly image: PlaceImage | null;
}

/**
 * Looks up the photo of every card that has none yet and reports each one the moment
 * it is known, so the browser can fill cards in as they arrive instead of waiting for
 * the slowest. The lookups all start at once; the shared Amap queue spaces them out.
 *
 * Two places under the same picture read as one place, so a photo already shown in
 * this set goes to whichever card got it first and a later card goes without — first
 * by arrival rather than by position, because a card's answer is final once it is sent.
 */
export async function findRecommendationPhotos(
  presentation: DestinationRecommendationPresentation,
  photos: PlacePhotoProvider,
  onPhoto: (photo: RecommendationPhoto) => void,
): Promise<DestinationRecommendationPresentation> {
  const shown = new Set(presentation.destinations.flatMap((item) => item.image ? [item.image.url] : []));
  const answers = new Map<string, PlaceImage | null>();
  await Promise.all(recommendationsAwaitingPhoto(presentation).map(async (item) => {
    const found = await findPlaceImage({ province: item.province, place: item.name, spot: null,
      landmark: item.landmark ?? null }, photos);
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
