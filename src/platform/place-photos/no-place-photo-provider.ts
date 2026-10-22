import type { PlaceImage } from "@/domain/location/place-image";

import type { PlacePhotoProvider } from "./place-photo-provider";

/**
 * Tianditu has no photos of its own, and the source Meri used to borrow them from —
 * Wikimedia Commons, reached through Wikidata — cannot be reached from a server in
 * mainland China. Tianditu mode therefore offers no photo rather than a broken or a
 * mismatched one; a card without a photo is an ordinary case, drawn with a location mark.
 * Choosing a domestic photo source is still open, and only this adapter would change.
 */
export class NoPlacePhotoProvider implements PlacePhotoProvider {
  async findPhoto(): Promise<PlaceImage | null> {
    return null;
  }
}
