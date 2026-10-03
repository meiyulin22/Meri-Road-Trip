import type { PlaceImage } from "@/domain/location/place-image";
import { withAmapLimits } from "@/platform/amap/amap-fetch";
import { logger, logEvents } from "@/platform/observability/logger";

import { placePhotoHosts, type PlacePhotoProvider, type PlacePhotoQuery } from "./place-photo-provider";

const AMAP_POI_SEARCH_URL = "https://restapi.amap.com/v5/place/text";
/** 风景名胜;风景名胜;国家级景点 — checked 2026-10-03: the plain 风景名胜 type returned a
 * shopping centre for 云南省 and a memorial hall for 丽江市; this one returned 玉龙雪山,
 * 海螺沟 and 广济桥. */
const NATIONAL_SCENIC_TYPE = "110202";
const SEVEN_DAYS_MS = 60 * 60 * 24 * 7 * 1000;
const MAX_CACHED = 500;

/**
 * Answers Amap gave, kept for a week in this server process. Only real answers are
 * kept — a photo, or a genuine "no photo here" — never a refusal or an outage: Next's
 * fetch cache keys on HTTP status, and Amap refuses with HTTP 200, so it would have
 * remembered "rate limited" as the answer for a week. Per process on purpose: a
 * single long-running server (the VPS) keeps it; a short-lived serverless instance
 * mostly misses, which costs one lookup, and card photos are stored with the card.
 */
export class PlacePhotoMemory {
  private readonly entries = new Map<string, { readonly photo: PlaceImage | null; readonly expires: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  get(key: string): { readonly photo: PlaceImage | null } | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, photo: PlaceImage | null): void {
    this.entries.delete(key);
    this.entries.set(key, { photo, expires: this.now() + SEVEN_DAYS_MS });
    // A Map keeps insertion order, so the first key is the oldest answer.
    if (this.entries.size > MAX_CACHED) this.entries.delete(this.entries.keys().next().value as string);
  }
}

const sharedMemory = new PlacePhotoMemory();

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
  private readonly fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch, private readonly memory: PlacePhotoMemory = sharedMemory) {
    this.fetcher = withAmapLimits(fetcher);
  }

  async findPhoto(query: PlacePhotoQuery): Promise<PlaceImage | null> {
    const apiKey = process.env.AMAP_API_KEY?.trim();
    if (!apiKey) return null;
    const key = JSON.stringify(query);
    const remembered = this.memory.get(key);
    if (remembered) return remembered.photo;
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
      const response = await this.fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(6_000) });
      if (!response.ok) return this.failed(query, "http_error");
      const body: unknown = await response.json();
      if (!isRecord(body) || body.status !== "1" || !Array.isArray(body.pois)) {
        return this.failed(query, "api_or_response_error",
          isRecord(body) && typeof body.infocode === "string" ? body.infocode : undefined);
      }
      const photo = firstPhoto(body.pois);
      this.memory.set(key, photo);
      return photo;
    } catch {
      // Fetch errors may include the full URL (and key); log only a fixed reason.
      return this.failed(query, "network_or_response_error");
    }
  }

  private failed(query: PlacePhotoQuery, reason: string, infocode?: string): null {
    logger.warn({ event: logEvents.placePhotoLookupFailed, queryKind: query.kind, reason, ...(infocode ? { infocode } : {}) },
      "Place photo lookup failed");
    return null;
  }
}
