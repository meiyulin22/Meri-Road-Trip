import { z } from "zod";

/**
 * A small photo of a catalog spot or dish (B1, 2026-11-27): a Wikimedia Commons file saved in
 * public/photos/catalog/, with the credit its licence asks for. It decorates the card; it is
 * never evidence of what the place is like now, and most entries have none.
 */
export type CatalogPhoto = {
  /** Our own copy: /photos/catalog/<catalog id>.avif. */
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly author: string;
  /** Short licence name: CC BY-SA 4.0, Public domain. */
  readonly license: string;
  readonly licenseUrl: string;
  /** The Commons file page. */
  readonly sourceUrl: string;
};

const httpsUrl = z.string().url().refine((value) => value.startsWith("https://"), "must be https");

export const catalogPhotoSchema: z.ZodType<CatalogPhoto> = z.strictObject({
  url: z.string().regex(/^\/photos\/catalog\/[a-z][a-z0-9_]*\.avif$/u),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  author: z.string().min(1),
  license: z.string().min(1),
  licenseUrl: httpsUrl,
  sourceUrl: httpsUrl.refine((value) => value.startsWith("https://commons.wikimedia.org/wiki/File:"), "must be a Commons file page"),
});
