import { cookies } from "next/headers";

import { renderPlanPdf } from "@/capabilities/planning/pdf-export/chromium";
import { createPlanPdfHandler } from "@/capabilities/planning/pdf-export/plan-pdf";
import { readGuestId } from "@/platform/identity/guest-identity";

export const runtime = "nodejs";

const globals = globalThis as typeof globalThis & { meriPlanPdfHandler?: ReturnType<typeof createPlanPdfHandler> };
const handlePlanPdf = globals.meriPlanPdfHandler ??= createPlanPdfHandler({
  async loadJourney(tripId, guestId) {
    const { journeyService } = await import("@/capabilities/journey/journey-service-instance");
    return journeyService.loadJourney(tripId, guestId);
  },
  render: renderPlanPdf,
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return handlePlanPdf(id, readGuestId(await cookies()), request.signal);
}
