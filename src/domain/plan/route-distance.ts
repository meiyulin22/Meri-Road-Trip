import { type GeoPoint, kmBetween } from "./weather";

/**
 * How far a route of cities runs (1.2117), measured in straight lines between city centres: from
 * the origin when it is known, through the cities in order, and back to it. Straight lines are
 * enough to compare one order with another; the real travel is looked up later.
 */
export function pathKm(stops: readonly GeoPoint[], origin: GeoPoint | null): number {
  const path = origin ? [origin, ...stops, origin] : stops;
  let total = 0;
  for (let index = 1; index < path.length; index += 1) total += kmBetween(path[index - 1], path[index]);
  return total;
}

/** Up to this many cities every order is tried (8! = 40,320); more use nearest-first with 2-opt. */
export const exactUpTo = 8;

export function permutations(count: number): number[][] {
  if (count <= 1) return [Array.from({ length: count }, (_, index) => index)];
  const result: number[][] = [];
  for (const rest of permutations(count - 1)) {
    for (let at = 0; at <= rest.length; at += 1) result.push([...rest.slice(0, at), count - 1, ...rest.slice(at)]);
  }
  return result;
}

function nearestFirst(points: readonly GeoPoint[], origin: GeoPoint | null): number[] {
  const left = new Set(points.map((_, index) => index));
  const order: number[] = [];
  let at = origin ?? points[0];
  if (!origin) {
    order.push(0);
    left.delete(0);
  }
  while (left.size > 0) {
    const next = [...left].reduce((best, index) => kmBetween(at, points[index]) < kmBetween(at, points[best]) ? index : best);
    order.push(next);
    left.delete(next);
    at = points[next];
  }
  return order;
}

/** Reverses stretches of the order while that shortens it. */
function twoOpt(order: number[], points: readonly GeoPoint[], origin: GeoPoint | null): number[] {
  let best = order;
  let bestKm = pathKm(best.map((index) => points[index]), origin);
  let improved = true;
  while (improved) {
    improved = false;
    for (let from = 0; from < best.length - 1; from += 1) {
      for (let to = from + 1; to < best.length; to += 1) {
        const candidate = [...best.slice(0, from), ...best.slice(from, to + 1).reverse(), ...best.slice(to + 1)];
        const km = pathKm(candidate.map((index) => points[index]), origin);
        if (km < bestKm - 1e-9) {
          best = candidate;
          bestKm = km;
          improved = true;
        }
      }
    }
  }
  return best;
}

/** The order of the points that makes the shortest route, as their indexes, and its length. */
export function shortestOrder(points: readonly GeoPoint[], origin: GeoPoint | null): { order: number[]; km: number } {
  const orders = points.length <= exactUpTo
    ? permutations(points.length)
    : [twoOpt(nearestFirst(points, origin), points, origin)];
  let best = orders[0];
  let bestKm = pathKm(best.map((index) => points[index]), origin);
  for (const order of orders.slice(1)) {
    const km = pathKm(order.map((index) => points[index]), origin);
    if (km < bestKm - 1e-9) {
      best = order;
      bestKm = km;
    }
  }
  return { order: best, km: bestKm };
}

/** A route may run this much longer than the shortest order for the sake of weather (agreed 2026-11-20). */
export const maxDetourRatio = 1.3;
