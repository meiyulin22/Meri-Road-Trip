import { cookies } from "next/headers";
import { z } from "zod";

import { handlePlanAnswerPost } from "@/capabilities/planning/plan-run-handler";
import { readGuestId } from "@/platform/identity/guest-identity";
import { kimiRequestRefusal } from "@/platform/http/visitor-limits";

/** Answers the question a plan run is waiting on, and resumes it. */
export async function POST(request: Request, context: { params: Promise<{ id: string; runId: string }> }): Promise<Response> {
  // Per-address and per-visitor limits on Kimi (step 3); the site's daily caps hold behind them.
  const limited = kimiRequestRefusal(request);
  if (limited) return limited;
  const { id: tripId, runId } = await context.params;
  const ownerGuestId = readGuestId(await cookies());
  if (!z.uuid().safeParse(tripId).success || !z.uuid().safeParse(runId).success) {
    return Response.json({ error: { code: "run_not_found", message: "Plan run not found." } },
      { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const [{ journeyService }, { planRunService }] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/capabilities/planning/plan-run-service-instance"),
  ]);
  return handlePlanAnswerPost(tripId, ownerGuestId, runId, body, {
    loadJourney: (id, owner) => journeyService.loadJourney(id, owner),
    service: planRunService,
  });
}
