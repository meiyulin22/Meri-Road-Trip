import { cookies } from "next/headers";
import { z } from "zod";

import { handlePlanRunEvents } from "@/capabilities/planning/plan-run-handler";
import { readGuestId } from "@/platform/identity/guest-identity";

/** A plan run's progress as Server-Sent Events, from Last-Event-ID on. */
export async function GET(request: Request, context: { params: Promise<{ id: string; runId: string }> }): Promise<Response> {
  const { id: tripId, runId } = await context.params;
  const ownerGuestId = readGuestId(await cookies());
  if (!z.uuid().safeParse(tripId).success || !z.uuid().safeParse(runId).success) {
    return Response.json({ error: { code: "run_not_found", message: "Plan run not found." } },
      { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const [{ journeyService }, { planRunService }] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/capabilities/planning/plan-run-service-instance"),
  ]);
  return handlePlanRunEvents(tripId, ownerGuestId, runId, request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("after"), request.signal, {
    loadJourney: (id, owner) => journeyService.loadJourney(id, owner),
    service: planRunService,
  });
}
