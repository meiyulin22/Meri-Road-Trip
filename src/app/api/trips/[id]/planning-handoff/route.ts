import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { z } from "zod";

import { handlePlanningHandoffPost, planningJourneyNotFound } from "@/capabilities/planning/planning-handoff-handler";
import { readGuestId } from "@/platform/identity/guest-identity";
import { requestLocale } from "@/platform/locale/request-locale";
import { kimiRequestRefusal } from "@/platform/http/visitor-limits";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  // Per-address and per-visitor limits on Kimi (step 3); the site's daily caps hold behind them.
  const limited = kimiRequestRefusal(request);
  if (limited) return limited;
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

  const [{ journeyService }, { tripMessageService }, { extractPlanPreferences }, { tripPreferenceRepository }, locale] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/capabilities/conversation/trip-message-service-instance"),
    import("@/capabilities/planning/extract-plan-preferences"),
    import("@/capabilities/planning/trip-preference-repository-instance"),
    requestLocale(),
  ]);
  return handlePlanningHandoffPost(tripId, ownerGuestId, { timezone, referenceDate, locale }, {
    loadJourney: (id, owner) => journeyService.loadJourney(id, owner),
    listMessages: (id, owner) => tripMessageService.listMessages(id, owner),
    extractPreferences: (messages, requestId) => extractPlanPreferences(messages, requestId),
    listPreferences: (id) => tripPreferenceRepository.listByTripId(id),
    replaceConversationPreferences: (id, preferences) => tripPreferenceRepository.replaceConversationPreferences(id, preferences),
    newId: () => randomUUID(),
  });
}
