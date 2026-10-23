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

/**
 * What a suggestion is worth typing for. Tianditu's suggestion payload carries only
 * name, address, gbCode and lonlat (2026-10-23) — no category and no popularity — so a
 * government office can only be recognised by its name, and a place outside China only by
 * an empty gbCode (the input 大 returns 大马士革). Real places whose name ends in an
 * administrative suffix come first: a village that shares a city's name is never what
 * someone typing that city means, and this is exactly the order the official site lacks.
 */
const governmentOffice = /(?:政府|人大|政协|法院|检察院|纪检委|党工委|党委|委|局|厅|办|部|所)$/u;
const administrativeArea = /(?:省|市|自治州|地区|盟|县|自治县|自治旗|区|旗)$/u;
/** 超市, 夜市 and 门市 end in 市 without being a city. */
const shopEnding = /(?:超市|夜市|门市|菜市|集市|花市)$/u;

function isAdministrativeArea(name: string): boolean {
  return administrativeArea.test(name) && !shopEnding.test(name);
}

function preferredSuggestions(suggestions: readonly LocationSuggestion[], query: string): LocationSuggestion[] {
  const usable = suggestions.filter((suggestion) => suggestion.adcode !== null && !governmentOffice.test(suggestion.name));
  // A word whose every suggestion is an office (丽江 returns its 市委 and its 水务局) must
  // still answer something: an empty list would read as "this place does not exist".
  if (usable.length === 0) return [...suggestions];
  const wanted = query.trim().length;
  // An administrative name is a place somebody can travel to and a village or a shop that
  // borrows the same words is not, so it comes first; then the shorter name, because 丽江古城
  // is the place while 丽江古城行政服务中心 merely contains it. Equal scores keep
  // Tianditu's own order.
  const score = (suggestion: LocationSuggestion) =>
    (isAdministrativeArea(suggestion.name) ? 0 : 100) + Math.min(Math.abs(suggestion.name.length - wanted), 99);
  return [...usable].sort((left, right) => score(left) - score(right));
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
    return { status: "success", suggestions: preferredSuggestions(suggestions, query) };
  }
}
