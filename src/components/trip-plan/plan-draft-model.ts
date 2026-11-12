import { z } from "zod";

import { daySlots, type DaySlot, type PlanDay, type PlanStop, type SpotFact } from "@/domain/plan/plan-draft";
import { planDraftResponseSchema, type PlanDraftResponse } from "@/domain/plan/plan-draft-response";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import type { SpotCard } from "@/domain/plan/spot-card";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type PlanDraftFailure = "journey_changed" | "unavailable" | "failed";

export class PlanDraftRequestError extends Error {
  constructor(readonly reason: PlanDraftFailure) {
    super(`Plan draft request failed: ${reason}`);
    this.name = "PlanDraftRequestError";
  }
}

export async function requestPlanDraft(
  tripId: string,
  handoff: PlanHandoff,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<PlanDraftResponse> {
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/plan-draft`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(handoff),
    signal,
  });
  if (response.status === 409) throw new PlanDraftRequestError("journey_changed");
  if (response.status === 503 || response.status === 504) throw new PlanDraftRequestError("unavailable");
  if (!response.ok) throw new PlanDraftRequestError("failed");
  return planDraftResponseSchema.parse(await response.json());
}

const storedDraftSchema = z.object({ handoff: z.string(), draft: z.unknown() });

function storageKey(tripId: string): string {
  return `meri:plan-draft:v1:${tripId}`;
}

/**
 * The draft lives beside its handoff in this tab, so a refresh shows it again without
 * another research run. A new Generate plan writes a new handoff, which the stored draft
 * no longer matches.
 */
export function savePlanDraft(tripId: string, handoff: PlanHandoff, draft: PlanDraftResponse): void {
  try {
    window.sessionStorage.setItem(storageKey(tripId), JSON.stringify({ handoff: JSON.stringify(handoff), draft }));
  } catch {
    // A full or blocked storage only costs a new run after a refresh.
  }
}

export function readPlanDraft(tripId: string, handoff: PlanHandoff): PlanDraftResponse | null {
  try {
    const value = window.sessionStorage.getItem(storageKey(tripId));
    if (value === null) return null;
    const stored = storedDraftSchema.parse(JSON.parse(value));
    if (stored.handoff !== JSON.stringify(handoff)) return null;
    return planDraftResponseSchema.parse(stored.draft);
  } catch {
    return null;
  }
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
