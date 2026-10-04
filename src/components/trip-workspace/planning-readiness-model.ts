import { z } from "zod";

import type { Messages } from "@/components/i18n/messages";
import type { GeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";

const readinessSchema = z.discriminatedUnion("canProceed", [
  z.object({ canProceed: z.literal(true), destination: z.literal("selected") }),
  z.object({
    canProceed: z.literal(false),
    reason: z.enum([
      "destination_missing",
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

export function planningReadinessMessage(readiness: GeneratePlanReadiness, text: Messages["generatePlan"]): string {
  if (readiness.canProceed) {
    return text.ready;
  }

  switch (readiness.reason) {
    case "destination_missing":
      return text.needsDestination;
    case "destination_unverified":
      return text.needsReverify;
  }
}
