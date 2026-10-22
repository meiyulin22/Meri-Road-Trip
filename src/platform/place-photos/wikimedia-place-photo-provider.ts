import { createHash } from "node:crypto";

import type { PlaceImage } from "@/domain/location/place-image";
import { logger, logEvents } from "@/platform/observability/logger";
import { createTiandituClient, type TiandituClient } from "@/platform/tianditu/tianditu-fetch";
import {
  foundSight, namesTheSight, sharedWikidataSights, wikimediaGate, wikimediaHeaders, type FamousSight, type FamousSightFinder,
} from "@/platform/wikidata/wikidata-sights";

import { PlacePhotoMemory } from "./amap-place-photo-provider";
import type { PlacePhotoProvider, PlacePhotoQuery } from "./place-photo-provider";

const commonsApi = "https://commons.wikimedia.org/w/api.php";
/**
 * Commons serves thumbnails only at its standard widths (500 and 960 work, 640 answered
 * HTTP 400 on 2026-10-22); next/image scales this one down for each place it shows.
 */
const thumbnailWidth = 960;
/** Commons can thumbnail other formats, but these render as they are. */
const photoFile = /\.(jpe?g|png|webp)$/iu;
/** How many of a region's scenic places to weigh when looking for its best-known one. */
const scenicCandidates = 5;
/** Answers kept for a week in this server process, as the Amap photos are. */
const sharedMemory = new PlacePhotoMemory();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Commons serves thumbnails at a path built from the MD5 of the file name — a public,
 * stable scheme. Used only when the API answer carries no URL of its own.
 */
export function commonsThumbnailUrl(file: string, width = thumbnailWidth): string {
  const name = file.replaceAll(" ", "_");
  const hash = createHash("md5").update(name).digest("hex");
  const encoded = encodeURIComponent(name);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash[0]}/${hash.slice(0, 2)}/${encoded}/${width}px-${encoded}`;
}

/**
 * Commons' own https image hosts — thumbnails now come from thumb.wikimedia.org,
 * originals from upload.wikimedia.org — which next.config.ts lets next/image fetch.
 * The API tags each URL with utm_ parameters; the image is the same without them.
 */
const commonsImageHosts = new Set(["thumb.wikimedia.org", "upload.wikimedia.org"]);

function commonsImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !commonsImageHosts.has(url.hostname)) return null;
    for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return null;
  }
}

function plainText(html: unknown): string | null {
  if (typeof html !== "string") return null;
  const text = html.replace(/<[^>]+>/gu, "").replace(/\s+/gu, " ").trim();
  return text === "" ? null : text;
}

/**
 * Photos for Tianditu mode, which has none of its own: the Commons photo Wikidata
 * gives the famous sight of that name. Commons photos are openly licensed and the
 * licence asks for the author to be shown, so each carries a credit. A named place
 * uses that name; a region without one weighs its first few 风景名胜 from Tianditu and
 * shows the best-known one that has a photo. A wrong photo is worse than none, so a
 * name that does not name the sight (namesTheSight) gets none.
 */
export class WikimediaPlacePhotoProvider implements PlacePhotoProvider {
  constructor(
    private readonly sights: FamousSightFinder = sharedWikidataSights,
    private readonly tianditu: TiandituClient = createTiandituClient(fetch, { timeoutMs: 6_000 }),
    private readonly fetcher: typeof fetch = fetch,
    private readonly memory: PlacePhotoMemory = sharedMemory,
  ) {}

  async findPhoto(query: PlacePhotoQuery): Promise<PlaceImage | null> {
    const key = JSON.stringify(query);
    const remembered = this.memory.get(key);
    if (remembered) return remembered.photo;
    try {
      const sight = query.kind === "named" ? await this.namedSight(query.keywords) : await this.scenicSight(query.region);
      // Wikidata not answering is not "no photo"; ask again next time rather than remember it.
      if (sight === "unavailable") return null;
      const photo = sight ? await this.photoOf(sight) : null;
      this.memory.set(key, photo);
      return photo;
    } catch (error) {
      logger.warn({ event: logEvents.placePhotoLookupFailed, provider: "wikimedia", queryKind: query.kind,
        reason: error instanceof Error ? error.name : "unknown" }, "Place photo lookup failed");
      return null;
    }
  }

  private async namedSight(name: string): Promise<FamousSight | null | "unavailable"> {
    const lookup = await this.sights.findFamousSight(name);
    if (lookup.status === "unavailable") return "unavailable";
    const sight = foundSight(lookup);
    return sight && sight.image && namesTheSight(sight.label, name) ? sight : null;
  }

  private async scenicSight(region: string): Promise<FamousSight | null | "unavailable"> {
    const answer = await this.tianditu.get("/v2/search", {
      type: "query",
      postStr: JSON.stringify({ queryType: "13", start: "0", count: "10", specify: region,
        mapBound: "73,3,136,54", dataTypes: "风景名胜", show: "2" }),
    });
    if (!answer.ok || !Array.isArray(answer.body.pois)) return null;
    const names = [...new Set(answer.body.pois
      .map((poi: unknown) => (isRecord(poi) && typeof poi.name === "string" ? poi.name.trim() : ""))
      .filter((name: string) => name !== "" && !/[-－·(（]/u.test(name)))].slice(0, scenicCandidates);
    // One after another: each is a Wikidata lookup, and those go out one at a time anyway.
    const sights: FamousSight[] = [];
    for (const name of names) {
      const sight = await this.namedSight(name);
      if (sight === "unavailable") return "unavailable";
      if (sight) sights.push(sight);
    }
    return sights.sort((left, right) => right.editions - left.editions)[0] ?? null;
  }

  private async photoOf(sight: FamousSight): Promise<PlaceImage | null> {
    if (!sight.image || !photoFile.test(sight.image)) return null;
    // Commons answers the thumbnail's own URL at the width asked for, or the original
    // when the photo is narrower — a hand-built URL for a width it cannot make fails.
    const params = new URLSearchParams({
      action: "query", format: "json", prop: "imageinfo", iiprop: "extmetadata|url",
      iiurlwidth: String(thumbnailWidth), titles: `File:${sight.image}`,
    });
    const response = await wikimediaGate.run(() => this.fetcher(`${commonsApi}?${params}`, {
      headers: wikimediaHeaders(), signal: AbortSignal.timeout(4_000),
    }));
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const pages = isRecord(body) && isRecord(body.query) && isRecord(body.query.pages) ? Object.values(body.query.pages) : [];
    const info = pages.find(isRecord)?.imageinfo;
    const image = Array.isArray(info) && isRecord(info[0]) ? info[0] : {};
    const meta = isRecord(image.extmetadata) ? image.extmetadata : {};
    const field = (name: string) => (isRecord(meta[name]) ? plainText(meta[name].value) : null);
    const licence = field("LicenseShortName");
    // Without a licence to show, the photo cannot be shown with its credit.
    if (licence === null) return null;
    // The thumbnail, else the hand-built one; never the original, which can be 7,000 px wide.
    const url = commonsImageUrl(image.thumburl) ?? commonsThumbnailUrl(sight.image);
    const credit = [field("Artist")?.slice(0, 50), licence, "Wikimedia Commons"].filter(Boolean).join(" · ");
    return { url, caption: sight.label.slice(0, 60), credit: credit.slice(0, 120) };
  }
}
