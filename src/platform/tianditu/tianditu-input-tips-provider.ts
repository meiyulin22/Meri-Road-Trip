import type { LocationSuggestion } from "@/domain/location/location-suggestion";
import type {
  LocationSuggestionProvider,
  LocationSuggestionProviderResult,
} from "@/platform/location-provider/location-suggestion-provider";

import { createTiandituClient, type TiandituClient } from "./tianditu-fetch";
import { tiandituPoint } from "./tianditu-location-provider";

const chinaBound = "73,3,136,54";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Tianditu's 9-digit gbCode is the country code 156 in front of the six-digit
 * administrative code Amap calls adcode: 156530702 is 530702, 古城区.
 */
function adcode(gbCode: unknown): string | null {
  const code = String(gbCode ?? "");
  return /^156\d{6}$/u.test(code) ? code.slice(3) : null;
}

/** A suggestion names its administrative area in `address` (云南省丽江市古城区); it has no street address and no ID. */
export function suggestionFromTianditu(value: unknown): LocationSuggestion | null {
  if (!isRecord(value)) return null;
  const name = optionalText(value.name);
  if (name === null) return null;
  const point = tiandituPoint(value.lonlat);
  return {
    provider: "tianditu",
    providerId: null,
    name,
    region: optionalText(value.address),
    adcode: adcode(value.gbCode),
    address: null,
    coordinates: point ? { ...point, coordinateSystem: "CGCS2000" } : null,
  };
}

/** The editor's search-as-you-type, from Tianditu's suggestion search (queryType 4). */
export class TiandituInputTipsProvider implements LocationSuggestionProvider {
  constructor(private readonly client: TiandituClient = createTiandituClient(fetch, { timeoutMs: 6_000 })) {}

  async suggest(query: string): Promise<LocationSuggestionProviderResult> {
    const answer = await this.client.get("/v2/search", {
      type: "query",
      postStr: JSON.stringify({ keyWord: query.trim(), queryType: "4", start: "0", count: "10", level: "12", mapBound: chinaBound }),
    });
    if (!answer.ok) {
      if (answer.reason === "missing_configuration") return { status: "failure", reason: "missing_configuration" };
      if (answer.reason === "timeout") return { status: "failure", reason: "timeout" };
      if (answer.reason === "malformed_response") return { status: "failure", reason: "malformed_response" };
      return { status: "failure", reason: "upstream_error" };
    }
    // A word with no suggestions comes back without a `suggests` list at all.
    if (answer.body.suggests === undefined) return { status: "success", suggestions: [] };
    if (!Array.isArray(answer.body.suggests)) return { status: "failure", reason: "malformed_response" };
    const suggestions = answer.body.suggests.map(suggestionFromTianditu)
      .filter((suggestion): suggestion is LocationSuggestion => suggestion !== null);
    if (suggestions.length === 0 && answer.body.suggests.length > 0) return { status: "failure", reason: "malformed_response" };
    return { status: "success", suggestions };
  }
}
