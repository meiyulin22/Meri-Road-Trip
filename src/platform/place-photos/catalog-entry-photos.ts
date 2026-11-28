import { z } from "zod";

import { type CatalogPhoto, catalogPhotoSchema } from "@/domain/catalog/catalog-photo";

import manifest from "./catalog-entry-photos.json";

/**
 * The photos of catalog spots and dishes, keyed by catalog id: the manifest written by
 * scripts/fetch-catalog-photos.ts (B1). It is checked once; an entry that does not pass
 * fails loudly rather than showing a photo without its credit.
 */
const manifestEntrySchema = z.strictObject({
  file: z.string(),
  width: z.number(),
  height: z.number(),
  title: z.string().min(1),
  author: z.string(),
  license: z.string(),
  licenseUrl: z.string(),
  sourceUrl: z.string(),
  wikidata: z.string().regex(/^Q[1-9]\d*$/u),
  fetchedAt: z.string(),
});

export function parseCatalogEntryPhotos(value: unknown): ReadonlyMap<string, CatalogPhoto> {
  const entries = z.record(z.string().regex(/^(?:spot|dish)_[a-z0-9_]+$/u), manifestEntrySchema).parse(value);
  return new Map(Object.entries(entries).map(([id, entry]) => {
    if (entry.file !== `/photos/catalog/${id}.avif`) {
      throw new Error(`Catalog photo ${id} points at ${entry.file}, not its own file.`);
    }
    const photo = catalogPhotoSchema.parse({
      url: entry.file,
      width: entry.width,
      height: entry.height,
      author: entry.author,
      license: entry.license,
      licenseUrl: entry.licenseUrl,
      sourceUrl: entry.sourceUrl,
    });
    return [id, photo];
  }));
}

let photos: ReadonlyMap<string, CatalogPhoto> | null = null;

/** The photo for a catalog entry, or null: most entries have none. */
export function catalogEntryPhoto(id: string): CatalogPhoto | null {
  photos ??= parseCatalogEntryPhotos(manifest);
  return photos.get(id) ?? null;
}
