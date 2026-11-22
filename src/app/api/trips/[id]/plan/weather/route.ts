import { cookies } from "next/headers";
import { z } from "zod";

import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import { handleWeatherRefreshPost } from "@/capabilities/planning/plan-weather-refresh";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { kimiRequestRefusal } from "@/platform/http/visitor-limits";
import { readGuestId } from "@/platform/identity/guest-identity";
import { logger } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";

/** 「重新查天气」 (2026-11-22): the newest plan's forecasts and outfits again. Not a run; one Kimi call. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const limited = kimiRequestRefusal(request);
  if (limited) return limited;
  const { id: tripId } = await context.params;
  const ownerGuestId = readGuestId(await cookies());
  if (!z.uuid().safeParse(tripId).success) {
    return Response.json({ error: { code: "journey_not_found", message: "Journey not found." } },
      { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const [{ journeyService }, { planRunRepository }, { planGenerationDependencies }, { sharedCityPointMemory }] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/capabilities/planning/plan-run-repository-instance"),
    import("@/agents"),
    import("@/platform/tianditu/city-point-memory"),
  ]);
  const planner = planGenerationDependencies();
  return handleWeatherRefreshPost(tripId, ownerGuestId, {
    loadJourney: (id, owner) => journeyService.loadJourney(id, owner),
    repository: planRunRepository,
    forecast: planner.weather,
    cityCentre: async (city) => sharedCityPointMemory.get(city)?.point ?? null,
    planModel: planner.planModel,
    now: () => new Date(),
  }, (error) => {
    if (error instanceof TripNotFoundError || error instanceof TripStateNotFoundError) return true;
    logger.error({ tripId, error: serializeError(error) }, "Plan weather could not be refreshed");
    return false;
  });
}
