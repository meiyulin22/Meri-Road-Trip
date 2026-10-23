import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PlaceImage } from "@/domain/location/place-image";

import type { PlacePhotoProvider, PlacePhotoQuery } from "./place-photo-provider";
import { photoFromCatalog, type PhotoCatalog } from "./photo-catalog";

const catalogFile = join(process.cwd(), "public", "photos", "photos.json");

/** Read once per process; the index only changes when the fetch script writes it. */
let cached: PhotoCatalog | null = null;

function load(): PhotoCatalog {
  if (cached !== null) return cached;
  try {
    const parsed: unknown = JSON.parse(readFileSync(catalogFile, "utf8"));
    cached = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as PhotoCatalog : {};
  } catch {
    // No index yet (or it is unreadable): every place simply has no photo.
    cached = {};
  }
  return cached;
}

/** The name to look up: a named spot's own words, or the region for a scenic card. */
function nameOf(query: PlacePhotoQuery): string {
  return query.kind === "named" ? query.keywords : query.region;
}

/**
 * Photos from the local catalog. No network, no provider, no quota: a miss is null, and the
 * card renders without an image. `findPhoto` never throws, as the port requires.
 */
export class CatalogPhotoProvider implements PlacePhotoProvider {
  async findPhoto(query: PlacePhotoQuery): Promise<PlaceImage | null> {
    return photoFromCatalog(load(), nameOf(query));
  }
}
