import type { PhotoSubject } from "@/capabilities/destination/place-images";
import type { PlaceImage } from "@/domain/location/place-image";
import type { PlanDay } from "@/domain/plan/plan-draft";

export type FindDayImage = (subject: PhotoSubject) => Promise<PlaceImage | null>;

/**
 * One photo per day: a stop of that day first, then its city, never a photo an earlier day
 * already shows. A day with nothing new goes without a photo rather than repeat one (1.2103:
 * two 大理 days both showed 洱海). Each photo is reported as soon as it is chosen.
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
    let image: PlaceImage | null = null;
    for (const subject of subjects) {
      const found = await findImage(subject);
      if (found && !used.has(found.url)) {
        image = found;
        break;
      }
    }
    if (!image) continue;
    used.add(image.url);
    photos.push({ day: day.day, image });
    onPhoto({ day: day.day, image });
  }
  return photos;
}
