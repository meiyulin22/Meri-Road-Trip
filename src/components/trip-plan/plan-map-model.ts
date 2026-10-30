import type { LonLat } from "./plan-view";

/**
 * The sketch map's geometry: a flat projection of the Lijiang–Dali area and how to frame
 * a set of places in a box. Stands in for Tianditu at the design stage; the page passes
 * places by longitude and latitude, so swapping in a real map changes only the drawing.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Map units per degree; longitude is narrowed by cos(26°) so shapes keep their proportions. */
const unit = 1000;
const lonScale = unit * Math.cos((26 * Math.PI) / 180);

export function project([lon, lat]: LonLat): Point {
  return { x: (lon - 99.9) * lonScale, y: (27.4 - lat) * unit };
}

export interface View {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/**
 * The view that fits all the points in a width × height box with `pad` pixels to spare,
 * centred. A tight group (one town) is not zoomed in further than `maxScale`.
 */
export function fitView(points: readonly Point[], width: number, height: number, pad: number, maxScale = 3): View {
  if (points.length === 0 || width <= 0 || height <= 0) return { scale: 1, x: 0, y: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const room = { x: Math.max(1, width - pad * 2), y: Math.max(1, height - pad * 2) };
  const scale = Math.min(maxScale, room.x / Math.max(1, right - left), room.y / Math.max(1, bottom - top));
  return { scale, x: width / 2 - ((left + right) / 2) * scale, y: height / 2 - ((top + bottom) / 2) * scale };
}

export function onScreen(point: Point, view: View): Point {
  return { x: point.x * view.scale + view.x, y: point.y * view.scale + view.y };
}

/** A view part way from one to another, for the camera's glide between days. */
export function between(from: View, to: View, amount: number): View {
  const at = (a: number, b: number) => a + (b - a) * amount;
  return { scale: at(from.scale, to.scale), x: at(from.x, to.x), y: at(from.y, to.y) };
}

/** Roughly drawn landmarks: enough to recognise the area, not survey data. */
export const geography = {
  lakes: [
    {
      name: "洱海",
      shape: [[100.22, 25.61], [100.2, 25.66], [100.19, 25.72], [100.175, 25.8], [100.155, 25.87], [100.145, 25.93], [100.155, 25.97],
        [100.18, 25.965], [100.205, 25.93], [100.222, 25.86], [100.24, 25.79], [100.258, 25.71], [100.268, 25.64], [100.25, 25.6]] as LonLat[],
      label: [100.215, 25.78] as LonLat,
    },
    {
      name: "拉市海",
      shape: [[100.1, 26.86], [100.115, 26.885], [100.14, 26.89], [100.155, 26.875], [100.145, 26.855], [100.12, 26.85]] as LonLat[],
      label: [100.128, 26.871] as LonLat,
    },
  ],
  ridges: [
    { name: "玉龙雪山", line: [[100.165, 27.2], [100.18, 27.15], [100.19, 27.1], [100.2, 27.05], [100.21, 27.0]] as LonLat[], label: [100.155, 27.13] as LonLat },
    { name: "苍山", line: [[100.08, 25.95], [100.09, 25.88], [100.1, 25.8], [100.11, 25.73], [100.115, 25.66]] as LonLat[], label: [100.06, 25.8] as LonLat },
  ],
  roads: [
    // Dali–Lijiang expressway, roughly.
    [[100.233, 26.874], [100.25, 26.72], [100.2, 26.56], [100.15, 26.32], [100.08, 26.12], [100.12, 25.97], [100.131, 25.852], [100.15, 25.75], [100.163, 25.693]],
    // Lijiang up to the snow mountain.
    [[100.233, 26.874], [100.22, 26.95], [100.215, 27.02], [100.205, 27.103], [100.236, 27.122]],
    // Round the north of Erhai to Shuanglang, and Dali to the airport.
    [[100.131, 25.852], [100.14, 25.94], [100.17, 25.975], [100.203, 25.915]],
    [[100.163, 25.693], [100.2, 25.6], [100.27, 25.6], [100.319, 25.649]],
  ] as LonLat[][],
  towns: [
    { name: "丽江", point: [100.233, 26.874] as LonLat },
    { name: "大理", point: [100.163, 25.693] as LonLat },
  ],
} as const;
