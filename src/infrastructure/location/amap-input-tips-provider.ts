import type { LocationSuggestion } from "@/domain/location/location-suggestion";
import type {
  LocationSuggestionProvider,
  LocationSuggestionProviderResult,
} from "@/server/location/location-suggestion-service";

const AMAP_INPUT_TIPS_URL = "https://restapi.amap.com/v3/assistant/inputtips";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function coordinates(value: unknown): LocationSuggestion["coordinates"] {
  if (typeof value !== "string") return null;
  const parts = value.split(",");
  if (parts.length !== 2 || parts.some((part) => !/^-?\d+(?:\.\d+)?$/.test(part.trim()))) {
    return null;
  }

  const longitude = Number(parts[0]);
  const latitude = Number(parts[1]);
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    return null;
  }
  return { longitude, latitude, coordinateSystem: "GCJ-02" };
}

function toSuggestion(value: unknown): LocationSuggestion | null {
  if (!isRecord(value)) return null;
  const name = optionalText(value.name);
  if (name === null) return null;

  return {
    provider: "amap",
    providerId: optionalText(value.id),
    name,
    region: optionalText(value.district),
    adcode: optionalText(value.adcode),
    address: optionalText(value.address),
    coordinates: coordinates(value.location),
  };
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export class AmapInputTipsProvider implements LocationSuggestionProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async suggest(query: string): Promise<LocationSuggestionProviderResult> {
    const apiKey = process.env.AMAP_API_KEY?.trim();
    if (!apiKey) return { status: "failure", reason: "missing_configuration" };

    const url = new URL(AMAP_INPUT_TIPS_URL);
    url.searchParams.set("keywords", query);
    url.searchParams.set("key", apiKey);

    try {
      const response = await this.fetcher(url, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return { status: "failure", reason: "upstream_error" };

      const body: unknown = await response.json();
      if (!isRecord(body)) {
        return { status: "failure", reason: "malformed_response" };
      }
      if (body.status === "0" || body.status === 0) {
        return { status: "failure", reason: "upstream_error" };
      }
      if (body.status !== "1" && body.status !== 1) {
        return { status: "failure", reason: "malformed_response" };
      }
      if (!Array.isArray(body.tips)) {
        return { status: "failure", reason: "malformed_response" };
      }

      const suggestions = body.tips.map(toSuggestion)
        .filter((suggestion): suggestion is LocationSuggestion => suggestion !== null);
      const reportedCount = typeof body.count === "string" || typeof body.count === "number"
        ? Number(body.count) : 0;
      if (suggestions.length === 0 && (body.tips.length > 0 || reportedCount > 0)) {
        return { status: "failure", reason: "malformed_response" };
      }
      return { status: "success", suggestions };
    } catch (error) {
      // Fetch/JSON errors can include a request URL containing the key; never expose them.
      return { status: "failure", reason: isTimeout(error) ? "timeout" : "upstream_error" };
    }
  }
}
