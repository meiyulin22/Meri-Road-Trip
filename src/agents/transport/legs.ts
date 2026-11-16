import { type DriveLeg, type PlanDay, walkWithinKm } from "@/domain/plan/plan-draft";
import type { SpotCard } from "@/domain/plan/spot-card";
import { logger } from "@/platform/observability/logger";
import { type DriveAnswer, type DriveRoute, type LonLat, metresBetween, type TravelMode } from "@/platform/tianditu/tianditu-drive";

/** About five days of four stops; legs beyond this stay straight lines on the map. */
export const maxDriveLookups = 20;
/**
 * Tianditu's walking time is not a walking pace (measured 2026-11-16: 1.03 km in 261 s, about
 * 14 km/h), so a walk's minutes come from its distance at an easy pace instead.
 */
const walkingKmPerHour = 4.5;

export type DriveLegDependencies = {
  /** One Tianditu route lookup, on foot or by road. It must not retry. */
  readonly drive: (from: LonLat, to: LonLat, mode: TravelMode) => Promise<DriveAnswer>;
  readonly memory: {
    get(key: string): DriveRoute | null;
    set(key: string, route: DriveRoute): void;
  };
  /** The cache key for a mode and two points; the platform's driveLegKey. */
  readonly key: (from: LonLat, to: LonLat, mode: TravelMode) => string;
};

export type DriveProgress = (progress: { from: string; to: string; done: number; total: number }) => void;

export type DriveLegsOutcome = {
  readonly legs: DriveLeg[];
  readonly status: "complete" | "stopped";
  readonly lookups: number;
};

function pointOf(card: SpotCard | undefined): LonLat | null {
  return card?.mapCheck.status === "located" ? card.mapCheck.point : null;
}

const pair = ({ longitude, latitude }: LonLat): [number, number] => [longitude, latitude];

/** Close stops are walked, the rest driven: decided by distance, never by the model. */
export function travelModeFor(from: LonLat, to: LonLat): TravelMode {
  return metresBetween(pair(from), pair(to)) / 1_000 <= walkWithinKm ? "walk" : "drive";
}

function legOf(day: number, from: SpotCard, to: SpotCard, mode: TravelMode, route: DriveRoute): DriveLeg {
  const minutes = mode === "walk" ? route.distanceKm / walkingKmPerHour * 60 : route.durationSeconds / 60;
  return {
    day,
    fromSpotId: from.id,
    toSpotId: to.id,
    mode,
    distanceKm: Math.round(route.distanceKm * 10) / 10,
    durationMinutes: Math.max(1, Math.round(minutes)),
    path: route.path,
    offRoadStartMeters: route.offRoadStartMeters,
    offRoadEndMeters: route.offRoadEndMeters,
  };
}

/** A pair the map has no way between: the straight line, with no time, said plainly. */
function noWayLeg(day: number, from: SpotCard, to: SpotCard, start: LonLat, end: LonLat): DriveLeg {
  return {
    day, fromSpotId: from.id, toSpotId: to.id, mode: "none",
    distanceKm: Math.round(metresBetween(pair(start), pair(end)) / 100) / 10,
    durationMinutes: 0,
    path: [pair(start), pair(end)],
  };
}

/**
 * The way between each pair of neighbouring stops in a day, where both stops were located:
 * on foot when they are close, by the fastest road otherwise (1.2103). Legs already planned
 * come from memory. Like the map check, the first failed lookup stops the rest with no retry;
 * those legs stay straight lines with their time unknown. A pair Tianditu finds no way
 * between becomes a `none` leg rather than a guessed time. Between cities nothing is looked up.
 */
export async function planDriveLegs(
  days: readonly PlanDay[],
  cards: ReadonlyMap<string, SpotCard>,
  deps: DriveLegDependencies,
  onProgress: DriveProgress = () => {},
): Promise<DriveLegsOutcome> {
  const pairs = days.flatMap(({ day, stops }) => stops.slice(1).flatMap(({ spotId }, index) => {
    const from = cards.get(stops[index].spotId);
    const to = cards.get(spotId);
    const start = pointOf(from);
    const end = pointOf(to);
    return from && to && start && end ? [{ day, from, to, start, end, mode: travelModeFor(start, end) }] : [];
  }));
  const legs: DriveLeg[] = [];
  let lookups = 0;
  let stopped = false;
  for (const [index, { day, from, to, start, end, mode }] of pairs.entries()) {
    onProgress({ from: from.name, to: to.name, done: index + 1, total: pairs.length });
    const key = deps.key(start, end, mode);
    const remembered = deps.memory.get(key);
    if (remembered) {
      legs.push(legOf(day, from, to, mode, remembered));
      continue;
    }
    if (stopped || lookups >= maxDriveLookups) continue;
    lookups += 1;
    const answer = await deps.drive(start, end, mode);
    if (answer.status === "failure") {
      // No way on the map is an answer about this pair, not a refusal: the rest go on.
      if (answer.reason === "no_route") {
        legs.push(noWayLeg(day, from, to, start, end));
        continue;
      }
      stopped = true;
      logger.warn({ from: from.name, to: to.name, reason: answer.reason, lookups }, "Tianditu route lookups stopped at a failed lookup");
      continue;
    }
    deps.memory.set(key, answer.route);
    legs.push(legOf(day, from, to, mode, answer.route));
  }
  return { legs, status: stopped ? "stopped" : "complete", lookups };
}
