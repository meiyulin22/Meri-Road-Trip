import type { DriveLeg, PlanDay } from "@/domain/plan/plan-draft";
import type { SpotCard } from "@/domain/plan/spot-card";
import { logger } from "@/platform/observability/logger";
import type { DriveAnswer, DriveRoute, LonLat } from "@/platform/tianditu/tianditu-drive";

/** About five days of four stops; a plan's legs beyond this stay straight lines on the map. */
export const maxDriveLookups = 20;

export type DriveLegDependencies = {
  /** One Tianditu drive lookup. It must not retry. */
  readonly drive: (from: LonLat, to: LonLat) => Promise<DriveAnswer>;
  readonly memory: {
    get(key: string): DriveRoute | null;
    set(key: string, route: DriveRoute): void;
  };
  /** The cache key for two points; the platform's driveLegKey. */
  readonly key: (from: LonLat, to: LonLat) => string;
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

function legOf(day: number, from: SpotCard, to: SpotCard, route: DriveRoute): DriveLeg {
  return {
    day,
    fromSpotId: from.id,
    toSpotId: to.id,
    distanceKm: Math.round(route.distanceKm * 10) / 10,
    durationMinutes: Math.max(1, Math.round(route.durationSeconds / 60)),
    path: route.path,
  };
}

/**
 * The fastest road between each pair of neighbouring stops in a day, where both stops were
 * located (1.2102). Legs already planned come from memory. Like the map check, the first
 * failed lookup stops the rest with no retry; those legs stay straight lines, with their
 * drive time unknown. Between cities nothing is looked up yet.
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
    return from && to && start && end ? [{ day, from, to, start, end }] : [];
  }));
  const legs: DriveLeg[] = [];
  let lookups = 0;
  let stopped = false;
  for (const [index, { day, from, to, start, end }] of pairs.entries()) {
    onProgress({ from: from.name, to: to.name, done: index + 1, total: pairs.length });
    const key = deps.key(start, end);
    const remembered = deps.memory.get(key);
    if (remembered) {
      legs.push(legOf(day, from, to, remembered));
      continue;
    }
    if (stopped || lookups >= maxDriveLookups) continue;
    lookups += 1;
    const answer = await deps.drive(start, end);
    if (answer.status === "failure") {
      // A road Tianditu cannot plan is not a refusal: only that leg stays unknown.
      if (answer.reason === "no_route") continue;
      stopped = true;
      logger.warn({ from: from.name, to: to.name, reason: answer.reason, lookups }, "Tianditu drive lookups stopped at a failed lookup");
      continue;
    }
    deps.memory.set(key, answer.route);
    legs.push(legOf(day, from, to, answer.route));
  }
  return { legs, status: stopped ? "stopped" : "complete", lookups };
}
