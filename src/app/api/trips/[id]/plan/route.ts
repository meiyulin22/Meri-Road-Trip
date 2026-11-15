import { cookies } from "next/headers";
import { z } from "zod";

import { handlePlanGet } from "@/capabilities/planning/plan-run-handler";
import { readGuestId } from "@/platform/identity/guest-identity";

/** The trip's newest saved plan and newest run. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: tripId } = await context.params;
  const ownerGuestId = readGuestId(await cookies());
  if (!z.uuid().safeParse(tripId).success) {
    return Response.json({ error: { code: "journey_not_found", message: "Journey not found." } },
      { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const [{ journeyService }, { planRunService }] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/capabilities/planning/plan-run-service-instance"),
  ]);
  return handlePlanGet(tripId, ownerGuestId, {
    loadJourney: (id, owner) => journeyService.loadJourney(id, owner),
    service: planRunService,
  });
}
