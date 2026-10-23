import { isLocationProviderName, type LocationProviderName } from "@/domain/location/location-suggestion";
import { AmapInputTipsProvider } from "@/platform/location-provider/amap-input-tips-provider";
import { AmapLocationProvider } from "@/platform/location-provider/amap-location-provider";
import type { LocationProvider } from "@/platform/location-provider/location-provider";
import type { LocationSuggestionProvider } from "@/platform/location-provider/location-suggestion-provider";
import { AmapPlacePhotoProvider } from "@/platform/place-photos/amap-place-photo-provider";
import { CatalogPhotoProvider } from "@/platform/place-photos/catalog-photo-provider";
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
 * `public/photos` (filled by `scripts/fetch-place-photos.ts`). A place that is not in the
 * catalog has no photo, and the card shows no image — an ordinary case, not an error.
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
  return mapProviderName() === "tianditu" ? new CatalogPhotoProvider() : new AmapPlacePhotoProvider();
}
