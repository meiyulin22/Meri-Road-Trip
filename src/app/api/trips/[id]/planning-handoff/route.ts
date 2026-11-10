import { cookies } from "next/headers";
import { z } from "zod";

import { handlePlanningHandoffPost, planningJourneyNotFound } from "@/capabilities/planning/planning-handoff-handler";
import { readGuestId } from "@/platform/identity/guest-identity";
import { requestLocale } from "@/platform/locale/request-locale";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: tripId } = await context.params;
  const ownerGuestId = readGuestId(await cookies());
  if (!ownerGuestId || !z.uuid().safeParse(tripId).success) return planningJourneyNotFound();

  const timezone = process.env.MERI_TIMEZONE?.trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const { year, month, day } = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const referenceDate = `${year}-${month}-${day}`;

  const [{ journeyService }, { tripMessageService }, { extractPlanPreferences }, locale] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/capabilities/conversation/trip-message-service-instance"),
    import("@/capabilities/planning/extract-plan-preferences"),
    requestLocale(),
  ]);
  return handlePlanningHandoffPost(tripId, ownerGuestId, { timezone, referenceDate, locale }, {
    loadJourney: (id, owner) => journeyService.loadJourney(id, owner),
    listMessages: (id, owner) => tripMessageService.listMessages(id, owner),
    extractPreferences: async (messages, requestId) => {
      const result = await extractPlanPreferences(messages, requestId);
      return { ...result, preferences: [...result.preferences] };
    },
  });
}
