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

  const { journeyService } = await import("@/capabilities/journey/journey-service-instance");
  try {
    await journeyService.loadJourney(tripId, owner);
  } catch (error) {
    if (error instanceof TripNotFoundError || error instanceof TripStateNotFoundError) notFound();
    throw error;
  }

  return <PlanHandoffPage tripId={tripId} />;
}
