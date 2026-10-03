import type { PlaceImage } from "@/domain/location/place-image";

/**
 * Either a named thing to look for — a spot the user named, or a recommendation's
 * landmark — or, with no name, a well-known scenic area inside `region`.
 */
export type PlacePhotoQuery =
  | { readonly kind: "named"; readonly keywords: string; readonly region: string | null }
  | { readonly kind: "scenic"; readonly region: string };

export interface PlacePhotoProvider {
  /** Never throws: no photo, or a provider that is down, is null. */
  findPhoto(query: PlacePhotoQuery): Promise<PlaceImage | null>;
}

/**
 * The hosts photos may come from. next.config.ts lets the image optimizer fetch only
 * these, so a URL from anywhere else would not render and is not offered.
 */
export const placePhotoHosts: readonly string[] = ["store.is.autonavi.com", "aos-comment.amap.com"];
