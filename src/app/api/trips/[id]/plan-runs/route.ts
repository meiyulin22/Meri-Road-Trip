import { cookies } from "next/headers";
import { z } from "zod";

import { handlePlanRunPost } from "@/capabilities/planning/plan-run-handler";
import { readGuestId } from "@/platform/identity/guest-identity";
import { clientAddress } from "@/platform/http/client-address";
import { kimiRequestRefusal } from "@/platform/http/visitor-limits";

/** Starts Generate plan in the background, or answers with the plan or run this handoff already has. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  // Per-address and per-visitor limits on Kimi (step 3); the site's daily caps hold behind them.
  const limited = kimiRequestRefusal(request);
  if (limited) return limited;
  const { id: tripId } = await context.params;
  const ownerGuestId = readGuestId(await cookies());
  if (!z.uuid().safeParse(tripId).success) {
    return Response.json({ error: { code: "journey_not_found", message: "Journey not found." } },
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
  return handlePlanRunPost(tripId, ownerGuestId, body, {
    loadJourney: (id, owner) => journeyService.loadJourney(id, owner),
    service: planRunService,
    address: clientAddress(request),
  });
}
