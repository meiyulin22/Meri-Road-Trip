import type { JourneySummary } from "@/repositories/journey-summary-repository";

export function recentJourneysForHome(journeys: readonly JourneySummary[]): JourneySummary[] {
  return journeys.slice(0, 5);
}

export function visibleRecentJourneys(
  journeys: readonly JourneySummary[],
  deletedIds: readonly string[],
): JourneySummary[] {
  return journeys.filter((journey) => !deletedIds.includes(journey.id));
}

export function shouldLoopRecentJourneys(count: number): boolean {
  return count >= 3;
}

export function shouldOpenJourneyCard(
  selectedIndex: number,
  cardIndex: number,
  wasDragged: boolean,
): boolean {
  return !wasDragged && selectedIndex === cardIndex;
}
