import { z } from "zod";

import type { LocationSuggestion } from "@/domain/location/location-suggestion";
import { readyPlanSchema, type ReadyPlan } from "@/domain/plan/plan-draft-response";
import { planHandoffSchema, type PlanHandoff } from "@/domain/plan/plan-handoff";
import type { TravelChoice } from "@/domain/plan/transfer-legs";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Why filling in the origin did not go through, for the card to word. */
export type GettingThereFailure = "already_filled" | "plan_stale" | "no_plan" | "failed";

export class GettingThereRequestError extends Error {
  constructor(readonly reason: GettingThereFailure) {
    super(`Filling in the starting point failed: ${reason}`);
    this.name = "GettingThereRequestError";
  }
}

const responseSchema = z.strictObject({ handoff: planHandoffSchema, plan: readyPlanSchema });
const errorSchema = z.object({ error: z.object({ code: z.string() }) });

/**
 * A suggestion the server can take: one from Tianditu with its point. Amap's old suggestions
 * and points-less ones cannot be driven from, so the picker leaves them out.
 */
export function pickableSuggestion(suggestion: LocationSuggestion): boolean {
  return suggestion.provider === "tianditu" && suggestion.coordinates?.coordinateSystem === "CGCS2000";
}

/** Sends the picked place and the travel choice; the answer is the plan and the handoff the tab keeps (1.2107). */
export async function requestGettingThere(
  tripId: string,
  origin: LocationSuggestion,
  choice: TravelChoice | null,
  fetcher: Fetcher = fetch,
): Promise<{ handoff: PlanHandoff; plan: ReadyPlan }> {
  if (!pickableSuggestion(origin) || !origin.coordinates) throw new GettingThereRequestError("failed");
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/plan/getting-there`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: { name: origin.name, region: origin.region, coordinates: origin.coordinates },
      choice,
    }),
  });
  if (response.status === 409) {
    const code = errorSchema.safeParse(await response.json().catch(() => null)).data?.error.code;
    throw new GettingThereRequestError(code === "already_filled" || code === "plan_stale" || code === "no_plan" ? code : "failed");
  }
  if (!response.ok) throw new GettingThereRequestError("failed");
  return responseSchema.parse(await response.json());
}
