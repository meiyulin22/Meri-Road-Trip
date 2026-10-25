import { findPlaceImage } from "@/capabilities/destination/place-images";
import { placePhotoRulesVersion, type PlaceImage } from "@/domain/location/place-image";
import {
  recommendationsAwaitingPhoto,
  type DestinationRecommendation,
  type DestinationRecommendationPresentation,
} from "@/domain/trip-message/trip-message";
import type { RemotePhotoFinder, RemotePhotoResult } from "@/platform/place-photos/remote-photo-finder";
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

type CardAwaitingPhoto = DestinationRecommendation & { readonly province: string };

/**
 * The landmarks a card may show, in order: its own, then the stand-ins the model named
 * for the same place. A stand-in keeps its own name as the caption — the card is about
 * the 市, and the photo says truthfully which sight in it is shown.
 */
function landmarksOf(item: CardAwaitingPhoto): { landmark: string; english?: string; aliases?: readonly string[] }[] {
  if (!item.landmark) return [];
  return [
    { landmark: item.landmark, english: item.landmarkEn, aliases: item.landmarkAliases },
    ...(item.backupLandmarks ?? []).map((backup) => ({ landmark: backup.name, english: backup.en })),
  ];
}

/** A remote source and what this set of cards may still spend there. */
interface RemoteSource {
  readonly finder: RemotePhotoFinder;
  readonly batch: unknown;
}

/**
 * One card's photo: local photos first — the card's landmark, then the 市's own
 * representative or a photo already downloaded for another sight in it, then each
 * stand-in landmark — and only then the remote sources in order (Wikimedia, then
 * Pixabay), each asked for the card's landmark and its first stand-in before the next
 * source is. An exact Wikidata photo of the stand-in beats a tag-read Pixabay photo of
 * the landmark, and costs no Pixabay quota. "unavailable" means some source could not be
 * asked this time; nothing is decided.
 */
async function photoFor(item: CardAwaitingPhoto, photos: PlacePhotoProvider, remotes: readonly RemoteSource[]):
  Promise<RemotePhotoResult> {
  const landmarks = landmarksOf(item);
  const local = await findPlaceImage({ province: item.province, place: item.name, spot: null,
    landmark: landmarks[0]?.landmark ?? null }, photos);
  if (local) return { status: "found", image: local };
  for (const backup of landmarks.slice(1)) {
    const image = await findPlaceImage({ province: item.province, place: item.name, spot: backup.landmark }, photos);
    if (image) return { status: "found", image };
  }
  let unavailable: string | null = null;
  for (const { finder, batch } of remotes) {
    // Remotely, the card's own landmark and its first stand-in only: on Pixabay, at most six searches a card.
    for (const subject of landmarks.slice(0, 2)) {
      const result = await finder.find({ province: item.province, region: item.name, ...subject }, batch);
      if (result.status === "found") return result;
      if (result.status === "unavailable") unavailable ??= result.reason;
    }
  }
  // A source that could not be asked does not let the others' "nothing" settle the card:
  // Wikimedia out of reach and Pixabay empty leaves it to be asked again on a later visit.
  return unavailable ? { status: "unavailable", reason: unavailable } : { status: "none" };
}

/**
 * A reopened card saved without a photo can use a newly added local photo. The caller
 * supplies a local provider: this read-time decoration never searches remotely or
 * changes the saved message, its photo rules, or cards still awaiting their first lookup.
 */
export async function withLocalRecommendationPhotos(
  presentation: DestinationRecommendationPresentation,
  photos: PlacePhotoProvider,
): Promise<DestinationRecommendationPresentation> {
  const shown = new Set(presentation.destinations.flatMap((item) => item.image ? [item.image.url] : []));
  const destinations: DestinationRecommendation[] = [];
  let changed = false;
  for (const item of presentation.destinations) {
    if (item.image !== null || item.province === null) {
      destinations.push(item);
      continue;
    }
    const result = await photoFor({ ...item, province: item.province }, photos, []);
    if (result.status !== "found" || shown.has(result.image.url)) {
      destinations.push(item);
      continue;
    }
    shown.add(result.image.url);
    destinations.push({ ...item, image: result.image });
    changed = true;
  }
  return changed ? { ...presentation, destinations } : presentation;
}

/**
 * Looks up the photo of every card that has none yet and reports each one the moment
 * it is known, so the browser can fill cards in as they arrive instead of waiting for
 * the slowest. The lookups all start at once; the provider's own queue spaces them out.
 *
 * Local photos are asked first (the bundled catalog, then photos downloaded earlier).
 * A card with a landmark the local ones lack may then be looked up remotely — on Wikidata
 * and Commons, then on Pixabay — its own landmark first and then its first stand-in. When
 * a source cannot be asked — the network, a rate limit, the per-set budget — and no other
 * finds a photo, the card gets no answer at all: it is not reported,
 * keeps what it had in the saved message, and is asked again on a later visit, instead
 * of being saved as having no photo. Every answer records the photo rules it was
 * decided under, so a card saved with none is looked up again only when the rules change.
 *
 * Two places under the same picture read as one place, so a photo already shown in
 * this set goes to whichever card got it first and a later card goes without — first
 * by arrival rather than by position, because a card's answer is final once it is sent.
 */
export async function findRecommendationPhotos(
  presentation: DestinationRecommendationPresentation,
  photos: PlacePhotoProvider,
  onPhoto: (photo: RecommendationPhoto) => void,
  remotes: readonly RemotePhotoFinder[] = [],
  onDeferred: (deferred: DeferredRecommendationPhoto) => void = () => undefined,
): Promise<DestinationRecommendationPresentation> {
  const shown = new Set(presentation.destinations.flatMap((item) => item.image ? [item.image.url] : []));
  const answers = new Map<string, PlaceImage | null>();
  const sources = remotes.map((finder) => ({ finder, batch: finder.startBatch() }));
  await Promise.all(recommendationsAwaitingPhoto(presentation).map(async (item) => {
    const result = await photoFor(item, photos, sources);
    if (result.status === "unavailable") {
      onDeferred({ id: item.id, reason: result.reason });
      return;
    }
    const found = result.status === "found" ? result.image : null;
    const image = found && !shown.has(found.url) ? found : null;
    if (image) shown.add(image.url);
    answers.set(item.id, image);
    onPhoto({ id: item.id, image });
  }));
  return {
    ...presentation,
    destinations: presentation.destinations.map((item) =>
      answers.has(item.id) ? { ...item, image: answers.get(item.id) ?? null, photoRules: placePhotoRulesVersion } : item),
  };
}
