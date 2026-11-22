import { parseExactDate, parseExactDays } from "@/domain/trip-state/trip-dates";
import type { TripState } from "@/domain/trip-state/trip-state";

export type MissingTripField = "dates" | "transport";

/**
 * Which facts a plan uses are still empty, for the buttons under Meri's newest plain reply (2026-11-22).
 * Decided by code from TripState, never by the model: dates count as missing until the start and the
 * length are both exact; the way of travelling until it is set at all.
 */
export function missingTripFields(state: TripState): MissingTripField[] {
  const missing: MissingTripField[] = [];
  if (parseExactDate(state.startDate) === null || parseExactDays(state.duration) === null) missing.push("dates");
  if (state.transportPreference.state === "missing") missing.push("transport");
  return missing;
}
