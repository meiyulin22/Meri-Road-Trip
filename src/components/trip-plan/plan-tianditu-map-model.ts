import type { Locale } from "@/domain/locale/locale";
import { type DriveLeg, offRoadNoticeMeters } from "@/domain/plan/plan-draft";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";

/** One stop the map can draw: its day, its number within the day, and where Tianditu put it. */
export type MapStop = {
  readonly day: number;
  readonly city: string;
  readonly spotId: string;
  /** The stop's place in its day, from 1, as the day card lists it; an unlocated stop keeps its number. */
  readonly number: number;
  readonly name: string;
  readonly longitude: number;
  readonly latitude: number;
};

/**
 * The stops of a saved plan that have coordinates, day by day in order. A stop the map check
 * did not locate, and every stop of a plan saved before 1.2100, has none and is left off the
 * map; the day card still lists it.
 */
export function mapStops(plan: ReadyPlan): MapStop[] {
  const cards = new Map(plan.spots.map((card) => [card.id, card]));
  return plan.draft.days.flatMap(({ day, city, stops }) => stops.flatMap(({ spotId }, index) => {
    const card = cards.get(spotId);
    const point = card?.mapCheck.status === "located" ? card.mapCheck.point : null;
    return card && point ? [{ day, city, spotId, number: index + 1, name: card.name, longitude: point.longitude, latitude: point.latitude }] : [];
  }));
}

/**
 * What the map shows for one day: its located stops, or, when it has none, roughly where its
 * city is, from the stops located in that city on other days (1.2101). With neither, the day
 * cannot be placed and the map shows the whole trip.
 */
export type DayOnMap =
  | { readonly kind: "stops"; readonly stops: readonly MapStop[] }
  | { readonly kind: "city"; readonly name: string; readonly longitude: number; readonly latitude: number }
  | { readonly kind: "unplaced" };

export function dayOnMap(plan: ReadyPlan, stops: readonly MapStop[], day: number): DayOnMap {
  const own = stops.filter((stop) => stop.day === day);
  if (own.length > 0) return { kind: "stops", stops: own };
  const city = plan.draft.days.find((item) => item.day === day)?.city;
  const sameCity = stops.filter((stop) => stop.city === city);
  if (!city || sameCity.length === 0) return { kind: "unplaced" };
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    kind: "city",
    name: city,
    longitude: mean(sameCity.map(({ longitude }) => longitude)),
    latitude: mean(sameCity.map(({ latitude }) => latitude)),
  };
}

type Line = { readonly kind: "road" | "walk" | "straight"; readonly path: readonly (readonly [number, number])[] };

/**
 * The lines between one day's neighbouring stops: along the road or footpath where Tianditu
 * planned the leg, otherwise straight and dashed, which shows only the order (1.2102). Where
 * the way stops short of a stop by more than a short walk, that stretch is dashed too, as the
 * map has no road there (1.2103). A stop that is not located breaks the line.
 */
export function dayLines(stops: readonly MapStop[], legs: readonly DriveLeg[], day: number): Line[] {
  const own = stops.filter((stop) => stop.day === day).sort((left, right) => left.number - right.number);
  return own.slice(1).flatMap((to, index): Line[] => {
    const from = own[index];
    if (to.number !== from.number + 1) return [];
    const leg = legs.find((item) => item.day === day && item.fromSpotId === from.spotId && item.toSpotId === to.spotId);
    if (!leg || leg.mode === "none") {
      return [{ kind: "straight", path: [[from.longitude, from.latitude], [to.longitude, to.latitude]] }];
    }
    const kind = leg.mode === "walk" ? "walk" : "road";
    const path = leg.path;
    const startGap = (leg.offRoadStartMeters ?? 0) > offRoadNoticeMeters && path.length > 2;
    const endGap = (leg.offRoadEndMeters ?? 0) > offRoadNoticeMeters && path.length > 2;
    const body = path.slice(startGap ? 1 : 0, endGap ? -1 : undefined);
    return [
      ...(startGap ? [{ kind: "straight" as const, path: path.slice(0, 2) }] : []),
      { kind, path: body },
      ...(endGap ? [{ kind: "straight" as const, path: path.slice(-2) }] : []),
    ];
  });
}

/** The stops one view shows in colour: the chosen day's, or every day's for the whole trip. */
export function highlightedStops(stops: readonly MapStop[], day: number | null): MapStop[] {
  return day === null ? [...stops] : stops.filter((stop) => stop.day === day);
}

/**
 * A Tianditu tile layer in Web Mercator (the `_w` sets), as the JS API's TileLayer fills in
 * {x}, {y} and {z}. `vec` is the street map; `cva` its Chinese labels and `eva` its English
 * ones, so an English page reads English place names on the map.
 */
export function tileUrl(layer: "vec" | "cva" | "eva", key: string, server: number): string {
  return `https://t${server}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0`
    + `&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`
    + `&tk=${encodeURIComponent(key)}`;
}

export function labelLayer(locale: Locale): "cva" | "eva" {
  return locale === "en" ? "eva" : "cva";
}

/**
 * A numbered pin as an SVG data URL, the icon format the JS API takes: the chosen day's in
 * Meri's green, the other days' small and grey.
 */
export function markerIcon(number: number, active: boolean): { url: string; size: number } {
  const size = active ? 28 : 18;
  const fill = active ? "#2f5d46" : "#a9b3a6";
  const half = size / 2;
  const label = active
    ? `<text x="${half}" y="${half + 4.5}" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#fff">${number}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<circle cx="${half}" cy="${half}" r="${half - 1.5}" fill="${fill}" stroke="#fff" stroke-width="2"/>${label}</svg>`;
  return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, size };
}

/** The pin for a day placed only by its city: a ring, so it does not read as a stop. */
export function cityIcon(): { url: string; size: number } {
  const size = 30;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<circle cx="15" cy="15" r="11" fill="rgba(47,93,70,.12)" stroke="#2f5d46" stroke-width="2.5" stroke-dasharray="4 3"/>`
    + `<circle cx="15" cy="15" r="3" fill="#2f5d46"/></svg>`;
  return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, size };
}
