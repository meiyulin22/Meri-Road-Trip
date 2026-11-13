import { cookies } from "next/headers";
import { z } from "zod";

import { handlePlanDraftPost } from "@/capabilities/planning/plan-draft-handler";
import { readGuestId } from "@/platform/identity/guest-identity";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: tripId } = await context.params;
  const ownerGuestId = readGuestId(await cookies());
  const notFound = Response.json({ error: { code: "journey_not_found", message: "Journey not found." } },
    { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!ownerGuestId || !z.uuid().safeParse(tripId).success) return notFound;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const [
    { journeyService }, { runFirstRoundResearch }, { draftPlan }, { findPlaceImage }, { createPlacePhotoProvider },
    { checkSpotsOnMap }, { TiandituLocationProvider }, { createTiandituClient }, { sharedSpotLocationMemory },
  ] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/agents/planner/research-agent"),
    import("@/agents/planner/plan-agent"),
    import("@/capabilities/destination/place-images"),
    import("@/platform/map-providers"),
    import("@/agents/planner/map-check"),
    import("@/platform/tianditu/tianditu-location-provider"),
    import("@/platform/tianditu/tianditu-fetch"),
    import("@/platform/tianditu/spot-location-memory"),
  ]);
  // The spot check stops at the first failed lookup and never retries, rate limits included.
  const map = new TiandituLocationProvider(createTiandituClient(fetch, { retryRateLimit: false }));
  // The local catalog and photos already downloaded: no remote photo service is asked.
  const photos = createPlacePhotoProvider();
  return handlePlanDraftPost(tripId, ownerGuestId, body, {
    loadJourney: (id, owner) => journeyService.loadJourney(id, owner),
    research: (handoff) => runFirstRoundResearch(handoff),
    checkMap: (cities) => checkSpotsOnMap(cities, {
      search: (name, areas) => map.searchByKeyword(name, areas),
      memory: sharedSpotLocationMemory,
    }),
    draft: (handoff, research) => draftPlan(handoff, research),
    findImage: (subject) => findPlaceImage(subject, photos),
  });
}
