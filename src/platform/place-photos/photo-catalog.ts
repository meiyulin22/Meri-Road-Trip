import type { PlaceImage } from "@/domain/location/place-image";

import type { PlacePhotoQuery } from "./place-photo-provider";

/**
 * The photos Meri ships with: one file per place under `public/photos/`, described by an
 * index written by `scripts/fetch-place-photos.ts` and `scripts/build-city-catalog.ts`.
 * Looking up a photo uses no external API. The browser still downloads the file from our
 * server. A missing match is ordinary.
 *
 * Photos come from Pixabay (its own licence, no attribution required — we credit anyway)
 * or from Wikimedia Commons (Creative Commons: author, licence with a link and the source
 * must be shown; cards name the licence and resizing and link to the Commons file page).
 */
export type CatalogSource = "pixabay" | "wikimedia";

export interface CatalogEntry {
  /** The file under public/photos, e.g. "potala-palace.jpg". */
  readonly file: string;
  /** Who took it, for the credit line. */
  readonly artist: string;
  /** The photographer's verified Pixabay profile, when its user ID was available. */
  readonly artistUrl?: string;
  /** The page it came from (a Pixabay photo page or a Commons file page), so the credit can link somewhere. */
  readonly pageUrl: string;
  /** Where it came from; absent is Pixabay, as every entry before 1.0632 was. */
  readonly source?: CatalogSource;
  /** The licence's short name, required for Commons: CC BY-SA 4.0, CC BY 3.0, CC0. */
  readonly license?: string;
  /** The licence's own page, required for Commons. */
  readonly licenseUrl?: string;
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

/** An optional profile must stay on Pixabay; an invalid one never hides a usable photo. */
export function parsePixabayArtistUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 500) return undefined;
  try {
    const url = new URL(value);
    return url.origin === "https://pixabay.com" && !url.username && !url.password && !url.search && !url.hash &&
      /^\/users\/[^/]+-[1-9]\d*\/$/u.test(url.pathname) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Unconfigured downloads remain candidates: empty regions/scenicFor cannot match. */
export function parsePhotoCatalog(value: unknown): PhotoCatalog {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const catalog: Record<string, CatalogEntry> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (normalizePlaceName(name) === "" || name.length > 60 ||
      typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const { file, artist, pageUrl, fetchedAt, aliases, regions, scenicFor, source, license, licenseUrl } = entry;
    const wikimedia = source === "wikimedia";
    if (!(source === undefined || source === "pixabay" || wikimedia)) continue;
    // A Commons photo is only usable with its licence shown and linked.
    if (wikimedia && (typeof license !== "string" || license.trim() === "" || license.length > 40 ||
      typeof licenseUrl !== "string" || !/^https:\/\/(?:creativecommons\.org|commons\.wikimedia\.org)\//u.test(licenseUrl))) continue;
    if (typeof file !== "string" || !/^[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp|avif)$/u.test(file) ||
      typeof artist !== "string" || artist.trim() === "" || artist.length > 100 ||
      typeof pageUrl !== "string" ||
      !pageUrl.startsWith(wikimedia ? "https://commons.wikimedia.org/wiki/File:" : "https://pixabay.com/") ||
      typeof fetchedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(fetchedAt) ||
      !isNameList(aliases) || !isNameList(regions) || !isNameList(scenicFor) ||
      !scenicFor.every((region) => includesName(regions, normalizePlaceName(region)))) continue;
    const artistUrl = wikimedia ? undefined : parsePixabayArtistUrl(entry.artistUrl);
    catalog[name] = { file, artist, pageUrl, fetchedAt, aliases, regions, scenicFor,
      ...(artistUrl ? { artistUrl } : {}),
      ...(wikimedia ? { source: "wikimedia" as const, license: license as string, licenseUrl: licenseUrl as string } : {}) };
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
    credit: catalogCredit(entry),
  };
}

/** The credit line a card shows: who, and from where under which licence. Kept within 120 characters. */
export function catalogCredit(entry: Pick<CatalogEntry, "artist" | "source" | "license">): string {
  const tail = entry.source === "wikimedia" ? ` / Wikimedia Commons, ${entry.license}` : " / Pixabay";
  const room = 120 - "Photo: ".length - tail.length;
  const artist = entry.artist.length > room ? `${entry.artist.slice(0, room - 1)}…` : entry.artist;
  return `Photo: ${artist}${tail}`;
}
