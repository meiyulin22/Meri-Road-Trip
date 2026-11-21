import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import { PlanHandoffPage } from "@/components/trip-plan/plan-handoff-page";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { readGuestId } from "@/platform/identity/guest-identity";

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Meri | Plan", robots: { index: false, follow: false } };

export default async function TripPlanPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id: tripId } = await params;
  const owner = readGuestId(await cookies());
  if (!owner || !uuidPattern.test(tripId)) notFound();

  const [{ journeyService }, { planRunRepository }] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/capabilities/planning/plan-run-repository-instance"),
  ]);
  try {
    await journeyService.loadJourney(tripId, owner);
  } catch (error) {
    if (error instanceof TripNotFoundError || error instanceof TripStateNotFoundError) notFound();
    throw error;
  }

  // The handoff of the trip's latest run, so the plan opens from the journey list or a new tab,
  // not only in the tab where Generate plan was chosen (2026-11-21). A tab's own handoff wins.
  const savedHandoff = (await planRunRepository.findLatestRun(tripId))?.handoff ?? null;
  return <PlanHandoffPage tripId={tripId} savedHandoff={savedHandoff} />;
}
