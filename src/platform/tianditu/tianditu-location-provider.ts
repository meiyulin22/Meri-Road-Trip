import type { LocationCandidate, LocationKind } from "@/domain/location/location";
import type { LocationProvider, LocationSearchResult } from "@/platform/location-provider/location-provider";

import { createTiandituClient, type TiandituAnswer, type TiandituClient } from "./tianditu-fetch";

/** As many as the Amap adapter hands to Meri's rules, so both are judged on the same page. */
const resultLimit = 5;
/**
 * Tianditu ranks by text, so the scenic area a traveller means is often far down the
 * page: 甘孜州稻城亚丁景区 came 20th for 稻城亚丁, 洪崖洞民俗风貌区 21st for 洪崖洞. A page
 * of 30 is read so that such a whole place can be moved up.
 */
const pageSize = "30";
const chinaBound = "73,3,136,54";
/** 直辖市 are their own province and their own 市; Tianditu leaves the 市 empty for them. */
const municipalities = new Set(["北京市", "天津市", "上海市", "重庆市"]);

/**
 * Tianditu's own category codes, as seen on 2026-10-22: 1803xx parks and zoos, 1804xx
 * 风景名胜, 1602xx museums, 2602xx mountains and gorges, 2603xx rivers and lakes,
 * 2608xx islands. Everything else — restaurants 11xxxx, governments 19xxxx, ticket
 * offices 2103xx, place names 2601xx (villages, districts) — is not somewhere to go.
 */
export function tiandituKind(typeCode: unknown): LocationKind | undefined {
  if (typeof typeCode !== "string" || typeCode.trim() === "") return undefined;
  return /^(1803|1804|1602|2602|2603|2608)/u.test(typeCode) ? "sight" : "other";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim();
}

/**
 * Names that are the whole place rather than a part of it: 苍山世界地质公园 is 苍山, while
 * 苍山中和索道 and 苍山第一峰 — filed as 风景名胜 too — are things inside it.
 */
const wholePlaceSuffix = /(?:风景名胜区|风景区|景区|旅游区|风貌区|国家公园|地质公园|森林公园|公园|古城|古镇)$/u;

/** Tianditu writes points as "lon,lat"; anything else is not a point. */
export function tiandituPoint(value: unknown): { longitude: number; latitude: number } | null {
  if (typeof value !== "string") return null;
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 2 || parts.some((part) => !/^-?\d+(?:\.\d+)?$/u.test(part))) return null;
  const [longitude, latitude] = parts.map(Number);
  if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;
  return { longitude, latitude };
}

interface Levels {
  readonly province: string | null;
  readonly city: string | null;
  readonly district: string | null;
}

const noLevels: Levels = { province: null, city: null, district: null };

function withMunicipality(levels: Levels): Levels {
  return levels.city === null && levels.province !== null && municipalities.has(levels.province)
    ? { ...levels, city: levels.province } : levels;
}

function candidate(
  fields: { providerId: string; name: string; address: string | null; longitude: number; latitude: number; kind?: LocationKind },
  levels: Levels,
): LocationCandidate {
  const { province, city, district } = withMunicipality(levels);
  const regionParts = [province, city, district].filter((part): part is string => part !== null);
  return {
    providerId: fields.providerId, name: fields.name, province, city, district,
    region: [...new Set(regionParts)].join(" ") || null,
    address: fields.address, longitude: fields.longitude, latitude: fields.latitude,
    coordinateSystem: "CGCS2000",
    ...(fields.kind ? { kind: fields.kind } : {}),
  };
}

/** A detailed POI (`show: "2"`) carries its own province, city and county. */
export function candidateFromPoi(poi: unknown): LocationCandidate | null {
  if (!isRecord(poi)) return null;
  const providerId = optionalText(poi.hotPointID);
  const name = optionalText(poi.name);
  const point = tiandituPoint(poi.lonlat);
  if (providerId === null || name === null || point === null) return null;
  // A scenic area is somewhere to go whatever Tianditu files it under: 黄山风景区 is a
  // 区县级地名 there, and without it 黄山 could only be 黄山市.
  const kind = wholePlaceSuffix.test(name) ? "sight" : tiandituKind(poi.typeCode);
  return candidate({ providerId, name, address: optionalText(poi.address), ...point, kind }, {
    province: optionalText(poi.province), city: optionalText(poi.city), district: optionalText(poi.county),
  });
}

/**
 * An administrative answer — Tianditu's own reply to 云南 or 丽江 — names only itself;
 * the levels above it come from reverse geocoding its centre. The 9-digit code says
 * which level it is: 156530000 a province, 156530700 a 市, 156530702 a district.
 */
export function candidateFromArea(area: Record<string, unknown>, around: Levels): LocationCandidate | null {
  const name = optionalText(area.name);
  const point = tiandituPoint(area.lonlat);
  const code = String(area.adminCode ?? "");
  if (name === null || point === null || !/^156\d{6}$/u.test(code)) return null;
  const isProvince = code.endsWith("0000");
  const isCity = !isProvince && code.endsWith("00");
  const levels: Levels = isProvince ? { province: name, city: null, district: null }
    : isCity ? { province: around.province, city: name, district: null }
      : { province: around.province, city: around.city, district: name };
  return candidate({ providerId: `area:${code}`, name, address: null, ...point, kind: "other" }, levels);
}

function rank(name: string, words: string): number {
  if (name === words) return 0;
  if (wholePlaceSuffix.test(name)) return 1;
  return 2;
}

/**
 * Sights that are the whole place the user named — the words themselves, or the words
 * inside a scenic area's or park's name — move ahead of the rest of Tianditu's page.
 * Once there is one, the shops and restaurants that borrowed its name (three 洪崖洞
 * restaurants outside 重庆 led Tianditu's page) are dropped: Amap never ranks those
 * first, and Meri's rules would take them for real places of that name.
 */
export function wholePlacesFirst(query: string, found: readonly LocationCandidate[]): LocationCandidate[] {
  const words = normalize(query);
  const isWholePlace = (place: LocationCandidate) => {
    const name = normalize(place.name);
    return place.kind === "sight" && name.includes(words) && !/[-－·(（]/u.test(name) && rank(name, words) < 2;
  };
  const wholePlaces = found.filter(isWholePlace);
  if (wholePlaces.length === 0) return [...found];
  return [...wholePlaces, ...found.filter((place) => !isWholePlace(place) && place.kind === "sight")];
}

function failure(answer: Extract<TiandituAnswer, { ok: false }>): LocationSearchResult {
  if (answer.reason === "missing_configuration") return { status: "failure", reason: "missing_configuration" };
  if (answer.reason === "http_error") return { status: "failure", reason: "http_error" };
  if (answer.reason === "malformed_response") return { status: "failure", reason: "api_or_response_error" };
  return { status: "failure", reason: "network_or_response_error" };
}

function withoutRepeats(candidates: readonly LocationCandidate[]): LocationCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((place) => {
    if (seen.has(place.providerId)) return false;
    seen.add(place.providerId);
    return true;
  });
}

/**
 * Meri's place check on Tianditu, the national map platform: free, and its provinces
 * and 市 are exact, but it ranks same-named places by text alone — 苍山 leads with the
 * village in 广西, not the mountain in 大理 — and it offers no popularity signal to put
 * the famous one first. wholePlacesFirst is all the ordering Meri adds. A Wikidata
 * lookup filled that gap until 2026-10-23, when it was removed: a server in mainland
 * China cannot reach Wikidata, so the step only ever helped a developer's machine.
 * Everything after the provider is Amap's flow unchanged: one page, the same rules,
 * the same confirmation before a place is saved.
 */
export class TiandituLocationProvider implements LocationProvider {
  constructor(private readonly client: TiandituClient = createTiandituClient()) {}

  async searchByKeyword(query: string): Promise<LocationSearchResult> {
    const words = normalize(query);
    if (words === "") return { status: "failure", reason: "invalid_query" };
    const search = await this.client.get("/v2/search", {
      type: "query",
      postStr: JSON.stringify({ keyWord: words, queryType: "1", start: "0", count: pageSize, level: "12", mapBound: chinaBound, show: "2" }),
    });
    if (!search.ok) return failure(search);
    const status = isRecord(search.body.status) ? search.body.status.infocode : undefined;
    // 3001 is Tianditu's "no data found": an answer, not an outage.
    if (status === 3001) return { status: "success", candidates: [] };
    if (status !== 1000) return { status: "failure", reason: "api_or_response_error" };

    const found = await this.found(search.body);
    if (found === null) return { status: "failure", reason: "network_or_response_error" };
    return { status: "success", candidates: withoutRepeats(wholePlacesFirst(words, found)).slice(0, resultLimit) };
  }

  /** Tianditu's own answer: an administrative area, a page of POIs, or (for statistics) nothing. */
  private async found(body: Record<string, unknown>): Promise<LocationCandidate[] | null> {
    if (isRecord(body.area)) {
      const point = tiandituPoint(body.area.lonlat);
      // A province names itself; reverse geocoding is for the levels above a 市, and a
      // wasted call there would turn an answer into a failure whenever the geocoder is down.
      const around = String(body.area.adminCode ?? "").endsWith("0000")
        ? noLevels
        : point ? await this.levelsAt(point) : null;
      if (around === null) return null;
      const area = candidateFromArea(body.area, around);
      return area ? [area] : [];
    }
    if (!Array.isArray(body.pois)) return [];
    return body.pois.map(candidateFromPoi).filter((place): place is LocationCandidate => place !== null);
  }

  /**
   * The province, 市 and county a point sits in. An error body is a failure, not a place
   * without a province: 丽江 as a 市 is useless to Meri's rules without its province.
   */
  private async levelsAt(point: { longitude: number; latitude: number }): Promise<Levels | null> {
    const answer = await this.client.get("/geocoder", {
      type: "geocode", postStr: JSON.stringify({ lon: point.longitude, lat: point.latitude, ver: 1 }),
    });
    if (!answer.ok) return null;
    const result = isRecord(answer.body.result) ? answer.body.result : null;
    const component = result && isRecord(result.addressComponent) ? result.addressComponent : null;
    if (component === null) return null;
    return { province: optionalText(component.province), city: optionalText(component.city), district: optionalText(component.county) };
  }
}
