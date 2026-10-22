import { createPacer, type Gate } from "@/platform/amap/amap-fetch";
import { logger, logEvents } from "@/platform/observability/logger";

/**
 * Wikimedia asks API clients to send requests one at a time; a card row fired a dozen at
 * once on 2026-10-22 and every one came back HTTP 429. Every Wikidata and Commons
 * request in the process waits its turn here, half a second apart.
 */
export const wikimediaGate: Gate = createPacer(500);

/**
 * Tianditu knows thousands of places called 苍山 and ranks them by text alone, so it
 * cannot say which one a traveller means. Wikidata can: the famous one is written up
 * in many languages. This finds, for a name, the sight in China that has the most
 * language editions — and, as a by-product, its English name and a photo.
 *
 * Measured 2026-10-22 on 24 names (scripts/verify-wikidata.ts): 17 right by editions
 * alone; the wrong ones were all administrative or transport entries — 苍山 found
 * 兰陵县 (formerly 苍山县), 稻城亚丁 its airport — so those kinds are left out here.
 */
export interface FamousSight {
  readonly id: string;
  /** Simplified Chinese name, as Wikidata writes it. */
  readonly label: string;
  readonly englishLabel: string | null;
  /** WGS-84, which CGCS2000 matches to within a metre — the same footing as Tianditu. */
  readonly longitude: number;
  readonly latitude: number;
  /** A Wikimedia Commons file name, or null. */
  readonly image: string | null;
  /** Language editions about it: how widely it is known. */
  readonly editions: number;
}

/**
 * Whether a sight's Wikidata name is the user's words: exactly, or with only a scenic
 * area's suffix after them — 九寨沟 is filed as 九寨沟风景名胜区. Anything else (点苍山
 * for 苍山, 玉龙雪山 for 玉龙) is another name, and another place is not offered for it.
 */
export function namesTheSight(label: string, words: string): boolean {
  const name = label.normalize("NFKC").trim();
  const said = words.normalize("NFKC").trim();
  return name === said || (name.startsWith(said) && /^(?:风景名胜区|风景区|景区|国家公园|国家森林公园|地质公园|森林公园)$/u.test(name.slice(said.length)));
}

/**
 * "None" is an answer worth remembering; "unavailable" (unreachable, rate-limited) is
 * not — a photo cache that kept it would show no photo for a week after one bad minute.
 */
export type FamousSightLookup =
  | { readonly status: "found"; readonly sight: FamousSight }
  | { readonly status: "none" }
  | { readonly status: "unavailable" };

export interface FamousSightFinder {
  /** Never throws. */
  findFamousSight(name: string): Promise<FamousSightLookup>;
}

/** The sight, when Wikidata both answered and knew one. */
export function foundSight(lookup: FamousSightLookup): FamousSight | null {
  return lookup.status === "found" ? lookup.sight : null;
}

const apiUrl = "https://www.wikidata.org/w/api.php";
/**
 * Wikimedia asks every client to say who it is and how to reach its operator, and
 * rate-limits ones that do not; WIKIMEDIA_CONTACT (an email or a site URL) fills that in.
 */
export function wikimediaUserAgent(environment: Readonly<Record<string, string | undefined>> = process.env): string {
  const contact = environment.WIKIMEDIA_CONTACT?.trim();
  return `MeriRoadTrip/1.0 (${contact ? contact : "travel planning portfolio project"})`;
}

/**
 * The headers every Wikimedia request carries. Anonymous requests are limited per IP,
 * which a shared proxy exit had used up on 2026-10-22; a logged-in account gets 200 a
 * minute. WIKIMEDIA_ACCESS_TOKEN is an OAuth 2.0 owner-only access token — OAuth 1
 * tokens count as anonymous. It is sent only to Wikimedia and never logged.
 */
export function wikimediaHeaders(environment: Readonly<Record<string, string | undefined>> = process.env): Record<string, string> {
  const token = environment.WIKIMEDIA_ACCESS_TOKEN?.trim();
  return { "User-Agent": wikimediaUserAgent(environment), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
const china = "Q148";
/**
 * Properties only administrative areas, airports and stations carry: a China
 * administrative division code, a population, IATA / ICAO codes, a station code.
 */
const nonSightProperties = ["P442", "P1082", "P238", "P239", "P296"];
const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
const maxCached = 1_000;

type Claims = Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
interface Entity {
  readonly id: string;
  readonly labels?: Record<string, { value: string }>;
  readonly sitelinks?: Record<string, unknown>;
  readonly claims?: Claims;
}

function claimValue(entity: Entity, property: string): unknown {
  return entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
}

function chineseLabel(entity: Entity): string | null {
  for (const language of ["zh-hans", "zh-cn", "zh"]) {
    const value = entity.labels?.[language]?.value;
    if (value) return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The pure part: which of Wikidata's matches is the famous sight, if any. */
export function famousSightAmong(entities: readonly Entity[]): FamousSight | null {
  const sights = entities.flatMap((entity): FamousSight[] => {
    const country = claimValue(entity, "P17");
    const point = claimValue(entity, "P625");
    const label = chineseLabel(entity);
    if (!isRecord(country) || country.id !== china || !isRecord(point) || label === null) return [];
    if (nonSightProperties.some((property) => entity.claims?.[property] !== undefined)) return [];
    if (typeof point.longitude !== "number" || typeof point.latitude !== "number") return [];
    const image = claimValue(entity, "P18");
    return [{
      id: entity.id, label, englishLabel: entity.labels?.en?.value ?? null,
      longitude: point.longitude, latitude: point.latitude,
      image: typeof image === "string" ? image : null,
      editions: Object.keys(entity.sitelinks ?? {}).length,
    }];
  });
  return sights.sort((left, right) => right.editions - left.editions)[0] ?? null;
}

function answer(sight: FamousSight | null): FamousSightLookup {
  return sight ? { status: "found", sight } : { status: "none" };
}

export class WikidataSights implements FamousSightFinder {
  private readonly answers = new Map<string, { readonly sight: FamousSight | null; readonly expires: number }>();

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly timeoutMs = 4_000,
    private readonly gate: Gate = wikimediaGate,
  ) {}

  async findFamousSight(name: string): Promise<FamousSightLookup> {
    const key = name.normalize("NFKC").trim();
    if (key === "") return { status: "none" };
    const remembered = this.answers.get(key);
    if (remembered && remembered.expires > this.now()) return answer(remembered.sight);
    try {
      const search = await this.call({ action: "wbsearchentities", language: "zh", uselang: "zh", limit: "10", search: key });
      const ids = (Array.isArray(search.search) ? search.search : [])
        .map((hit: unknown) => (isRecord(hit) && typeof hit.id === "string" ? hit.id : null))
        .filter((id): id is string => id !== null);
      const sight = ids.length === 0 ? null : famousSightAmong(Object.values(await this.entities(ids)));
      this.remember(key, sight);
      return answer(sight);
    } catch (error) {
      // Mainland networks cannot reach Wikidata; that is an ordinary "don't know".
      // The message holds the status only; Wikidata URLs carry no key.
      logger.warn({ event: logEvents.wikidataLookupFailed, reason: error instanceof Error ? error.message : "unknown" },
        "Wikidata lookup failed");
      return { status: "unavailable" };
    }
  }

  private async entities(ids: readonly string[]): Promise<Record<string, Entity>> {
    const body = await this.call({
      action: "wbgetentities", props: "labels|claims|sitelinks", languages: "zh-hans|zh-cn|zh|en", ids: ids.join("|"),
    });
    return isRecord(body.entities) ? body.entities as Record<string, Entity> : {};
  }

  private async call(params: Record<string, string>): Promise<Record<string, unknown>> {
    // The timeout starts when the request leaves the queue, not while it waits.
    const response = await this.gate.run(() => this.fetcher(`${apiUrl}?${new URLSearchParams({ ...params, format: "json" })}`, {
      headers: wikimediaHeaders(),
      signal: AbortSignal.timeout(this.timeoutMs),
    }));
    if (!response.ok) throw new Error(`Wikidata answered HTTP ${response.status}`);
    const body: unknown = await response.json();
    if (!isRecord(body)) throw new Error("Wikidata answered something other than an object");
    return body;
  }

  /** Real answers only, kept a week; a failure is asked again next time. */
  private remember(key: string, sight: FamousSight | null): void {
    this.answers.delete(key);
    this.answers.set(key, { sight, expires: this.now() + sevenDaysMs });
    if (this.answers.size > maxCached) this.answers.delete(this.answers.keys().next().value as string);
  }
}

/** One cache per server process, shared by the Tianditu place check and the photos. */
export const sharedWikidataSights = new WikidataSights();
