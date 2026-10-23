import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PlaceImage } from "@/domain/location/place-image";

import type { PlacePhotoProvider, PlacePhotoQuery } from "./place-photo-provider";
import { parsePhotoCatalog, photoFromCatalog, type PhotoCatalog } from "./photo-catalog";

const catalogFile = join(process.cwd(), "public", "photos", "photos.json");

/** Read once per process; the index only changes when the fetch script writes it. */
let cached: PhotoCatalog | null = null;

function load(): PhotoCatalog {
  if (cached !== null) return cached;
  try {
    const parsed: unknown = JSON.parse(readFileSync(catalogFile, "utf8"));
    cached = parsePhotoCatalog(parsed);
  } catch {
    // No index yet (or it is unreadable): every place simply has no photo.
    cached = {};
  }
  return cached;
}

/**
 * Photos from the local catalog. No network, no provider, no quota: a miss is null, and the
 * lookup supplies no image. `findPhoto` never throws, as the port requires.
 */
export class CatalogPhotoProvider implements PlacePhotoProvider {
  async findPhoto(query: PlacePhotoQuery): Promise<PlaceImage | null> {
    return photoFromCatalog(load(), query);
  }
}
