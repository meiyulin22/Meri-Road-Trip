import type { PlaceImage } from "@/domain/location/place-image";
import { logger, logEvents } from "@/platform/observability/logger";

import { placePhotoHosts, type PlacePhotoProvider, type PlacePhotoQuery } from "./place-photo-provider";

const AMAP_POI_SEARCH_URL = "https://restapi.amap.com/v5/place/text";
/** 风景名胜;风景名胜;国家级景点 — checked 2026-10-03: the plain 风景名胜 type returned a
 * shopping centre for 云南省 and a memorial hall for 丽江市; this one returned 玉龙雪山,
 * 海螺沟 and 广济桥. */
const NATIONAL_SCENIC_TYPE = "110202";
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Amap lists most photo URLs as http, which an https page blocks. The same hosts serve
 * them over https (checked 2026-10-03), so the scheme is upgraded rather than proxied.
 */
function httpsPhotoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" && placePhotoHosts.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function firstPhoto(pois: readonly unknown[]): PlaceImage | null {
  for (const poi of pois) {
    if (!isRecord(poi) || typeof poi.name !== "string" || !Array.isArray(poi.photos)) continue;
    for (const photo of poi.photos) {
      const url = isRecord(photo) ? httpsPhotoUrl(photo.url) : null;
      if (url) return { url, caption: poi.name.trim().slice(0, 60) };
    }
  }
  return null;
}

export class AmapPlacePhotoProvider implements PlacePhotoProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async findPhoto(query: PlacePhotoQuery): Promise<PlaceImage | null> {
    const apiKey = process.env.AMAP_API_KEY?.trim();
    if (!apiKey) return null;
    const url = new URL(AMAP_POI_SEARCH_URL);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("show_fields", "photos");
    url.searchParams.set("page_size", "5");
    if (query.kind === "named") {
      url.searchParams.set("keywords", query.keywords);
    } else {
      url.searchParams.set("types", NATIONAL_SCENIC_TYPE);
    }
    const region = query.region;
    if (region) {
      url.searchParams.set("region", region);
      url.searchParams.set("city_limit", "true");
    }
    try {
      // A place's photo hardly changes, and every user asking about 玉龙雪山 asks the same
      // question: Next's data cache answers repeats for a week without calling Amap.
      const response = await this.fetcher(url, {
        next: { revalidate: SEVEN_DAYS_SECONDS },
        signal: AbortSignal.timeout(6_000),
      });
      if (!response.ok) return this.failed(query, "http_error");
      const body: unknown = await response.json();
      if (!isRecord(body) || body.status !== "1" || !Array.isArray(body.pois)) {
        return this.failed(query, "api_or_response_error");
      }
      return firstPhoto(body.pois);
    } catch {
      // Fetch errors may include the full URL (and key); log only a fixed reason.
      return this.failed(query, "network_or_response_error");
    }
  }

  private failed(query: PlacePhotoQuery, reason: string): null {
    logger.warn({ event: logEvents.placePhotoLookupFailed, queryKind: query.kind, reason },
      "Place photo lookup failed");
    return null;
  }
}
