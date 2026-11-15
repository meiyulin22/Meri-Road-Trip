import { daySlots, type DaySlot, type PlanDay, type PlanStop, type SpotFact } from "@/domain/plan/plan-draft";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import { planProgressEnvelopeSchema, type PlanProgressEnvelope, type PlanRunErrorCode } from "@/domain/plan/plan-progress";
import {
  latestPlanResponseSchema,
  planRunStartResponseSchema,
  type LatestPlanResponse,
  type PlanRunStartResponse,
} from "@/domain/plan/plan-run";
import type { SpotCard } from "@/domain/plan/spot-card";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type PlanDraftFailure = "journey_changed" | "unavailable" | "failed" | "time_limit" | "interrupted";

export class PlanDraftRequestError extends Error {
  constructor(readonly reason: PlanDraftFailure) {
    super(`Plan request failed: ${reason}`);
    this.name = "PlanDraftRequestError";
  }
}

function tripPath(tripId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}`;
}

/**
 * Asks for the plan of this handoff: the saved one, the run making it, or a new run.
 * The server keeps both, so a refresh asks again instead of reading this tab's storage.
 */
export async function startPlanRun(
  tripId: string,
  handoff: PlanHandoff,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<PlanRunStartResponse> {
  const response = await fetcher(`${tripPath(tripId)}/plan-runs`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(handoff),
    signal,
  });
  if (response.status === 409) throw new PlanDraftRequestError("journey_changed");
  if (!response.ok) throw new PlanDraftRequestError("failed");
  return planRunStartResponseSchema.parse(await response.json());
}

/** The trip's newest saved plan, read after a run finishes. */
export async function readLatestPlan(tripId: string, signal: AbortSignal, fetcher: Fetcher = fetch): Promise<LatestPlanResponse> {
  const response = await fetcher(`${tripPath(tripId)}/plan`, { cache: "no-store", signal });
  if (!response.ok) throw new PlanDraftRequestError("failed");
  return latestPlanResponseSchema.parse(await response.json());
}

export function planRunEventsUrl(tripId: string, runId: string): string {
  return `${tripPath(tripId)}/plan-runs/${encodeURIComponent(runId)}/events`;
}

/** One Server-Sent Event's data, or null when it is not a progress event of this run. */
export function parseProgressMessage(data: string, runId: string): PlanProgressEnvelope | null {
  try {
    const parsed = planProgressEnvelopeSchema.safeParse(JSON.parse(data));
    return parsed.success && parsed.data.runId === runId ? parsed.data : null;
  } catch {
    return null;
  }
}

/** How a run that ended without a plan is explained on the page. */
export function runFailure(errorCode: PlanRunErrorCode | null): PlanDraftFailure {
  if (errorCode === "planner_unavailable") return "unavailable";
  if (errorCode === "time_limit") return "time_limit";
  if (errorCode === "interrupted") return "interrupted";
  return "failed";
}

export type SlotGroup = { readonly slot: DaySlot; readonly stops: readonly PlanStop[] };

/** A day's stops under morning, afternoon and evening, in that order, leaving out empty slots. */
export function stopsBySlot(day: PlanDay): readonly SlotGroup[] {
  return daySlots
    .map((slot) => ({ slot, stops: day.stops.filter((stop) => stop.slot === slot) }))
    .filter(({ stops }) => stops.length > 0);
}

/** The facts shown on a stop, in reading order, each with its source when one exists. */
export const shownFacts = ["opening", "reservation", "suggestedDuration", "walking", "setting"] as const satisfies readonly SpotFact[];

export function sourcedFacts(card: SpotCard) {
  return shownFacts.flatMap((fact) => card[fact] ? [{ fact, evidence: card[fact] }] : []);
}

/** Hostname for a source line: a full URL is noise beside a short quote. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
}
