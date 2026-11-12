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
  const [{ journeyService }, { runFirstRoundResearch }, { draftPlan }, { findPlaceImage }, { createPlacePhotoProvider }] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/agents/planner/research-agent"),
    import("@/agents/planner/plan-agent"),
    import("@/capabilities/destination/place-images"),
    import("@/platform/map-providers"),
  ]);
  // The local catalog and photos already downloaded: no remote photo service is asked.
  const photos = createPlacePhotoProvider();
  return handlePlanDraftPost(tripId, ownerGuestId, body, {
    loadJourney: (id, owner) => journeyService.loadJourney(id, owner),
    research: (handoff) => runFirstRoundResearch(handoff),
    draft: (handoff, research) => draftPlan(handoff, research),
    findImage: (subject) => findPlaceImage(subject, photos),
  });
}
