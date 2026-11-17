import type { TransferEstimate, TransferLeg } from "@/domain/plan/transfer-legs";
import { logger } from "@/platform/observability/logger";
import type { CityPoint, CityPointAnswer } from "@/platform/tianditu/tianditu-city-point";
import type { DriveRoute } from "@/platform/tianditu/tianditu-drive";

import type { DriveLegDependencies, DriveProgress } from "./legs";

/**
 * Tianditu requests a plan may spend on its transfers: a centre for each place and a drive for
 * each leg. Ten cities and an origin need at most 21; most trips need five or six, fewer once
 * the cities are remembered.
 */
export const maxTransferLookups = 24;

export type TransferDependencies = {
  /** One Tianditu search for a place's centre. It must not retry. */
  readonly cityPoint: (name: string) => Promise<CityPointAnswer>;
  readonly cityMemory: {
    get(name: string): CityPoint | null;
    set(name: string, city: CityPoint): void;
  };
  /** The same drive lookup, cache and key as the legs between stops. */
  readonly drive: DriveLegDependencies;
};

export type TransfersOutcome = {
  readonly legs: TransferLeg[];
  readonly status: "complete" | "stopped";
  readonly lookups: number;
};

function estimated(route: DriveRoute): TransferEstimate {
  return {
    status: "estimated",
    distanceKm: Math.round(route.distanceKm),
    durationMinutes: Math.max(1, Math.round(route.durationSeconds / 60)),
    path: route.path,
  };
}

/** The same two places the other way round: roads between two cities run both ways. */
function reversed(estimate: TransferEstimate): TransferEstimate {
  return estimate.status === "estimated" ? { ...estimate, path: [...estimate.path].reverse() } : estimate;
}

/**
 * A rough drive for every leg still to be looked up (1.2106), from the centre of one place to
 * the centre of the next: code's estimate, and later the transport agent's fallback when it finds
 * no train or flight. When the trip ends in the city it began, the way back is the way there
 * reversed and is not asked again. Places and drives already looked up come
 * from memory. Like every Tianditu lookup in a run, the first failure stops the rest with no
 * retry, and the legs left say "not looked up" instead of a guess.
 */
export async function planTransfers(
  legs: readonly TransferLeg[],
  deps: TransferDependencies,
  onProgress: DriveProgress = () => {},
): Promise<TransfersOutcome> {
  let lookups = 0;
  let stopped = false;
  const places = new Map<string, CityPoint | "not_found">();

  /** A place's centre, "not_found", or null when it could not be asked. */
  async function placeOf(name: string): Promise<CityPoint | "not_found" | null> {
    const known = places.get(name);
    if (known) return known;
    const remembered = deps.cityMemory.get(name);
    if (remembered) {
      places.set(name, remembered);
      return remembered;
    }
    if (stopped || lookups >= maxTransferLookups) return null;
    lookups += 1;
    const answer = await deps.cityPoint(name);
    if (answer.status === "failure") {
      stopped = true;
      logger.warn({ place: name, reason: answer.reason, lookups }, "Tianditu transfer lookups stopped at a failed place search");
      return null;
    }
    if (answer.status === "not_found") {
      places.set(name, "not_found");
      return "not_found";
    }
    deps.cityMemory.set(name, answer.city);
    places.set(name, answer.city);
    return answer.city;
  }

  async function estimate(from: string, to: string): Promise<TransferEstimate> {
    const start = await placeOf(from);
    const end = await placeOf(to);
    if (start === "not_found") return { status: "not_found", place: from };
    if (end === "not_found") return { status: "not_found", place: to };
    if (start === null || end === null) return { status: "not_looked_up" };
    if (start.adminCode === end.adminCode) return { status: "same_city" };
    const key = deps.drive.key(start.point, end.point, "drive");
    const remembered = deps.drive.memory.get(key);
    if (remembered) return estimated(remembered);
    if (stopped || lookups >= maxTransferLookups) return { status: "not_looked_up" };
    lookups += 1;
    const answer = await deps.drive.drive(start.point, end.point, "drive");
    if (answer.status === "success") {
      deps.drive.memory.set(key, answer.route);
      return estimated(answer.route);
    }
    // No road on the map is an answer about these two places, not a refusal: the rest go on.
    if (answer.reason === "no_route") return { status: "no_route" };
    stopped = true;
    logger.warn({ from, to, reason: answer.reason, lookups }, "Tianditu transfer lookups stopped at a failed drive");
    return { status: "not_looked_up" };
  }

  const outbound = legs.find(({ kind }) => kind === "outbound");
  const backAgain = (leg: TransferLeg) => leg.kind === "return" && outbound !== undefined
    && outbound.estimate.status === "not_looked_up" && outbound.from === leg.to && outbound.to === leg.from;
  const toLookUp = legs.filter((leg) => leg.estimate.status === "not_looked_up" && !backAgain(leg));

  const done: TransferLeg[] = [];
  for (const leg of legs) {
    if (leg.estimate.status !== "not_looked_up" || leg.from === null || leg.to === null) {
      done.push(leg);
      continue;
    }
    if (backAgain(leg)) {
      const there = done.find(({ kind }) => kind === "outbound");
      done.push({ ...leg, estimate: there ? reversed(there.estimate) : leg.estimate });
      continue;
    }
    onProgress({ from: leg.from, to: leg.to, done: toLookUp.indexOf(leg) + 1, total: toLookUp.length });
    done.push({ ...leg, estimate: await estimate(leg.from, leg.to) });
  }
  return { legs: done, status: stopped ? "stopped" : "complete", lookups };
}
