import type { JourneySummary } from "@/platform/persistence/journey-summary-repository";

export function recentJourneysForHome(journeys: readonly JourneySummary[]): JourneySummary[] {
  return journeys.slice(0, 5);
}

export function visibleRecentJourneys(
  journeys: readonly JourneySummary[],
  deletedIds: readonly string[],
): JourneySummary[] {
  return journeys.filter((journey) => !deletedIds.includes(journey.id));
}

export function recentJourneyIndexAfterStep(
  count: number,
  selectedIndex: number,
  step: -1 | 1,
): number {
  if (count <= 1) return 0;
  return (selectedIndex + step + count) % count;
}

export function shouldOpenJourneyCard(
  selectedIndex: number,
  cardIndex: number,
  wasDragged: boolean,
): boolean {
  return !wasDragged && selectedIndex === cardIndex;
}
