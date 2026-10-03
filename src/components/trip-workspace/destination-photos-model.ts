import type { SelectedPlaceImage } from "@/capabilities/destination/place-images";
import { parsePlaceImage } from "@/domain/location/place-image";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** The places' photos as the server sees the Journey now; anything malformed is left out. */
export async function requestDestinationPhotos(
  tripId: string,
  fetcher: Fetcher = fetch,
): Promise<readonly SelectedPlaceImage[]> {
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/destination-photos`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Destination photos failed with ${response.status}.`);
  const body: unknown = await response.json();
  const photos = typeof body === "object" && body !== null && "photos" in body && Array.isArray(body.photos)
    ? body.photos : [];
  return photos.flatMap((item: unknown): SelectedPlaceImage[] => {
    if (typeof item !== "object" || item === null) return [];
    const { key, label, image } = item as Record<string, unknown>;
    const parsed = parsePlaceImage(image);
    return typeof key === "string" && typeof label === "string" && parsed ? [{ key, label, image: parsed }] : [];
  });
}

/** The thumbnail beside the title: the Journey's first place, so it changes only when that does. */
export function coverPhoto(photos: readonly SelectedPlaceImage[] | null): SelectedPlaceImage | null {
  return photos?.[0] ?? null;
}
