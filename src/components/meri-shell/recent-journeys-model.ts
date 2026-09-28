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

export function shouldLoopRecentJourneys(count: number): boolean {
  return count >= 3;
}

export type RecentJourneysArrowState = {
  readonly canScrollPrev: boolean;
  readonly canScrollNext: boolean;
};

/**
 * Whether each arrow can still move the carousel. Embla knows this too, but only
 * by measuring a carousel that does not exist on the server, so asking it forces
 * the server to render an arrow state the client can then contradict. Every slide
 * is its own snap point here, so the Journey count and the selected slide are all
 * the measurement this needs, and both sides already agree on them.
 */
export function recentJourneysArrowState(
  count: number,
  selectedIndex: number,
): RecentJourneysArrowState {
  if (shouldLoopRecentJourneys(count)) return { canScrollPrev: true, canScrollNext: true };
  return { canScrollPrev: selectedIndex > 0, canScrollNext: selectedIndex < count - 1 };
}

export function shouldOpenJourneyCard(
  selectedIndex: number,
  cardIndex: number,
  wasDragged: boolean,
): boolean {
  return !wasDragged && selectedIndex === cardIndex;
}
