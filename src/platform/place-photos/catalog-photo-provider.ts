import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PlaceImage } from "@/domain/location/place-image";

import type { MediaPhotoStore } from "./media-photo-store";
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
 * Photos from the local catalog, then from the photos Meri already downloaded at run
 * time (media-photo-store.ts). No network, no provider, no quota: a miss is null, and
 * the lookup supplies no image. Only recommendation cards go on to search Pixabay, so
 * page renders, covers and chat replies never wait on a download. `findPhoto` never
 * throws, as the port requires.
 */
export class CatalogPhotoProvider implements PlacePhotoProvider {
  constructor(private readonly downloaded: MediaPhotoStore | null = null) {}

  /**
   * The catalog always wins. Then, for a named sight, the photo downloaded for that sight
   * in that region; for a 市 with no representative in the catalog, a photo downloaded
   * for any sight in it, captioned with the sight it really shows.
   */
  async findPhoto(query: PlacePhotoQuery): Promise<PlaceImage | null> {
    const bundled = photoFromCatalog(load(), query);
    if (bundled || !query.region || !this.downloaded) return bundled;
    try {
      return query.kind === "named"
        ? await this.downloaded.readLookup({ region: query.region, landmark: query.keywords })
        : await this.downloaded.readAnyForRegion(query.region);
    } catch {
      return null;
    }
  }
}
