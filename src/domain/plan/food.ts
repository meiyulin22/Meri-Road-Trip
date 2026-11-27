import type { LocationCandidate } from "@/domain/location/location";

import type { PlanDay } from "./plan-draft";
import type { SpotCard } from "./spot-card";
import { type GeoPoint, kmBetween } from "./weather";

/**
 * What to eat in each city (agreed 2026-11-20/21): local dishes with a quoted source, and
 * restaurants that public articles recommend. Code drops promotional articles and checks each
 * restaurant on Tianditu near the city's stops. A restaurant needs two independent witnesses: two
 * different sites, or one site and Tianditu finding it near the stops (first live run, 2026-11-21:
 * with two sites required, no restaurant of three cities passed). One found on the map shows its
 * address; one two sites name but the map does not stays, lower down, with its sources and
 * "address to check"; one site alone and not on the map is not shown. Meri takes no payment.
 */

/** One search result the city's food research read. */
export type FoodSource = {
  readonly id: number;
  readonly url: string;
  readonly title: string;
  readonly site: string;
  readonly snippet: string;
  readonly checkedAt: string;
};

export type FoodEvidence = { readonly url: string; readonly title: string; readonly site: string; readonly quote: string };

/** A local dish; evidence is null for one from Meri's catalog (RAG step 2), shown as 「Meri 的整理」. */
export type Dish = { readonly name: string; readonly note: string; readonly evidence: FoodEvidence | null };

export type Restaurant = {
  readonly name: string;
  /** What the sources say to order there; null when they do not say. */
  readonly dish: string | null;
  /** From different sites: two or more, or one when Tianditu found the restaurant near the stops. */
  readonly evidence: readonly FoodEvidence[];
  /** Where Tianditu puts it, near the city's stops; null when it could not be found there. */
  readonly place: { readonly address: string | null; readonly point: GeoPoint; readonly distanceM: number; readonly near: string } | null;
  /** A guide in Meri's catalog recommended it (RAG step 5); its evidence may then be empty, with the map as witness. */
  readonly fromCatalog?: true;
};

export type CityFood = {
  readonly province: string;
  readonly city: string;
  /** The city's last day in the plan, for the page to place the card after. */
  readonly lastDay: number;
} & (
  | {
    readonly status: "found";
    readonly dishes: readonly Dish[];
    /** Found on Tianditu near the stops. */
    readonly restaurants: readonly Restaurant[];
    /** Named by two sites but not found on the map: shown with their sources. */
    readonly mentioned: readonly Restaurant[];
  }
  | { readonly status: "none" }
  | { readonly status: "unavailable" }
);

export const foodLimits = {
  dishes: 5,
  restaurants: 3,
  mentioned: 2,
  /**
   * Restaurants looked up on Tianditu a city, the likeliest first. Four left 23 of 大理's 27 quoted
   * restaurants unchecked (2026-11-21); eight cost a second or two more on Tianditu's 0.3 s queue (merlin).
   */
  lookups: 8,
  nearMetres: 1_500,
} as const;

/**
 * Words that mark an article as paid or promotional (agreed 2026-11-20); 品牌推荐 and 注册主体
 * were added from the first sample, an advertorial "TOP5 品牌推荐" that named the restaurant's
 * registered company.
 */
const promotional = /推广|广告|赞助|合作|软文|探店|团购|品牌推荐|注册主体|招商|加盟/u;

export function isPromotional(source: { readonly title: string; readonly snippet: string }): boolean {
  return promotional.test(source.title) || promotional.test(source.snippet);
}

/** The site a source belongs to, so two pages of one site count once: m.ctrip.com and ctrip.com are one. */
export function siteOf(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const parts = host.split(".");
    // Keep the registrable part: sina.com.cn, ctrip.com, amap.com.
    const keep = parts.length > 2 && ["com", "net", "org", "gov", "edu"].includes(parts.at(-2) ?? "") ? 3 : 2;
    return parts.slice(-keep).join(".");
  } catch {
    return url;
  }
}

/** A restaurant's name without its branch or spacing: 渣渣米线(古城店) → 渣渣米线. */
export function restaurantKey(name: string): string {
  return name.normalize("NFKC").replace(/[(（][^)）]*[)）]/gu, "").replace(/[\s·・\-－]/gu, "").trim();
}

/** A quote only counts when it is in its source and names the thing it is quoted for. */
function evidenceOf(sources: readonly FoodSource[], sourceId: number, quote: string, name: string): FoodEvidence | null {
  const source = sources.find(({ id }) => id === sourceId);
  const text = quote.trim();
  if (!source || text === "" || text.length > 160) return null;
  const normalized = (value: string) => value.normalize("NFKC");
  if (!normalized(source.title).includes(normalized(text)) && !normalized(source.snippet).includes(normalized(text))) return null;
  if (!restaurantKey(text).includes(restaurantKey(name)) && !normalized(text).includes(normalized(name))) return null;
  return { url: source.url, title: source.title, site: source.site, quote: text };
}

export type ProposedFood = {
  readonly dishes?: unknown;
  readonly restaurants?: unknown;
};

const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() !== "" && value.trim().length <= max ? value.trim() : null);

/**
 * The model's dishes and restaurants, checked against the sources: a dish needs a quote from a
 * source that names it; a restaurant keeps its quotes that name it, one a site. Whether a
 * restaurant has enough witnesses is decided after the map (`restaurantWitnesses`). Anything
 * else is dropped, never guessed.
 */
export function checkedFood(proposed: ProposedFood, sources: readonly FoodSource[]): { dishes: Dish[]; restaurants: Omit<Restaurant, "place">[] } {
  const dishes: Dish[] = [];
  for (const raw of Array.isArray(proposed.dishes) ? proposed.dishes : []) {
    if (dishes.length >= foodLimits.dishes || typeof raw !== "object" || raw === null) continue;
    const { name, note, sourceId, quote } = raw as Record<string, unknown>;
    const cleanName = text(name, 20);
    const cleanNote = text(note, 80);
    if (!cleanName || !cleanNote || typeof sourceId !== "number" || typeof quote !== "string") continue;
    if (dishes.some((dish) => dish.name === cleanName)) continue;
    const evidence = evidenceOf(sources, sourceId, quote, cleanName);
    if (evidence) dishes.push({ name: cleanName, note: cleanNote, evidence });
  }

  const restaurants: Omit<Restaurant, "place">[] = [];
  for (const raw of Array.isArray(proposed.restaurants) ? proposed.restaurants : []) {
    if (typeof raw !== "object" || raw === null) continue;
    const { name, dish, mentions } = raw as Record<string, unknown>;
    const cleanName = text(name, 30);
    if (!cleanName || !Array.isArray(mentions)) continue;
    if (restaurants.some((restaurant) => restaurantKey(restaurant.name) === restaurantKey(cleanName))) continue;
    const bySite = new Map<string, FoodEvidence>();
    for (const mention of mentions) {
      if (typeof mention !== "object" || mention === null) continue;
      const { sourceId, quote } = mention as Record<string, unknown>;
      if (typeof sourceId !== "number" || typeof quote !== "string") continue;
      const evidence = evidenceOf(sources, sourceId, quote, cleanName);
      if (evidence && !bySite.has(evidence.site)) bySite.set(evidence.site, evidence);
    }
    if (bySite.size < 1) continue;
    restaurants.push({ name: cleanName, dish: text(dish, 20), evidence: [...bySite.values()] });
  }
  return { dishes, restaurants };
}

/** Two different sites are enough alone; one site needs the map to have found the restaurant. */
export function restaurantWitnesses(sites: number, onMap: boolean): "shown" | "mentioned" | "dropped" {
  if (onMap) return "shown";
  return sites >= 2 ? "mentioned" : "dropped";
}

/**
 * Where Tianditu puts a restaurant: a place in the city whose name, without branch, holds the
 * restaurant's, within 1.5 km of one of the city's located stops; the nearest such. A same-named
 * place in another city never counts (渣渣米线 came back only in 张家口, 2026-11-21).
 */
export function placeRestaurant(
  name: string,
  candidates: readonly LocationCandidate[],
  city: { readonly province: string; readonly city: string },
  stops: readonly { readonly name: string; readonly point: GeoPoint }[],
): Restaurant["place"] {
  const key = restaurantKey(name);
  let best: NonNullable<Restaurant["place"]> | null = null;
  for (const candidate of candidates) {
    if (candidate.province !== city.province) continue;
    if (candidate.city !== city.city && !(candidate.city === null && city.province === city.city)) continue;
    if (!restaurantKey(candidate.name).includes(key)) continue;
    const point = { longitude: candidate.longitude, latitude: candidate.latitude };
    for (const stop of stops) {
      const metres = Math.round(kmBetween(point, stop.point) * 1_000);
      if (metres <= foodLimits.nearMetres && (best === null || metres < best.distanceM)) {
        best = { address: candidate.address, point, distanceM: metres, near: stop.name };
      }
    }
  }
  return best;
}

/** The runs of consecutive days in one city, each with its located stops. */
export function cityRuns(days: readonly PlanDay[], cards: ReadonlyMap<string, SpotCard>): {
  readonly province: string;
  readonly city: string;
  readonly days: readonly PlanDay[];
  readonly stops: readonly { readonly name: string; readonly point: GeoPoint }[];
}[] {
  const sorted = [...days].sort((left, right) => left.day - right.day);
  const runs: { province: string; city: string; days: PlanDay[]; stops: { name: string; point: GeoPoint }[] }[] = [];
  for (const day of sorted) {
    const last = runs.at(-1);
    const run = last && last.city === day.city && last.province === day.province ? last : null;
    const target = run ?? { province: day.province, city: day.city, days: [], stops: [] };
    if (!run) runs.push(target);
    target.days.push(day);
    for (const { spotId } of day.stops) {
      const card = cards.get(spotId);
      if (card?.mapCheck.status === "located" && card.mapCheck.point && !target.stops.some(({ name }) => name === card.name)) {
        target.stops.push({ name: card.name, point: card.mapCheck.point });
      }
    }
  }
  return runs;
}

/** A restaurant a guide in Meri's catalog recommended (RAG step 5): its name and what to order. */
export type CatalogRestaurantCandidate = { readonly name: string; readonly dishes: readonly string[] };

/** Map lookups a city may spend on the catalog's restaurants, beyond those for the web's. */
export const catalogRestaurantLookups = 4;
const mentionQuoteChars = 80;

/**
 * Where the search results name a catalog restaurant, found by code, not by the model: one quote a
 * site, a stretch of the title or snippet around the name (RAG step 5).
 */
export function webMentions(name: string, sources: readonly FoodSource[]): FoodEvidence[] {
  const wanted = name.normalize("NFKC");
  const bySite = new Map<string, FoodEvidence>();
  for (const source of sources) {
    if (bySite.has(source.site)) continue;
    for (const field of [source.title, source.snippet]) {
      const textValue = field.normalize("NFKC");
      const at = textValue.indexOf(wanted);
      if (at < 0) continue;
      const start = Math.max(0, at - Math.floor((mentionQuoteChars - wanted.length) / 2));
      const quote = textValue.slice(start, start + Math.max(mentionQuoteChars, wanted.length)).trim();
      bySite.set(source.site, { url: source.url, title: source.title, site: source.site, quote });
      break;
    }
  }
  return [...bySite.values()];
}

/**
 * A catalog restaurant needs one more witness, either will do (merlin, 2026-11-27: Tianditu is thin on
 * restaurants): on the map near the stops, shown with its address; or named on the web, shown among
 * those from articles. With neither it may have closed, and it is not shown.
 */
export function catalogWitness(onMap: boolean, webSites: number): "shown" | "mentioned" | "dropped" {
  if (onMap) return "shown";
  return webSites > 0 ? "mentioned" : "dropped";
}
