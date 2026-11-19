import { daySlots, type DaySlot, type PlanDay, type PlanStop, type SpotFact } from "@/domain/plan/plan-draft";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import { planProgressEnvelopeSchema, type PlanProgressEnvelope, type PlanRunErrorCode } from "@/domain/plan/plan-progress";
import {
  latestPlanResponseSchema,
  planRunStartResponseSchema,
  type LatestPlanResponse,
  type PlanAnswer,
  type PlanRunStartResponse,
} from "@/domain/plan/plan-run";
import type { SpotCard } from "@/domain/plan/spot-card";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type PlanDraftFailure = "journey_changed" | "unavailable" | "failed" | "time_limit" | "interrupted"
  // The site's limits (step 2): today's plans are used up, Kimi's money is spent, or paid calls are off.
  | "daily_runs" | "daily_quota" | "paid_calls_paused";

/** Limits a retry today cannot get past, so the page offers no retry button. */
export const limitFailures: readonly PlanDraftFailure[] = ["daily_runs", "daily_quota", "paid_calls_paused"];

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

/** A run's event stream; after answering, a new connection starts after the last event seen. */
export function planRunEventsUrl(tripId: string, runId: string, after = 0): string {
  const url = `${tripPath(tripId)}/plan-runs/${encodeURIComponent(runId)}/events`;
  return after > 0 ? `${url}?after=${after}` : url;
}

/** Answers the question a run waits on: an option's label, null to let Meri decide, or the traveller's own words. */
export async function answerPlanQuestion(
  tripId: string,
  runId: string,
  answer: PlanAnswer,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const response = await fetcher(`${tripPath(tripId)}/plan-runs/${encodeURIComponent(runId)}/answer`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answer),
    signal,
  });
  if (!response.ok) throw new PlanDraftRequestError("failed");
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
  if (errorCode === "daily_quota") return "daily_quota";
  if (errorCode === "paid_calls_paused") return "paid_calls_paused";
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
