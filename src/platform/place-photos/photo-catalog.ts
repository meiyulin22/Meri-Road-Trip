import type { PlaceImage } from "@/domain/location/place-image";

/**
 * The photos Meri ships with: one file per place under `public/photos/`, described by an
 * index written by `scripts/fetch-place-photos.ts`. Photos are read from disk by the static
 * file server, so a card with a photo costs no network call, no API quota and no等待.
 *
 * A place that is not in the index simply has no photo — the card shows no image, which is
 * an ordinary case, not an error.
 */
export interface CatalogEntry {
  /** The file under public/photos, e.g. "potala-palace.jpg". */
  readonly file: string;
  /** Who took it, for the credit line. */
  readonly artist: string;
  /** The Pixabay page it came from, so the credit can link somewhere. */
  readonly pageUrl: string;
  /** When it was fetched, for the operator's sake. */
  readonly fetchedAt: string;
}

export type PhotoCatalog = Readonly<Record<string, CatalogEntry>>;

/** Names are compared after this: full-width to half, no spaces, no brackets. */
export function normalizePlaceName(value: string): string {
  return value.normalize("NFKC").replace(/[（(][^）)]*[）)]/gu, "").replace(/\s+/gu, "").trim();
}

export function photoFromCatalog(catalog: PhotoCatalog, name: string): PlaceImage | null {
  const entry = catalog[normalizePlaceName(name)];
  if (!entry) return null;
  return {
    url: `/photos/${entry.file}`,
    caption: name.slice(0, 60),
    credit: `Photo: ${entry.artist} / Pixabay`,
  };
}
