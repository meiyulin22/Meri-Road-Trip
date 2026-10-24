import { isLocationProviderName, type LocationProviderName } from "@/domain/location/location-suggestion";
import { AmapInputTipsProvider } from "@/platform/location-provider/amap-input-tips-provider";
import { AmapLocationProvider } from "@/platform/location-provider/amap-location-provider";
import type { LocationProvider } from "@/platform/location-provider/location-provider";
import type { LocationSuggestionProvider } from "@/platform/location-provider/location-suggestion-provider";
import { AmapPlacePhotoProvider } from "@/platform/place-photos/amap-place-photo-provider";
import { CatalogPhotoProvider } from "@/platform/place-photos/catalog-photo-provider";
import { mediaPhotoStoreFromEnvironment } from "@/platform/place-photos/media-photo-store";
import { PixabayClient } from "@/platform/place-photos/pixabay-client";
import { PixabayPhotoFinder } from "@/platform/place-photos/pixabay-photo-finder";
import type { RemotePhotoFinder } from "@/platform/place-photos/remote-photo-finder";
import { WikimediaClient } from "@/platform/place-photos/wikimedia-client";
import { WikimediaPhotoFinder } from "@/platform/place-photos/wikimedia-photo-finder";
import type { PlacePhotoProvider } from "@/platform/place-photos/place-photo-provider";
import { TiandituInputTipsProvider } from "@/platform/tianditu/tianditu-input-tips-provider";
import { TiandituLocationProvider } from "@/platform/tianditu/tianditu-location-provider";

/**
 * Which map provider the app verifies places with. Amap is the default and what the
 * product was built on; Tianditu is the free alternative, chosen with
 * MAP_PROVIDER=tianditu. Each provider brings its own place check and input tips, so one
 * Journey's points come from one source.
 *
 * Tianditu has no photo API, so its journeys read photos from the catalog in
 * `public/photos` (filled by `scripts/fetch-place-photos.ts`) and from photos already
 * downloaded at run time. A place in neither has no photo, and the card shows no image —
 * an ordinary case, not an error. Recommendation cards alone may go on to Wikimedia
 * and Pixabay (createRemotePhotoFinders).
 */
export function mapProviderName(environment: Readonly<Record<string, string | undefined>> = process.env): LocationProviderName {
  const value = environment.MAP_PROVIDER?.trim();
  if (!value) return "amap";
  if (isLocationProviderName(value)) return value;
  throw new Error(`MAP_PROVIDER must be "amap" or "tianditu"; it is "${value}".`);
}

export function createLocationProvider(): LocationProvider {
  return mapProviderName() === "tianditu" ? new TiandituLocationProvider() : new AmapLocationProvider();
}

export function createLocationSuggestionProvider(): LocationSuggestionProvider {
  return mapProviderName() === "tianditu" ? new TiandituInputTipsProvider() : new AmapInputTipsProvider();
}

export function createPlacePhotoProvider(): PlacePhotoProvider {
  return mapProviderName() === "tianditu"
    ? new CatalogPhotoProvider(mediaPhotoStoreFromEnvironment()) : new AmapPlacePhotoProvider();
}

let remoteFinders: readonly RemotePhotoFinder[] | undefined;

/**
 * The remote fallbacks for recommendation cards in Tianditu mode, in the order they are
 * asked: Wikimedia (Wikidata's image of the landmark; needs no key), then Pixabay (with
 * PIXABAY_API_KEY). One of each per process, so their queues, shared in-flight lookups and
 * pauses hold across requests. Empty when Amap supplies photos or there is no media
 * directory to keep downloads in.
 */
export function createRemotePhotoFinders(): readonly RemotePhotoFinder[] {
  if (remoteFinders !== undefined) return remoteFinders;
  const key = process.env.PIXABAY_API_KEY?.trim();
  const store = mediaPhotoStoreFromEnvironment();
  if (mapProviderName() !== "tianditu" || !store) return remoteFinders = [];
  remoteFinders = [
    new WikimediaPhotoFinder({ client: new WikimediaClient(), store }),
    ...(key ? [new PixabayPhotoFinder({ client: new PixabayClient({ key }), store })] : []),
  ];
  return remoteFinders;
}
