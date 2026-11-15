import type { PhotoSubject } from "@/capabilities/destination/place-images";
import type { PlaceImage } from "@/domain/location/place-image";
import type { PlanDay } from "@/domain/plan/plan-draft";

export type FindDayImage = (subject: PhotoSubject) => Promise<PlaceImage | null>;

/**
 * One photo per day: a stop of that day first, then its city, preferring a photo no
 * earlier day shows. Two days in one city may share the city's photo rather than go
 * without one. Each photo is reported as soon as it is chosen.
 */
export async function dayPhotos(
  days: readonly PlanDay[],
  nameOf: (spotId: string) => string | null,
  findImage: FindDayImage,
  onPhoto: (photo: { day: number; image: PlaceImage }) => void = () => {},
): Promise<{ day: number; image: PlaceImage }[]> {
  const used = new Set<string>();
  const photos: { day: number; image: PlaceImage }[] = [];
  for (const day of days) {
    const subjects: PhotoSubject[] = [
      ...day.stops.flatMap(({ spotId }) => {
        const spot = nameOf(spotId);
        return spot ? [{ province: day.province, place: day.city, spot }] : [];
      }),
      { province: day.province, place: day.city, spot: null },
    ];
    let fallback: PlaceImage | null = null;
    let chosen: PlaceImage | null = null;
    for (const subject of subjects) {
      const image = await findImage(subject);
      if (!image) continue;
      fallback ??= image;
      if (!used.has(image.url)) {
        chosen = image;
        break;
      }
    }
    const image = chosen ?? fallback;
    if (!image) continue;
    used.add(image.url);
    photos.push({ day: day.day, image });
    onPhoto({ day: day.day, image });
  }
  return photos;
}
