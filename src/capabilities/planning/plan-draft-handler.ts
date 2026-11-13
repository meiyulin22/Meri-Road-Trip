import { randomUUID } from "node:crypto";

import type { PhotoSubject } from "@/capabilities/destination/place-images";
import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import type { PlaceImage } from "@/domain/location/place-image";
import { allocateDays, type PlanDay } from "@/domain/plan/plan-draft";
import type { PlanDraftResponse } from "@/domain/plan/plan-draft-response";
import { planHandoffSchema, type PlanHandoff } from "@/domain/plan/plan-handoff";
import type { CityResearch } from "@/domain/plan/spot-card";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { logger } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";

import type { MapCheckOutcome } from "@/agents/planner/map-check";
import type { PlanDraftResult } from "@/agents/planner/plan-agent";

type PlanDraftDependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly research: (handoff: PlanHandoff) => Promise<{ cities: readonly CityResearch[]; pendingProvinces: readonly string[] }>;
  readonly checkMap: (cities: readonly CityResearch[]) => Promise<MapCheckOutcome>;
  readonly draft: (handoff: PlanHandoff, research: readonly CityResearch[]) => Promise<PlanDraftResult>;
  readonly findImage: (subject: PhotoSubject) => Promise<PlaceImage | null>;
};

/**
 * One photo per day: a stop of that day first, then its city, preferring a photo no
 * earlier day shows. Two days in one city may share the city's photo rather than go
 * without one.
 */
export async function dayPhotos(
  days: readonly PlanDay[],
  nameOf: (spotId: string) => string | null,
  findImage: PlanDraftDependencies["findImage"],
): Promise<{ day: number; image: PlaceImage }[]> {
  const used = new Set<string>();
  const photos: { day: number; image: PlaceImage }[] = [];
  for (const day of days) {
    const subjects: PhotoSubject[] = [
      ...day.stops.flatMap(({ spotId }) => {
        const spot = nameOf(spotId);
        return spot ? [{ province: day.province, place: day.city, spot }] : [];
      }),
      { province: day.province, place: day.city, spot: null },
    ];
    let fallback: PlaceImage | null = null;
    let chosen: PlaceImage | null = null;
    for (const subject of subjects) {
      const image = await findImage(subject);
      if (!image) continue;
      fallback ??= image;
      if (!used.has(image.url)) {
        chosen = image;
        break;
      }
    }
    const image = chosen ?? fallback;
    if (!image) continue;
    used.add(image.url);
    photos.push({ day: day.day, image });
  }
  return photos;
}

function noStore(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function failure(status: number, code: string, message: string): Response {
  return noStore({ error: { code, message } }, status);
}

/**
 * Researches and drafts the days for the plan page. The browser sends the handoff it
 * holds; the saved TripState stays authoritative, so a handoff that no longer matches it
 * is refused. Preference quotes are taken from the handoff: they were checked against the
 * user's messages when it was made, and the model reads them only as data.
 */
export async function handlePlanDraftPost(
  tripId: string,
  ownerGuestId: string | null,
  body: unknown,
  dependencies: PlanDraftDependencies,
): Promise<Response> {
  if (!ownerGuestId) return failure(404, "journey_not_found", "Journey not found.");
  const parsed = planHandoffSchema.safeParse(body);
  if (!parsed.success) return failure(400, "invalid_handoff", "The plan handoff is invalid.");
  const handoff = parsed.data;

  const requestId = randomUUID();
  const startedAt = performance.now();
  try {
    const { tripState } = await dependencies.loadJourney(tripId, ownerGuestId);
    if (JSON.stringify(tripState) !== JSON.stringify(handoff.tripState)) {
      return failure(409, "journey_changed", "The journey changed after this plan was opened.");
    }

    // Checked before research, so an unsupported trip spends no searches.
    const allocation = allocateDays(handoff.tripState);
    if (allocation.status === "unsupported") {
      return noStore({ status: "unsupported", reason: allocation.reason } satisfies PlanDraftResponse);
    }

    const researched = await dependencies.research(handoff);
    const mapCheck = await dependencies.checkMap(researched.cities);
    const research = { ...researched, cities: mapCheck.cities };
    const result = await dependencies.draft(handoff, research.cities);
    if (result.status === "unsupported") return noStore({ status: "unsupported", reason: result.reason } satisfies PlanDraftResponse);
    if (result.status === "unavailable") return failure(503, "planner_unavailable", "The planner is temporarily unavailable.");

    const scheduled = new Set(result.draft.days.flatMap(({ stops }) => stops.map(({ spotId }) => spotId)));
    const conflicted = new Set(result.draft.conflicts.flatMap((conflict) => "spotId" in conflict ? [conflict.spotId] : []));
    const cards = new Map(research.cities.flatMap(({ spots }) => spots).map((card) => [card.id, card.name]));
    const response: PlanDraftResponse = {
      status: "ready",
      draft: result.draft,
      spots: research.cities.flatMap(({ spots }) => spots.filter(({ id }) => scheduled.has(id) || conflicted.has(id))),
      cities: research.cities.map(({ province, city, status }) => ({ province, city, status })),
      pendingProvinces: [...research.pendingProvinces],
      mapCheck: mapCheck.status,
      dayPhotos: await dayPhotos(result.draft.days, (spotId) => cards.get(spotId) ?? null, dependencies.findImage),
    };
    logger.info({
      requestId,
      tripId,
      mode: result.draft.mode,
      days: result.draft.days.length,
      conflicts: result.draft.conflicts.length,
      attempts: result.attempts,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      mapCheck: mapCheck.status,
      mapLookups: mapCheck.lookups,
      durationMs: Math.round(performance.now() - startedAt),
    }, "Plan draft completed");
    return noStore(response);
  } catch (error) {
    if (error instanceof TripNotFoundError || error instanceof TripStateNotFoundError) {
      return failure(404, "journey_not_found", "Journey not found.");
    }
    logger.error({ requestId, tripId, error: serializeError(error) }, "Plan draft failed");
    return failure(500, "internal_error", "Failed to draft the plan.");
  }
}
