import { planHandoffResponseSchema, planHandoffSchema, type PlanHandoff, type PlanHandoffResponse } from "@/domain/plan/plan-handoff";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function requestPlanningHandoff(
  tripId: string,
  fetcher: Fetcher = fetch,
): Promise<PlanHandoffResponse> {
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/planning-handoff`, {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Planning handoff request failed.");
  return planHandoffResponseSchema.parse(await response.json());
}

function storageKey(tripId: string): string {
  return `meri:plan-handoff:v1:${tripId}`;
}

export function savePlanHandoff(tripId: string, handoff: PlanHandoff): void {
  window.sessionStorage.setItem(storageKey(tripId), JSON.stringify(handoff));
}

export function readPlanHandoff(tripId: string): PlanHandoff | null {
  try {
    const value = window.sessionStorage.getItem(storageKey(tripId));
    return value === null ? null : planHandoffSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
