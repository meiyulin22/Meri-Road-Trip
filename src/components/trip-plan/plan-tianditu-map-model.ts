import type { Locale } from "@/domain/locale/locale";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";

/** One stop the map can draw: its day, its number within the day, and where Tianditu put it. */
export type MapStop = {
  readonly day: number;
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
  return plan.draft.days.flatMap(({ day, stops }) => stops.flatMap(({ spotId }, index) => {
    const card = cards.get(spotId);
    const point = card?.mapCheck.status === "located" ? card.mapCheck.point : null;
    return card && point ? [{ day, number: index + 1, name: card.name, longitude: point.longitude, latitude: point.latitude }] : [];
  }));
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
