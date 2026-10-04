import type { LocationCandidate, LocationKind } from "@/domain/location/location";
import type {
  LocationProvider,
  LocationSearchResult,
} from "@/platform/location-provider/location-provider";
import { withAmapLimits } from "@/platform/amap/amap-fetch";

const AMAP_POI_SEARCH_URL = "https://restapi.amap.com/v5/place/text";
const RESULT_LIMIT = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function coordinates(value: unknown): { longitude: number; latitude: number } | null {
  if (typeof value !== "string") return null;

  const parts = value.split(",");
  if (parts.length !== 2 || parts.some((part) => !/^-?\d+(?:\.\d+)?$/.test(part.trim()))) {
    return null;
  }

  const longitude = Number(parts[0]);
  const latitude = Number(parts[1]);
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) return null;

  return { longitude, latitude };
}

/**
 * Amap's category codes, of which a POI may carry several joined by "|": 11xxxx is
 * 风景名胜 (scenic areas, parks, temples, viewpoints) and 1401xx is 博物馆. Checked
 * 2026-10-04: 故宫博物院 is 110201|140100, 秦始皇兵马俑博物馆 140100, while its ticket
 * office is 070306, its car park 150904 and the bus stop named after it 150700.
 * 110105 城市广场 is filed under 风景名胜 but is a square, not somewhere to travel to:
 * 「潮汕」 found 潮汕站南广场, the forecourt of a railway station.
 */
function kindOf(typecode: unknown): LocationKind | undefined {
  if (typeof typecode !== "string" || typecode.trim() === "") return undefined;
  return typecode.split("|").some((code) =>
    (code.startsWith("11") && !code.startsWith("110105")) || code.startsWith("1401")) ? "sight" : "other";
}

function toCandidate(value: unknown): LocationCandidate | null {
  if (!isRecord(value)) return null;

  const providerId = optionalText(value.id);
  const name = optionalText(value.name);
  const point = coordinates(value.location);
  if (providerId === null || name === null || point === null) return null;

  // Amap repeats a level when it coincides with the one above (a municipality is
  // its own city), so the joined form drops duplicates while the levels keep them.
  const province = optionalText(value.pname);
  const city = optionalText(value.cityname);
  const district = optionalText(value.adname);
  const regionParts = [province, city, district].filter((part): part is string => part !== null);
  const kind = kindOf(value.typecode);

  return {
    providerId,
    name,
    province,
    city,
    district,
    region: [...new Set(regionParts)].join(" ") || null,
    address: optionalText(value.address),
    ...point,
    coordinateSystem: "GCJ-02",
    ...(kind ? { kind } : {}),
  };
}

export class AmapLocationProvider implements LocationProvider {
  private readonly fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = withAmapLimits(fetcher, { timeoutMs: 8_000 });
  }

  async searchByKeyword(query: string): Promise<LocationSearchResult> {
    const apiKey = process.env.AMAP_API_KEY?.trim();
    if (!apiKey) return { status: "failure", reason: "missing_configuration" };
    if (query.trim() === "") return { status: "failure", reason: "invalid_query" };

    const url = new URL(AMAP_POI_SEARCH_URL);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("keywords", query);
    url.searchParams.set("page_size", String(RESULT_LIMIT));
    url.searchParams.set("page_num", "1");

    try {
      const response = await this.fetcher(url, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) return { status: "failure", reason: "http_error" };

      const body: unknown = await response.json();
      if (!isRecord(body) || body.status !== "1" || !Array.isArray(body.pois)) {
        return { status: "failure", reason: "api_or_response_error" };
      }

      const candidates: LocationCandidate[] = [];
      for (const poi of body.pois.slice(0, RESULT_LIMIT)) {
        const candidate = toCandidate(poi);
        if (!candidate) continue;
        candidates.push(candidate);
      }

      if (body.pois.length > 0 && candidates.length === 0) {
        return { status: "failure", reason: "invalid_candidates" };
      }

      return { status: "success", candidates };
    } catch {
      // Fetch errors may include the full URL (and key); expose only a fixed reason.
      return { status: "failure", reason: "network_or_response_error" };
    }
  }
}
