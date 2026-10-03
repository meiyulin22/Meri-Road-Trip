import type { PlaceImage } from "@/domain/location/place-image";
import type { DestinationChoicesPresentation, TripMessage } from "@/domain/trip-message/trip-message";
import type { DestinationArea } from "@/domain/trip-state/destination-areas";
import type { PlacePhotoProvider, PlacePhotoQuery } from "@/platform/place-photos/place-photo-provider";

/**
 * What a photo should show for one place. A 市's own photo is the provider's least
 * reliable answer (丽江市's first one was a stage show), so the most specific thing
 * the user or Meri named wins: the spot they asked for, then a recommendation's
 * landmark, then a national scenic area inside the 市, then one inside the province.
 */
export interface PhotoSubject {
  readonly province: string;
  readonly place: string | null;
  readonly spot: string | null;
  readonly landmark?: string | null;
}

/**
 * The lookups to try, most specific first. A spot that is itself an administrative
 * name — a county-level city kept under its 州, 香格里拉市 or 大理市 — is a region,
 * not a sight: its own photo is the town's least telling one, while a national scenic
 * area inside it (普达措, 大理古城) shows why anyone goes.
 */
export function photoQueriesFor(subject: PhotoSubject): readonly PlacePhotoQuery[] {
  const queries: PlacePhotoQuery[] = [];
  const area = subject.place ?? subject.province;
  if (subject.spot && /(?:市|县|区|旗)$/u.test(subject.spot)) {
    queries.push({ kind: "scenic", region: subject.spot });
  } else if (subject.spot ?? subject.landmark) {
    queries.push({ kind: "named", keywords: (subject.spot ?? subject.landmark) as string, region: area });
  }
  queries.push({ kind: "scenic", region: area });
  if (subject.place) queries.push({ kind: "scenic", region: subject.province });
  return queries;
}

export async function findPlaceImage(subject: PhotoSubject, photos: PlacePhotoProvider): Promise<PlaceImage | null> {
  for (const query of photoQueriesFor(subject)) {
    const image = await photos.findPhoto(query);
    if (image) return image;
  }
  return null;
}

/** Adds a photo to each offered place; a place without one is offered as before. */
export async function withChoiceImages(
  presentation: DestinationChoicesPresentation,
  photos: PlacePhotoProvider,
): Promise<DestinationChoicesPresentation> {
  const choices = await Promise.all(presentation.choices.map(async (choice) => {
    const image = await findPlaceImage({ province: choice.province, place: choice.city ?? null,
      spot: choice.spot ?? null }, photos);
    return image ? { ...choice, image } : choice;
  }));
  return { ...presentation, choices };
}

/** One photo for one chosen place, in the order the destination lists them. */
export interface SelectedPlaceImage {
  readonly key: string;
  readonly label: string;
  readonly image: PlaceImage;
}

/** The ring around the globe holds this many; past it a photo is too small to read. */
export const maxSelectedPlaceImages = 8;

function photoKey(province: string, place: string | null, spot: string | null): string {
  return [province, place, spot].filter((part) => part !== null).join("/");
}

/**
 * The photo each card in the conversation showed, by the place it showed. A place the
 * user picked from a card keeps that card's photo in the Journey column: looking it up
 * again would answer from the 市's scenic areas, and 丽江市 picked under a 玉龙雪山
 * photo would come back as 玉水寨. Later cards win.
 */
export function imagesShownInConversation(messages: readonly TripMessage[]): ReadonlyMap<string, PlaceImage> {
  const shown = new Map<string, PlaceImage>();
  for (const message of messages) {
    const presentation = message.presentation;
    if (presentation?.type === "destination_choices") {
      for (const choice of presentation.choices) {
        if (choice.image) shown.set(photoKey(choice.province, choice.city ?? null, choice.spot ?? null), choice.image);
      }
    } else if (presentation?.type === "destination_recommendations") {
      for (const item of presentation.destinations) {
        if (item.image && item.province) shown.set(photoKey(item.province, item.name, null), item.image);
      }
    }
  }
  return shown;
}

/**
 * Photos for the places in the Journey, looked up from the destination as it is now,
 * so a removed place loses its photo with it and nothing about pictures is stored in
 * TripState. A 市 shows its first spot when the user named one, and a place shows the
 * photo its card showed when there was one.
 */
export async function selectedPlaceImages(
  areas: readonly DestinationArea[],
  photos: PlacePhotoProvider,
  shown: ReadonlyMap<string, PlaceImage> = new Map(),
): Promise<readonly SelectedPlaceImage[]> {
  const subjects = areas.flatMap((area): { key: string; label: string; subject: PhotoSubject }[] => area.places.length === 0
    ? [{ key: area.province, label: area.province, subject: { province: area.province, place: null, spot: null } }]
    : area.places.map((place) => ({ key: `${area.province}/${place.name}`, label: place.name,
      subject: { province: area.province, place: place.name, spot: place.spots[0] ?? null } })))
    .slice(0, maxSelectedPlaceImages);
  const found = await Promise.all(subjects.map(async ({ key, label, subject }) => {
    const image = shown.get(photoKey(subject.province, subject.place, subject.spot)) ??
      await findPlaceImage(subject, photos);
    return image ? { key, label, image } : null;
  }));
  return found.filter((item): item is SelectedPlaceImage => item !== null);
}
