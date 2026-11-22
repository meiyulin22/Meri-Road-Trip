import type { PlanDay } from "./plan-draft";
import type { SpotCard } from "./spot-card";
import { cityForecast, type DayForecast, forecastOn, type SpotWeather } from "./weather";

/**
 * What to wear each day (agreed 2026-11-20): code decides the basics from the day's weather, so
 * nothing needed is ever missing, and the Plan Agent may add a few things of its own, tied to the
 * day's spots. Pure: the weather comes from the cards, the additions from the model, checked here.
 */

/** Where a thing is worn or carried; the equipment screen has one slot each. */
export const outfitSlots = ["head", "face", "neck", "top", "mid", "outer", "hands", "legs", "feet", "bag"] as const;
export type OutfitSlot = (typeof outfitSlots)[number];

/** The basics code can require, each with its own art on the equipment screen. */
export const outfitCatalog = {
  tshirt: "top",
  long_sleeve: "top",
  thermal_top: "top",
  fleece: "mid",
  windbreaker: "outer",
  shell_jacket: "outer",
  down_jacket: "outer",
  trousers: "legs",
  thermal_pants: "legs",
  walking_shoes: "feet",
  waterproof_shoes: "feet",
  sun_hat: "head",
  beanie: "head",
  sunglasses: "face",
  scarf: "neck",
  gloves: "hands",
  umbrella: "bag",
  sunscreen: "bag",
} as const satisfies Record<string, OutfitSlot>;
export type OutfitItemId = keyof typeof outfitCatalog;
export const outfitItemIds = Object.keys(outfitCatalog) as OutfitItemId[];

/** Why code requires an item, as data, so the page words it in either language. */
export type OutfitReason =
  | { readonly kind: "cold"; readonly temp: number; readonly place: string }
  | { readonly kind: "mild"; readonly temp: number; readonly place: string }
  | { readonly kind: "warm"; readonly temp: number; readonly place: string }
  | { readonly kind: "rain"; readonly mm: number; readonly chance: number | null; readonly hours?: number }
  | { readonly kind: "storm"; readonly mm: number }
  | { readonly kind: "gale"; readonly gustKmh: number; readonly estimated?: true }
  | { readonly kind: "snow"; readonly cm: number; readonly estimated?: true }
  | { readonly kind: "altitude"; readonly metres: number; readonly place: string }
  | { readonly kind: "sun"; readonly high: number }
  | { readonly kind: "walking" };

export type OutfitItem = { readonly id: OutfitItemId; readonly reasons: readonly OutfitReason[] };

/** Something the Plan Agent added, outside the basics: drawn with a generic icon, marked as its suggestion. */
export type OutfitExtra = { readonly name: string; readonly slot: OutfitSlot; readonly reason: string };

/** The coldest or warmest the day gets, and where. */
export type DayExtreme = { readonly temp: number; readonly place: string };

export type DayOutfit = {
  readonly day: number;
  readonly date: string;
  readonly coldest: DayExtreme;
  readonly warmest: DayExtreme;
  readonly items: readonly OutfitItem[];
  readonly extras: readonly OutfitExtra[];
  /** The Plan Agent's one line for the day, in the plan's language; null when it gave none. */
  readonly tip: string | null;
  /** High and low ten degrees or more apart: dress in layers, since the day is spent out. */
  readonly bigSwing: boolean;
};

/** Agreed thresholds (2026-11-20), the low being the coldest point the day visits. */
export const outfitThresholds = {
  tshirtFrom: 20,
  windbreakerFrom: 12,
  shellFrom: 5,
  downFrom: 0,
  wetMm: 5,
  wetChance: 60,
  wetHours: 3,
  stormMm: 25,
  galeGustKmh: 62,
  altitudeMetres: 3000,
  sunHigh: 25,
  swing: 10,
} as const;

export const maxExtrasPerDay = 4;
export const maxExtraNameLength = 10;
export const maxExtraReasonLength = 60;
export const maxTipLength = 120;

const thunderstormCodes = new Set([95, 96, 99]);
const snowCodes = new Set([71, 73, 75, 77, 85, 86]);

/**
 * One place's forecast on the day, with its name and elevation. `own` is false when the place is
 * not a stop's own point but the city's weather; its elevation then says nothing about the stop.
 */
export type PlaceForecast = { readonly place: string; readonly elevation: number | null; readonly own: boolean; readonly forecast: DayForecast };

/**
 * The forecasts a day meets: each stop's own point on its date, or the city's weather when no stop
 * has one. Empty when the day has no date or no forecast.
 */
export function dayForecasts(day: PlanDay, cards: ReadonlyMap<string, SpotCard>): PlaceForecast[] {
  if (day.date === null) return [];
  const places: PlaceForecast[] = [];
  for (const { spotId } of day.stops) {
    const card = cards.get(spotId);
    const forecast = card ? forecastOn(card.weather, day.date) : null;
    if (!card || !forecast || card.weather?.status !== "forecast") continue;
    const own = card.weather.source === "spot";
    places.push({ place: own ? card.name : day.city, elevation: card.weather.elevation, own, forecast });
  }
  if (places.length > 0) return places;
  const city = cityForecast([...cards.values()].filter((card) => card.city === day.city).map(({ weather }) => weather));
  const forecast = city ? forecastOn(city, day.date) : null;
  return forecast && city ? [{ place: day.city, elevation: city.elevation, own: false, forecast }] : [];
}

/**
 * The basics for a day from the weather it meets, each with why. Null when there is no forecast.
 * Layers follow the coldest point, since a day out is not spent going back to change.
 */
export function baseOutfit(day: PlanDay, places: readonly PlaceForecast[]): Omit<DayOutfit, "extras" | "tip"> | null {
  if (day.date === null || places.length === 0) return null;
  const t = outfitThresholds;
  const coldestAt = places.reduce((best, place) => place.forecast.low < best.forecast.low ? place : best);
  const warmestAt = places.reduce((best, place) => place.forecast.high > best.forecast.high ? place : best);
  const coldest = { temp: coldestAt.forecast.low, place: coldestAt.place };
  const warmest = { temp: warmestAt.forecast.high, place: warmestAt.place };
  const rainMm = Math.max(...places.map(({ forecast }) => forecast.precipitationMm));
  const chance = places.reduce<number | null>((best, { forecast }) =>
    forecast.precipitationChance === null ? best : Math.max(best ?? 0, forecast.precipitationChance), null);
  const wetHours = places.reduce<number | null>((best, { forecast }) =>
    forecast.wetHours === undefined ? best : Math.max(best ?? 0, forecast.wetHours), null);
  const gustAt = places.reduce((best, place) => place.forecast.gustKmh > best.forecast.gustKmh ? place : best);
  const snowAt = places.reduce((best, place) => place.forecast.snowfallCm > best.forecast.snowfallCm ? place : best);
  const gust = gustAt.forecast.gustKmh;
  const snowCm = snowAt.forecast.snowfallCm;
  // Worked out from mean wind or precipitation, not forecast (MET Norway): the page says "about".
  const estimate = (place: PlaceForecast) => (place.forecast.estimated ? { estimated: true as const } : {});
  const stormy = places.some(({ forecast }) => thunderstormCodes.has(forecast.code)) || rainMm >= t.stormMm;
  const gale = gust >= t.galeGustKmh;
  const snowy = snowCm > 0 || places.some(({ forecast }) => snowCodes.has(forecast.code));
  // Altitude counts only at a stop's own point: a city's weather point says nothing of where the stop is.
  const highest = places.reduce<PlaceForecast | null>((best, place) =>
    place.own && place.elevation !== null && (best === null || (best.elevation ?? 0) < place.elevation) ? place : best, null);
  const sunny = places.some(({ forecast }) => forecast.code <= 1) && warmest.temp >= t.sunHigh;

  const items = new Map<OutfitItemId, OutfitReason[]>();
  const add = (id: OutfitItemId, reason: OutfitReason) => items.set(id, [...(items.get(id) ?? []), reason]);
  const cold = { kind: "cold" as const, ...coldest };

  // Layers by the coldest point of the day.
  if (coldest.temp >= t.tshirtFrom) {
    add("tshirt", { kind: "warm", ...coldest });
  } else if (coldest.temp >= t.windbreakerFrom) {
    add("long_sleeve", { kind: "mild", ...coldest });
    add("windbreaker", { kind: "mild", ...coldest });
  } else if (coldest.temp >= t.shellFrom) {
    add("long_sleeve", cold);
    add("fleece", cold);
    add("shell_jacket", cold);
  } else {
    add("thermal_top", cold);
    add("fleece", cold);
    add("down_jacket", cold);
    if (coldest.temp < t.downFrom) {
      add("thermal_pants", cold);
      add("beanie", cold);
      add("gloves", cold);
    }
  }
  add("trousers", { kind: "walking" });

  // Wet, stormy, windy, snowy.
  if (stormy || gale) {
    // An umbrella is no use in a gale or a thunderstorm on a mountain; a waterproof shell is.
    if (stormy) add("shell_jacket", { kind: "storm", mm: rainMm });
    if (gale) add("shell_jacket", { kind: "gale", gustKmh: gust, ...estimate(gustAt) });
    if (stormy) add("waterproof_shoes", { kind: "storm", mm: rainMm });
  } else if (rainMm >= t.wetMm || (chance ?? 0) >= t.wetChance || (wetHours ?? 0) >= t.wetHours) {
    add("umbrella", { kind: "rain", mm: rainMm, chance, ...(wetHours === null ? {} : { hours: wetHours }) });
  }
  if (snowy) {
    add("waterproof_shoes", { kind: "snow", cm: snowCm, ...estimate(snowAt) });
    add("gloves", { kind: "snow", cm: snowCm, ...estimate(snowAt) });
  }
  if (!items.has("waterproof_shoes")) add("walking_shoes", { kind: "walking" });

  // High places and strong sun.
  if (highest && highest.elevation !== null && highest.elevation >= t.altitudeMetres) {
    const altitude = { kind: "altitude" as const, metres: Math.round(highest.elevation), place: highest.place };
    add("sunglasses", altitude);
    add("sunscreen", altitude);
  }
  if (sunny) {
    add("sun_hat", { kind: "sun", high: warmest.temp });
    add("sunscreen", { kind: "sun", high: warmest.temp });
  }

  return {
    day: day.day,
    date: day.date,
    coldest,
    warmest,
    items: outfitItemIds.filter((id) => items.has(id)).map((id) => ({ id, reasons: items.get(id) as OutfitReason[] })),
    bigSwing: warmest.temp - coldest.temp >= t.swing,
  };
}

/** Base item names, for the model and for dropping additions that repeat them. */
export const outfitItemNames: Record<OutfitItemId, { readonly zh: string; readonly en: string }> = {
  tshirt: { zh: "短袖", en: "T-shirt" },
  long_sleeve: { zh: "长袖", en: "Long sleeves" },
  thermal_top: { zh: "保暖内衣", en: "Thermal top" },
  fleece: { zh: "抓绒", en: "Fleece" },
  windbreaker: { zh: "防风外套", en: "Windbreaker" },
  shell_jacket: { zh: "冲锋衣", en: "Waterproof shell" },
  down_jacket: { zh: "羽绒服", en: "Down jacket" },
  trousers: { zh: "长裤", en: "Trousers" },
  thermal_pants: { zh: "保暖裤", en: "Thermal leggings" },
  walking_shoes: { zh: "防滑运动鞋", en: "Walking shoes" },
  waterproof_shoes: { zh: "防水鞋", en: "Waterproof shoes" },
  sun_hat: { zh: "遮阳帽", en: "Sun hat" },
  beanie: { zh: "毛线帽", en: "Beanie" },
  sunglasses: { zh: "墨镜", en: "Sunglasses" },
  scarf: { zh: "围巾", en: "Scarf" },
  gloves: { zh: "手套", en: "Gloves" },
  umbrella: { zh: "雨伞", en: "Umbrella" },
  sunscreen: { zh: "防晒霜", en: "Sunscreen" },
};

/** What the model proposed for one day, in the loose shape it may answer. */
export type ProposedOutfitDay = {
  readonly day: unknown;
  readonly extras?: unknown;
  readonly tip?: unknown;
};

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + "…" : text);
const isSlot = (value: unknown): value is OutfitSlot => typeof value === "string" && (outfitSlots as readonly string[]).includes(value);

/**
 * The Plan Agent's additions for a day, checked: at most four, each a short name in a known slot
 * with a reason; nothing named like any basic, worn that day or not, since code decides the basics
 * (the first live run, 2026-11-20, added "Umbrella" and "Rain shell"), and no repeats. Its tip is
 * kept if it is text. Anything else is dropped, never guessed.
 */
export function checkedAdditions(
  base: Omit<DayOutfit, "extras" | "tip">,
  proposed: ProposedOutfitDay | undefined,
): Pick<DayOutfit, "extras" | "tip"> {
  if (!proposed) return { extras: [], tip: null };
  const taken = new Set<string>(outfitItemIds.flatMap((id) => [outfitItemNames[id].zh, outfitItemNames[id].en.toLowerCase(), id]));
  const basicLike = /雨伞|冲锋衣|羽绒服|umbrella|rain ?(shell|jacket|coat)|down jacket/iu;
  const extras: OutfitExtra[] = [];
  for (const raw of Array.isArray(proposed.extras) ? proposed.extras : []) {
    if (extras.length >= maxExtrasPerDay) break;
    if (typeof raw !== "object" || raw === null) continue;
    const { name, slot, reason } = raw as Record<string, unknown>;
    if (typeof name !== "string" || typeof reason !== "string" || !isSlot(slot)) continue;
    const cleanName = name.trim();
    const cleanReason = reason.trim();
    if (cleanName === "" || cleanName.length > maxExtraNameLength || cleanReason === "") continue;
    const key = cleanName.toLowerCase();
    if (taken.has(cleanName) || taken.has(key) || basicLike.test(cleanName)) continue;
    taken.add(cleanName);
    taken.add(key);
    extras.push({ name: cleanName, slot, reason: clip(cleanReason, maxExtraReasonLength) });
  }
  const tip = typeof proposed.tip === "string" && proposed.tip.trim() !== "" ? clip(proposed.tip.trim(), maxTipLength) : null;
  return { extras, tip };
}

/** Everything the trip needs, for the packing list: each item or addition and the days it is worn. */
export function packingList(outfits: readonly DayOutfit[]): {
  readonly base: readonly { readonly id: OutfitItemId; readonly days: readonly number[] }[];
  readonly extras: readonly { readonly name: string; readonly slot: OutfitSlot; readonly days: readonly number[] }[];
} {
  const base = outfitItemIds.flatMap((id) => {
    const days = outfits.filter(({ items }) => items.some((item) => item.id === id)).map(({ day }) => day);
    return days.length > 0 ? [{ id, days }] : [];
  });
  const extras = new Map<string, { name: string; slot: OutfitSlot; days: number[] }>();
  for (const outfit of outfits) {
    for (const extra of outfit.extras) {
      const known = extras.get(extra.name);
      if (known) known.days.push(outfit.day);
      else extras.set(extra.name, { name: extra.name, slot: extra.slot, days: [outfit.day] });
    }
  }
  return { base, extras: [...extras.values()] };
}

/**
 * Why a plan has no outfit at all, for the progress line (2026-11-22: "0 days dressed" said nothing):
 * no day has a date, every date is past the forecast, or the weather was not fetched this time.
 */
export function whyNoOutfits(
  dates: readonly (string | null)[],
  weathers: readonly (SpotWeather | undefined)[],
): "no_dates" | "beyond" | "no_weather" {
  if (dates.every((date) => date === null)) return "no_dates";
  const known = weathers.filter((weather): weather is SpotWeather => weather !== undefined);
  if (known.length > 0 && known.every(({ status }) => status === "beyond_range")) return "beyond";
  return "no_weather";
}
