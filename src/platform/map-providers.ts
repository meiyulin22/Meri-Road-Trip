import type { LocationProvider } from "@/platform/location-provider/location-provider";
import type { LocationSuggestionProvider } from "@/platform/location-provider/location-suggestion-provider";
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
 * Meri verifies places with Tianditu, the free national map platform; Amap was removed in
 * 1.0702 (its free tier ends a year after sign-up and deployment needs a paid licence).
 * Records saved under Amap stay readable: the domain still knows its provider name.
 *
 * Tianditu has no photo API, so pages read photos from the catalog in `public/photos` and
 * from photos already downloaded at run time. A place in neither has no photo, and the card
 * shows no image — an ordinary case, not an error. Recommendation cards alone may go on to
 * Wikimedia and Pixabay (createRemotePhotoFinders).
 */
export const mapProviderName = "tianditu" as const;

export function createLocationProvider(): LocationProvider {
  return new TiandituLocationProvider();
}

export function createLocationSuggestionProvider(): LocationSuggestionProvider {
  return new TiandituInputTipsProvider();
}

export function createPlacePhotoProvider(): PlacePhotoProvider {
  return new CatalogPhotoProvider(mediaPhotoStoreFromEnvironment());
}

let remoteFinders: readonly RemotePhotoFinder[] | undefined;

/**
 * The remote fallbacks for recommendation cards, in the order they are
 * asked: Wikimedia (Wikidata's image of the landmark; needs no key), then Pixabay (with
 * PIXABAY_API_KEY). One of each per process, so their queues, shared in-flight lookups and
 * pauses hold across requests. Empty when there is no media directory to keep downloads in.
 */
export function createRemotePhotoFinders(): readonly RemotePhotoFinder[] {
  if (remoteFinders !== undefined) return remoteFinders;
  const key = process.env.PIXABAY_API_KEY?.trim();
  const store = mediaPhotoStoreFromEnvironment();
  if (!store) return remoteFinders = [];
  remoteFinders = [
    new WikimediaPhotoFinder({ client: new WikimediaClient(), store }),
    ...(key ? [new PixabayPhotoFinder({ client: new PixabayClient({ key }), store })] : []),
  ];
  return remoteFinders;
}
