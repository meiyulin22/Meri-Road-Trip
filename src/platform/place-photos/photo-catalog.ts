import type { PlaceImage } from "@/domain/location/place-image";

import type { PlacePhotoQuery } from "./place-photo-provider";

/**
 * The photos Meri ships with: one file per place under `public/photos/`, described by an
 * index written by `scripts/fetch-place-photos.ts`. Looking up a photo uses no external API.
 * The browser still downloads the file from our server. A missing match is ordinary.
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
  /** Explicit names for this same place, not nearby sights or administrative parents. */
  readonly aliases: readonly string[];
  /** Exact regions in which this named place may use the photo. No substring matching. */
  readonly regions: readonly string[];
  /** Administrative areas for which this is the explicitly chosen representative photo. */
  readonly scenicFor: readonly string[];
}

export type PhotoCatalog = Readonly<Record<string, CatalogEntry>>;

/** Parenthetical location qualifiers stay significant: 西湖(惠州) is not 西湖(杭州). */
export function normalizePlaceName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").trim();
}

function isNameList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((name) =>
    typeof name === "string" && normalizePlaceName(name) !== "");
}

/** Unconfigured downloads remain candidates: empty regions/scenicFor cannot match. */
export function parsePhotoCatalog(value: unknown): PhotoCatalog {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const catalog: Record<string, CatalogEntry> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (normalizePlaceName(name) === "" || name.length > 60 ||
      typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const { file, artist, pageUrl, fetchedAt, aliases, regions, scenicFor } = entry;
    if (typeof file !== "string" || !/^[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp|avif)$/u.test(file) ||
      typeof artist !== "string" || artist.trim() === "" || artist.length > 100 ||
      typeof pageUrl !== "string" || !pageUrl.startsWith("https://pixabay.com/") ||
      typeof fetchedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(fetchedAt) ||
      !isNameList(aliases) || !isNameList(regions) || !isNameList(scenicFor) ||
      !scenicFor.every((region) => includesName(regions, normalizePlaceName(region)))) continue;
    catalog[name] = { file, artist, pageUrl, fetchedAt, aliases, regions, scenicFor };
  }
  return catalog;
}

function includesName(names: readonly string[], value: string): boolean {
  return names.some((name) => normalizePlaceName(name) === value);
}

export function photoFromCatalog(catalog: PhotoCatalog, query: PlacePhotoQuery): PlaceImage | null {
  const region = normalizePlaceName(query.region ?? "");
  if (!region) return null;
  const matches = Object.entries(catalog).filter(([name, entry]) => {
    if (query.kind === "scenic") return includesName(entry.scenicFor, region);
    return includesName([name, ...entry.aliases], normalizePlaceName(query.keywords)) &&
      includesName(entry.regions, region);
  });
  // An accidental alias or representative collision must not pick by JSON order.
  if (matches.length !== 1) return null;
  const [name, entry] = matches[0];
  return {
    url: `/photos/${entry.file}`,
    caption: name.slice(0, 60),
    credit: `Photo: ${entry.artist} / Pixabay`,
  };
}
