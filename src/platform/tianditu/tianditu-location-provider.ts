import type { LocationCandidate, LocationKind } from "@/domain/location/location";
import { isFacilityName } from "@/domain/location/place-name";
import type { LocationProvider, LocationSearchResult } from "@/platform/location-provider/location-provider";

import { createTiandituClient, type TiandituAnswer, type TiandituClient } from "./tianditu-fetch";
import { sharedClassificationMemory, type ClassificationMemory } from "./classification-memory";

/** As many as the Amap adapter hands to Meri's rules, so both are judged on the same page. */
const resultLimit = 5;
/**
 * Tianditu ranks by text, so the scenic area a traveller means is often far down the
 * page: 甘孜州稻城亚丁景区 came 20th for 稻城亚丁, 洪崖洞民俗风貌区 21st for 洪崖洞. A page
 * of 30 is read so that such a whole place can be moved up.
 */
const pageSize = "30";
const chinaBound = "73,3,136,54";
/**
 * The categories the classification search is asked for, in the order that matters:
 * 风景名胜 is a tourist scenic area, 山 catches the mountains filed only as natural
 * features (点苍山). `dataTypes` takes one value per request — a comma-separated list
 * answered zero rows on 2026-10-23.
 */
const sightDataTypes = ["风景名胜", "山"] as const;
/** How many districts from the national page are searched inside; each costs two requests. */
const maxAreas = 2;
/** 直辖市 are their own province and their own 市; Tianditu leaves the 市 empty for them. */
const municipalities = new Set(["北京市", "天津市", "上海市", "重庆市"]);

/**
 * Tianditu's own category codes, taken from the official table
 * (https://download.tianditu.gov.cn/download/xzqh/Type.csv, GBK, 339 rows, 2026-10-23):
 * 180400 风景名胜, 1602xx 文化场馆 (图书馆、博物馆、美术馆、科技馆), 2602xx 自然地物
 * (山、河流、湖泊、岛屿、山洞、泉). Everything else is not somewhere to go — 1802xx is
 * 休闲娱乐 (彩票销售、网吧、夜总会), 2601xx 行政地名, 2603xx 门牌信息, 1801xx 运动场馆.
 * The earlier guess "2603xx rivers and lakes, 2608xx islands" was wrong: 2603 is house
 * numbers and no 2608 family exists, so both are gone.
 */
const sightTypeCodes = /^(180400|1602|2602)/u;
/**
 * Inside 1803 休闲度假 only some entries are places to visit. 180306 广场 is left out on
 * purpose: 潮汕站南广场 is a station square, not a sight, and it once made 潮汕 resolve
 * to a square. 180301 农家乐 and 180302 度假村 are lodging, not destinations.
 */
const parkTypeCodes = new Set(["180303", "180304", "180305", "180307", "180308", "180309", "180310"]);

export function tiandituKind(typeCode: unknown): LocationKind | undefined {
  if (typeof typeCode !== "string" || typeCode.trim() === "") return undefined;
  const code = typeCode.trim();
  return sightTypeCodes.test(code) || parkTypeCodes.has(code) ? "sight" : "other";
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
  const wholePlaces = found.filter((place) => isWholePlace(words, place));
  if (wholePlaces.length === 0) return [...found];
  return [...wholePlaces, ...found.filter((place) => !isWholePlace(words, place) && place.kind === "sight")];
}

/** The whole place the user named, rather than a part of it or a shop that borrowed the name. */
function isWholePlace(words: string, place: LocationCandidate): boolean {
  const name = normalize(place.name);
  return place.kind === "sight" && name.includes(words) && !/[-－·(（]/u.test(name) && rank(name, words) < 2;
}

/**
 * The districts the national page filed its results under, in page order. A keyword page
 * for 稻城亚丁 is all 稻城县, which is exactly the area whose clean list is worth asking for.
 */
/**
 * The areas whose clean list is worth asking for: the trip's own areas when it has any,
 * otherwise the districts the national page filed its results under. A keyword page for
 * 稻城亚丁 is all 稻城县, while 苍山's page is all 广西 — only the trip itself can say 大理.
 * Mixing both would put the page's district back in front (宾阳县 also has a 苍山), so the
 * trip's areas replace them rather than joining them; if nothing there matches, the page
 * still stands untouched. A province is dropped from the prior, because its 600-row page
 * rarely holds the place and the 市 or 区县 is what actually narrows the search.
 */
function areaNamesOf(candidates: readonly LocationCandidate[], prior: readonly string[] = []): string[] {
  const fromTrip = prior
    .map((area) => area.trim())
    .filter((name) => name !== "" && !/(?:省|自治区|特别行政区)$/u.test(name));
  const names: string[] = [...new Set(fromTrip)];
  if (names.length === 0) {
    for (const place of candidates) {
      const area = place.district ?? place.city;
      if (area !== null && !names.includes(area)) names.push(area);
    }
  }
  return names.slice(0, maxAreas);
}

/**
 * Whether a place sits in one of the areas the trip already is. The same place carries
 * different suffixes across levels (大理市 / 大理白族自治州 / 云南省), and its own two
 * characters come first in every case Meri meets — two is enough to keep 河北 and 河南,
 * or 湖南 and 湖北, apart.
 */
function insideAnyArea(place: LocationCandidate, areas: readonly string[]): boolean {
  if (areas.length === 0) return true;
  const own = [place.province, place.city, place.district].filter((level): level is string => level !== null)
    .map((level) => normalize(level).slice(0, 2));
  return areas.some((area) => own.includes(normalize(area).slice(0, 2)));
}

/** Closest names first: the words themselves, then a scenic suffix, then the shortest prefix; a facility last. */
function namedFirst(words: string, places: readonly LocationCandidate[]): LocationCandidate[] {
  return places
    .filter((place) => normalize(place.name).includes(words))
    .sort((left, right) => rank(normalize(left.name), words) - rank(normalize(right.name), words) ||
      Number(isFacilityName(left.name)) - Number(isFacilityName(right.name)) ||
      normalize(left.name).length - normalize(right.name).length);
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
 * and 市 are exact, but it ranks same-named places by text alone and offers no popularity
 * signal. Two things make up for it: wholePlacesFirst moves a whole scenic area up the
 * page, and when the page itself has no whole place to offer (a row of airport, hotels
 * and the scenic area's own office), the classification search lists that district's
 * scenic areas by category instead — one request per area and category.
 *
 * A Wikidata lookup did the fame ranking until 2026-10-23, when it was removed: a server
 * in mainland China cannot reach Wikidata, so it only ever helped a developer's machine.
 * Everything after the provider is Amap's flow unchanged: one page, the same rules, the
 * same confirmation before a place is saved.
 */
export class TiandituLocationProvider implements LocationProvider {
  constructor(
    private readonly client: TiandituClient = createTiandituClient(),
    private readonly memory: ClassificationMemory = sharedClassificationMemory,
  ) {}

  async searchByKeyword(query: string, areas: readonly string[] = []): Promise<LocationSearchResult> {
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
    if (found.length === 0) return { status: "success", candidates: [] };
    const direct = wholePlacesFirst(words, found);
    const area = isRecord(search.body.area) ? search.body.area : null;
    // A province names itself and is almost always what the user meant, so it is left
    // alone. A district answer (黄山, 丽江) and a page of POIs are both worth the clean
    // list: a district's scenic areas come back without the airport, the hotels or the
    // management office that outrank them by name.
    const provinceAnswer = area !== null && String(area.adminCode ?? "").endsWith("0000");
    // A whole place answers only when it is also somewhere this trip could be: with 大理
    // saved, 苍山's page leads with the 广西 village, which is not the answer the user wants
    // and is exactly what the trip's own area can correct.
    const answered = provinceAnswer || (isWholePlace(words, found[0]) && insideAnyArea(found[0], areas));
    const clean = answered ? [] : await this.inAreas(areaNamesOf(found, areas), words);
    // Once the trip's own area answered, the country's same-named places are noise: Meri's
    // rules would put an exactly-named 广西 village ahead of 点苍山 and ask the user to choose
    // between them. An area with nothing to say still falls back to the national page.
    const tripAnswered = areas.length > 0 && clean.length > 0;
    const ordered = tripAnswered ? [...clean]
      : area !== null ? [...direct, ...clean] : [...clean, ...direct];
    return { status: "success", candidates: withoutRepeats(ordered).slice(0, resultLimit) };
  }

  /**
   * Tianditu's classification search: every 风景名胜 and 山 filed under an area, matched
   * against the user's words. Measured 2026-10-23: 稻城县 40 rows, first is
   * 甘孜州稻城亚丁景区; 黄山市 665 rows with 黄山风景区 inside the first page; 九寨沟县
   * 93 rows, first is 九寨沟风景名胜区. 山 covers what a scenic-area list leaves out —
   * 大理市 山 212 rows holds 点苍山.
   *
   * Each page is cached (see `ClassificationMemory`), and 山 is only asked for when the
   * 风景名胜 page had nothing that names the user's words — 黄山 matches on page one, while
   * 苍山 does not match at all and still needs the 山 page.
   */
  private async inAreas(names: readonly string[], words: string): Promise<LocationCandidate[]> {
    const found: LocationCandidate[] = [];
    for (const area of names) {
      for (const dataType of sightDataTypes) {
        const places = await this.classificationPage(area, dataType);
        found.push(...places);
        if (namedFirst(words, places).length > 0) break;
      }
    }
    return namedFirst(words, found);
  }

  /** One cached classification page; only a real page is remembered. */
  private async classificationPage(area: string, dataType: string): Promise<readonly LocationCandidate[]> {
    const remembered = this.memory.get(area, dataType);
    if (remembered !== null) return remembered;
    const answer = await this.client.get("/v2/search", {
      type: "query",
      postStr: JSON.stringify({ queryType: "13", specify: area, dataTypes: dataType, start: "0", count: "300", mapBound: chinaBound, show: "2" }),
    });
    // A refusal or an empty answer is not remembered: it would freeze a miss for a week.
    if (!answer.ok || !Array.isArray(answer.body.pois)) return [];
    const places = answer.body.pois.map(candidateFromPoi)
      .filter((place): place is LocationCandidate => place !== null);
    if (places.length > 0) this.memory.set(area, dataType, places);
    return places;
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
