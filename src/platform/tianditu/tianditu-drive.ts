import type { TiandituClient, TiandituFailure } from "./tianditu-fetch";

/** One leg as Tianditu plans it: how far, how long, and the road it follows. */
export type DriveRoute = {
  readonly distanceKm: number;
  readonly durationSeconds: number;
  /** Longitude, latitude pairs along the road, thinned to at most `maxPathPoints`. */
  readonly path: readonly (readonly [number, number])[];
  /**
   * The straight stretch Tianditu adds where its roads stop short of a point, measured before
   * thinning (1.2103): the answer always starts at the point asked and ends at the point asked,
   * so a long first or last segment is ground the map has no road across (a lake, a mountain top).
   */
  readonly offRoadStartMeters: number;
  readonly offRoadEndMeters: number;
};

/** Tianditu's style 0 is the fastest road; style 3 is on foot. */
export type TravelMode = "drive" | "walk";

export type DriveAnswer =
  | { readonly status: "success"; readonly route: DriveRoute }
  | { readonly status: "failure"; readonly reason: TiandituFailure | "no_route" };

export type LonLat = { readonly longitude: number; readonly latitude: number };

/** Enough to draw a city leg smoothly; a long road keeps its shape, a plan stays small. */
export const maxPathPoints = 200;

function tag(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}>([^<]*)</${name}>`, "u").exec(xml);
  return match ? match[1].trim() : null;
}

/** Great-circle distance in metres; fine for the short distances inside a city. */
export function metresBetween([lon1, lat1]: readonly [number, number], [lon2, lat2]: readonly [number, number]): number {
  const radians = Math.PI / 180;
  const dLat = (lat2 - lat1) * radians;
  const dLon = (lon2 - lon1) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

/** Every n-th point, always keeping the first and the last. */
export function thinPath<T>(points: readonly T[], max: number = maxPathPoints): T[] {
  if (points.length <= max) return [...points];
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => points[Math.round(index * step)]);
}

/**
 * The three values Meri uses from the drive service's XML: `<distance>` in kilometres,
 * `<duration>` in seconds and `<routelatlon>`, written "lng,lat;lng,lat;…;" (measured
 * 2026-11-16). Anything missing or not a number is no route, never a guess. Neither is a
 * distance or duration of 0: that is how Tianditu says it found no way, with only the two
 * points asked as the line (measured 2026-11-16, on foot from 双廊 to 南诏风情岛).
 */
export function parseDriveXml(xml: string): DriveRoute | null {
  const distance = tag(xml, "distance");
  const duration = tag(xml, "duration");
  const line = tag(xml, "routelatlon");
  // Number("") and Number(null) are 0, so a missing value is checked before it is read.
  if (!distance || !duration || !line) return null;
  const distanceKm = Number(distance);
  const durationSeconds = Number(duration);
  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationSeconds) || distanceKm <= 0 || durationSeconds <= 0) return null;
  const path: [number, number][] = [];
  for (const pair of line.split(";")) {
    if (!pair.trim()) continue;
    const [longitude, latitude] = pair.split(",").map(Number);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    path.push([longitude, latitude]);
  }
  if (path.length < 2) return null;
  return {
    distanceKm,
    durationSeconds,
    path: thinPath(path),
    offRoadStartMeters: Math.round(metresBetween(path[0], path[1])),
    offRoadEndMeters: Math.round(metresBetween(path[path.length - 2], path[path.length - 1])),
  };
}

const coordinate = ({ longitude, latitude }: LonLat) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`;

/** One route lookup between two points, the fastest road or on foot. Never throws. */
export function createTiandituDrive(client: TiandituClient): (from: LonLat, to: LonLat, mode: TravelMode) => Promise<DriveAnswer> {
  return async (from, to, mode) => {
    const answer = await client.getXml("/drive", {
      postStr: JSON.stringify({ orig: coordinate(from), dest: coordinate(to), style: mode === "walk" ? "3" : "0" }),
      type: "search",
    });
    if (!answer.ok) return { status: "failure", reason: answer.reason };
    const route = parseDriveXml(answer.xml);
    return route ? { status: "success", route } : { status: "failure", reason: "no_route" };
  };
}
