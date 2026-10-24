import type { PlaceImage } from "@/domain/location/place-image";

import type { RemotePhotoSubject } from "./pixabay-photo-match";

export type { RemotePhotoSubject } from "./pixabay-photo-match";

/**
 * A remote lookup has three answers, and only two of them are final. "none" — the source
 * was asked and nothing fits — may be saved on the card; "unavailable" — it could not be
 * asked, or the file could not be fetched or kept — must not be, or a moment's network
 * trouble would leave the card without a photo forever.
 */
export type RemotePhotoResult =
  | { readonly status: "found"; readonly image: PlaceImage }
  | { readonly status: "none" }
  | { readonly status: "unavailable"; readonly reason: string };

/**
 * One remote photo source (Wikimedia, Pixabay). A set of cards starts one batch per
 * source — what that set may spend there — and every card in the set shares it.
 */
export interface RemotePhotoFinder<Batch = unknown> {
  startBatch(): Batch;
  find(subject: RemotePhotoSubject, batch: Batch): Promise<RemotePhotoResult>;
}
