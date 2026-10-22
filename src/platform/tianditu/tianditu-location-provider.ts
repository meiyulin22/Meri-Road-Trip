import type { LocationCandidate, LocationKind } from "@/domain/location/location";
import type { LocationProvider, LocationSearchResult } from "@/platform/location-provider/location-provider";
import { foundSight, namesTheSight, sharedWikidataSights, type FamousSight, type FamousSightFinder } from "@/platform/wikidata/wikidata-sights";

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
/** How far from Wikidata's point a Tianditu sight may be and still be the same place. */
const nearbyRadiusMetres = "10000";
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

function metres(distance: unknown): number {
  if (typeof distance !== "string") return Number.POSITIVE_INFINITY;
  const match = /^([\d.]+)\s*(km|m)$/u.exec(distance.trim());
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1]) * (match[2] === "km" ? 1000 : 1);
}


function rank(name: string, words: string): number {
  if (name === words) return 0;
  if (wholePlaceSuffix.test(name)) return 1;
  return 2;
}

/**
 * Of the sights around Wikidata's point, the one the user named: exactly their words,
 * or their words inside a scenic area's or park's name. A part of the place does not
 * count, even when it carries the name — around 峨眉山 the nearest "sight" was
 * 峨眉山金顶华藏寺请香处, an incense stall — and then Wikidata's own point stands in.
 */
export function nearbySightNamed(query: string, pois: readonly unknown[]): LocationCandidate | null {
  const words = normalize(query);
  const found = pois.flatMap((poi) => {
    const place = candidateFromPoi(poi);
    if (!place || place.kind !== "sight") return [];
    const name = normalize(place.name);
    if (!name.includes(words) || /[-－·(（]/u.test(name)) return [];
    const placeRank = rank(name, words);
    return placeRank < 2 ? [{ place, rank: placeRank, distance: metres(isRecord(poi) ? poi.distance : null) }] : [];
  });
  found.sort((left, right) => left.rank - right.rank || left.distance - right.distance);
  return found[0]?.place ?? null;
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

/** Straight-line distance in metres; close enough to tell 大理 from 广西. */
export function distanceMetres(from: { longitude: number; latitude: number }, to: { longitude: number; latitude: number }): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
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
 * and 市 are exact, but it ranks same-named places by text alone. So when the user's
 * words are exactly the name of a sight Wikidata knows, that sight is looked up around
 * Wikidata's point and offered first — 苍山 is Dali's, not one of the 7,000 others.
 * Everything after that is Meri's own rules, unchanged. Wikidata being unreachable
 * only means Tianditu's own order is used.
 */
export class TiandituLocationProvider implements LocationProvider {
  constructor(
    private readonly client: TiandituClient = createTiandituClient(),
    private readonly sights: FamousSightFinder = sharedWikidataSights,
  ) {}

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
    const famous = await this.famousSight(words, found);
    // Once the famous one is known, other places of exactly that name (a park called
    // 九寨沟 in 泰州) are not what the user meant, any more than a shop borrowing it.
    const rest = famous ? found.filter((place) => normalize(place.name) !== words) : found;
    return { status: "success",
      candidates: withoutRepeats([...(famous ? [famous] : []), ...wholePlacesFirst(words, rest)]).slice(0, resultLimit) };
  }

  /** Tianditu's own answer: an administrative area, a page of POIs, or (for statistics) nothing. */
  private async found(body: Record<string, unknown>): Promise<LocationCandidate[] | null> {
    if (isRecord(body.area)) {
      const point = tiandituPoint(body.area.lonlat);
      const around = point ? await this.levelsAt(point) : null;
      if (around === null) return null;
      const area = candidateFromArea(body.area, around);
      return area ? [area] : [];
    }
    if (!Array.isArray(body.pois)) return [];
    return body.pois.map(candidateFromPoi).filter((place): place is LocationCandidate => place !== null);
  }

  /**
   * Only for words that name a sight on Wikidata (namesTheSight) — so 丽江 stays 丽江市,
   * while 峨眉山 (which Tianditu answers as 峨眉山市) also offers the mountain, as Amap
   * does. A sight Tianditu already found near Wikidata's point just moves to the front;
   * one it found far away (广西's 苍山 for Dali's) is why the area around the point is searched.
   */
  private async famousSight(words: string, found: readonly LocationCandidate[]): Promise<LocationCandidate | null> {
    const sight = foundSight(await this.sights.findFamousSight(words));
    if (sight === null || !namesTheSight(sight.label, words)) return null;
    const alreadyFound = found.find((place) => place.kind === "sight" && normalize(place.name).includes(words) &&
      distanceMetres(place, sight) <= Number(nearbyRadiusMetres));
    if (alreadyFound) return alreadyFound;
    const nearby = await this.client.get("/v2/search", {
      type: "query",
      postStr: JSON.stringify({ keyWord: words, queryType: "3", start: "0", count: "20",
        pointLonlat: `${sight.longitude},${sight.latitude}`, queryRadius: nearbyRadiusMetres, show: "2" }),
    });
    const pois = nearby.ok && Array.isArray(nearby.body.pois) ? nearby.body.pois : [];
    return nearbySightNamed(words, pois) ?? await this.inItsCity(words, sight) ?? await this.fromWikidata(sight);
  }

  /**
   * Tianditu's nearby search ranks by distance and all but ignores the keyword — around
   * 黄山's summit it gave peaks, toilets and a cable-car ticket office — so a scenic
   * area whose centre is further off (黄山风景区) is looked for by name inside the 市
   * Wikidata's point lies in, and taken only if it is near that point.
   */
  private async inItsCity(words: string, sight: FamousSight): Promise<LocationCandidate | null> {
    const levels = await this.levelsAt(sight);
    if (levels === null || levels.city === null) return null;
    const answer = await this.client.get("/v2/search", {
      type: "query",
      postStr: JSON.stringify({ keyWord: words, queryType: "12", specify: levels.city, start: "0", count: pageSize, show: "2" }),
    });
    const pois = answer.ok && Array.isArray(answer.body.pois) ? answer.body.pois : [];
    const near = pois.filter((poi) => {
      const point = isRecord(poi) ? tiandituPoint(poi.lonlat) : null;
      return point !== null && distanceMetres(point, sight) <= 3 * Number(nearbyRadiusMetres);
    });
    return nearbySightNamed(words, near);
  }

  /**
   * A sight Tianditu has no point for under that name — a mountain range, say — is
   * offered at Wikidata's point. That is WGS-84, which CGCS2000 matches to within a
   * metre, so it is still drawn on Tianditu's map, never converted.
   */
  private async fromWikidata(sight: FamousSight): Promise<LocationCandidate | null> {
    const levels = await this.levelsAt(sight);
    if (levels === null || levels.province === null) return null;
    return candidate({ providerId: `wikidata:${sight.id}`, name: sight.label, address: null,
      longitude: sight.longitude, latitude: sight.latitude, kind: "sight" }, levels);
  }

  private async levelsAt(point: { longitude: number; latitude: number }): Promise<Levels | null> {
    const answer = await this.client.get("/geocoder", {
      type: "geocode", postStr: JSON.stringify({ lon: point.longitude, lat: point.latitude, ver: 1 }),
    });
    if (!answer.ok) return null;
    const result = isRecord(answer.body.result) ? answer.body.result : {};
    const component = isRecord(result.addressComponent) ? result.addressComponent : {};
    return { province: optionalText(component.province), city: optionalText(component.city), district: optionalText(component.county) };
  }
}
