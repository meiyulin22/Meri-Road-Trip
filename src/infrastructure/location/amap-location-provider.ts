import type { LocationCandidate } from "@/domain/location/location";
import type {
  LocationProvider,
  LocationSearchResult,
} from "@/server/location/location-service";

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

function toCandidate(value: unknown): LocationCandidate | null {
  if (!isRecord(value)) return null;

  const providerId = optionalText(value.id);
  const name = optionalText(value.name);
  const point = coordinates(value.location);
  if (providerId === null || name === null || point === null) return null;

  const regionParts = [value.pname, value.cityname, value.adname]
    .map(optionalText)
    .filter((part): part is string => part !== null);

  return {
    providerId,
    name,
    region: [...new Set(regionParts)].join(" ") || null,
    address: optionalText(value.address),
    ...point,
    coordinateSystem: "GCJ-02",
  };
}

export class AmapLocationProvider implements LocationProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

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
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return { status: "failure", reason: "http_error" };

      const body: unknown = await response.json();
      if (!isRecord(body) || body.status !== "1" || !Array.isArray(body.pois)) {
        return { status: "failure", reason: "api_or_response_error" };
      }

      const candidates = body.pois.slice(0, RESULT_LIMIT)
        .map(toCandidate)
        .filter((candidate): candidate is LocationCandidate => candidate !== null);

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
