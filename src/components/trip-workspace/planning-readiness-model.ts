import { z } from "zod";

import type { GeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { TripState } from "@/domain/trip-state/trip-state";
import { evaluateGeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";

const readinessSchema = z.discriminatedUnion("canProceed", [
  z.object({ canProceed: z.literal(true), destination: z.literal("selected") }),
  z.object({
    canProceed: z.literal(false),
    reason: z.enum([
      "destination_missing",
      "destination_area_only",
      "destination_unverified",
    ]),
  }),
]);

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function requestPlanningReadiness(
  tripId: string,
  fetcher: Fetcher = fetch,
): Promise<GeneratePlanReadiness> {
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/planning-readiness`, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Planning readiness request failed.");
  return readinessSchema.parse(await response.json());
}

export function planningReadinessMessage(readiness: GeneratePlanReadiness): string {
  if (readiness.canProceed) {
    return "目的地已选定。规划功能尚未开放。";
  }

  switch (readiness.reason) {
    case "destination_missing":
      return "请先在上方添加目的地。";
    case "destination_area_only":
      return "这个范围还比较大，先确定想去的城市或地点。";
    case "destination_unverified":
      return "旧旅程中的目的地尚未核验，请在目的地里重新搜索并添加。";
  }
}

/**
 * Whether offering Generate plan is meaningful yet: the destination has to name a
 * place. A destination that is still only a province has nothing to plan around,
 * and whether a provider can find a single named place is the endpoint's answer
 * rather than this one — this only decides whether asking is worth the user's click.
 */
export function canRequestPlanGeneration(tripState: TripState): boolean {
  return evaluateGeneratePlanReadiness(tripState).canProceed;
}

export function shouldHighlightMissingDestination(
  readiness: { readonly destinationKey: string; readonly result: GeneratePlanReadiness } | null,
  currentDestinationKey: string,
): boolean {
  return readiness?.destinationKey === currentDestinationKey &&
    !readiness.result.canProceed &&
    readiness.result.reason === "destination_missing";
}
