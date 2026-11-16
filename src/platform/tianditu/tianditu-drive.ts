import type { TiandituClient, TiandituFailure } from "./tianditu-fetch";

/** One driving leg as Tianditu plans it: how far, how long, and the road it follows. */
export type DriveRoute = {
  readonly distanceKm: number;
  readonly durationSeconds: number;
  /** Longitude, latitude pairs along the road, thinned to at most `maxPathPoints`. */
  readonly path: readonly (readonly [number, number])[];
};

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

/** Every n-th point, always keeping the first and the last. */
export function thinPath<T>(points: readonly T[], max: number = maxPathPoints): T[] {
  if (points.length <= max) return [...points];
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => points[Math.round(index * step)]);
}

/**
 * The three values Meri uses from the drive service's XML: `<distance>` in kilometres,
 * `<duration>` in seconds and `<routelatlon>`, written "lng,lat;lng,lat;…;" (measured
 * 2026-11-16). Anything missing or not a number is no route, never a guess.
 */
export function parseDriveXml(xml: string): DriveRoute | null {
  const distance = tag(xml, "distance");
  const duration = tag(xml, "duration");
  const line = tag(xml, "routelatlon");
  // Number("") and Number(null) are 0, so a missing value is checked before it is read.
  if (!distance || !duration || !line) return null;
  const distanceKm = Number(distance);
  const durationSeconds = Number(duration);
  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationSeconds) || distanceKm < 0 || durationSeconds < 0) return null;
  const path: [number, number][] = [];
  for (const pair of line.split(";")) {
    if (!pair.trim()) continue;
    const [longitude, latitude] = pair.split(",").map(Number);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    path.push([longitude, latitude]);
  }
  return path.length >= 2 ? { distanceKm, durationSeconds, path: thinPath(path) } : null;
}

const coordinate = ({ longitude, latitude }: LonLat) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`;

/** One fastest-route lookup between two points (style 0). Never throws. */
export function createTiandituDrive(client: TiandituClient): (from: LonLat, to: LonLat) => Promise<DriveAnswer> {
  return async (from, to) => {
    const answer = await client.getXml("/drive", {
      postStr: JSON.stringify({ orig: coordinate(from), dest: coordinate(to), style: "0" }),
      type: "search",
    });
    if (!answer.ok) return { status: "failure", reason: answer.reason };
    const route = parseDriveXml(answer.xml);
    return route ? { status: "success", route } : { status: "failure", reason: "no_route" };
  };
}
