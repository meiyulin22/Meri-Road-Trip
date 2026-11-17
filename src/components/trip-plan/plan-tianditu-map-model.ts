import { type DriveLeg, legReach } from "@/domain/plan/plan-draft";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";

import { fadedDayColor } from "./plan-day-colors";

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

export type Line = { readonly kind: "road" | "walk" | "straight"; readonly path: readonly (readonly [number, number])[] };

/**
 * The lines between one day's neighbouring stops: along the road or footpath where Tianditu
 * planned the leg, otherwise straight and dashed, which shows only the order (1.2102). Where
 * the way stops short of a stop by more than a short walk, that stretch is dashed too, as the
 * map has no road there (1.2103). Where an end is a large area such as a lake, the planned road
 * started from an arbitrary point inside it, so the whole leg is a straight dashed line (1.2105).
 * A stop that is not located breaks the line.
 */
export function dayLines(stops: readonly MapStop[], legs: readonly DriveLeg[], day: number): Line[] {
  const own = stops.filter((stop) => stop.day === day).sort((left, right) => left.number - right.number);
  return own.slice(1).flatMap((to, index): Line[] => {
    const from = own[index];
    if (to.number !== from.number + 1) return [];
    const leg = legs.find((item) => item.day === day && item.fromSpotId === from.spotId && item.toSpotId === to.spotId);
    const reach = leg ? legReach(leg) : null;
    if (!leg || !reach || reach.kind !== "way") {
      return [{ kind: "straight", path: [[from.longitude, from.latitude], [to.longitude, to.latitude]] }];
    }
    const kind = leg.mode === "walk" ? "walk" : "road";
    const path = leg.path;
    const startGap = reach.startGapMeters > 0 && path.length > 2;
    const endGap = reach.endGapMeters > 0 && path.length > 2;
    const body = path.slice(startGap ? 1 : 0, endGap ? -1 : undefined);
    return [
      ...(startGap ? [{ kind: "straight" as const, path: path.slice(0, 2) }] : []),
      { kind, path: body },
      ...(endGap ? [{ kind: "straight" as const, path: path.slice(-2) }] : []),
    ];
  });
}

/** How a line is stroked: Leaflet polyline options, plain so they can be tested. */
export type LineStroke = {
  readonly color: string;
  readonly weight: number;
  readonly opacity: number;
  readonly dashArray?: string;
  readonly lineCap?: "round" | "butt";
};

/**
 * The strokes for one line, bottom first, in its day's colour (1.2105): a drive is a thick solid
 * line on a white casing so it stands out from the yellow roads under it, a walk a thinner
 * dotted line, and a stretch with no road a thin dashed one.
 */
export function lineStrokes(kind: Line["kind"], color: string): LineStroke[] {
  if (kind === "road") {
    return [{ color: "#ffffff", weight: 8, opacity: 0.85, lineCap: "round" }, { color, weight: 5, opacity: 0.9, lineCap: "round" }];
  }
  if (kind === "walk") return [{ color, weight: 3.5, opacity: 0.95, dashArray: "1 7", lineCap: "round" }];
  return [{ color, weight: 2.5, opacity: 0.8, dashArray: "8 8", lineCap: "butt" }];
}

/** The stops one view shows in colour: the chosen day's, or every day's for the whole trip. */
export function highlightedStops(stops: readonly MapStop[], day: number | null): MapStop[] {
  return day === null ? [...stops] : stops.filter((stop) => stop.day === day);
}

/**
 * A tile layer as the browser asks for it: from Meri's own relay, never Tianditu directly, so no
 * key reaches the page (1.2104). `vec` is the street map; `cva` its Chinese labels.
 */
export function tileUrl(layer: "vec" | "cva"): string {
  return `/api/map-tiles/${layer}/{z}/{x}/{y}`;
}

/**
 * The labels drawn over the street map: Chinese on every page for now. Tianditu's firewall
 * refused the English label tiles (eva) through the relay on 2026-11-16, and place names stay
 * Chinese on Meri's pages anyway; English labels wait until that refusal is understood.
 */
export function labelLayer(): "cva" {
  return "cva";
}

/**
 * A numbered pin as an SVG data URL: in its day's colour when the view shows that day (1.2105),
 * otherwise small, plain and grey.
 */
export function markerIcon(number: number, color: string | null): { url: string; size: number } {
  const size = color ? 28 : 18;
  const fill = color ?? fadedDayColor;
  const half = size / 2;
  const label = color
    ? `<text x="${half}" y="${half + 4.5}" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#fff">${number}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<circle cx="${half}" cy="${half}" r="${half - 1.5}" fill="${fill}" stroke="#fff" stroke-width="2"/>${label}</svg>`;
  return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, size };
}

/** The pin for a day placed only by its city, in that day's colour: a ring, so it does not read as a stop. */
export function cityIcon(color: string): { url: string; size: number } {
  const size = 30;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<circle cx="15" cy="15" r="11" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-width="2.5" stroke-dasharray="4 3"/>`
    + `<circle cx="15" cy="15" r="3" fill="${color}"/></svg>`;
  return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, size };
}
