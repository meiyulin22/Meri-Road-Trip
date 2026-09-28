import assert from "node:assert/strict";
import test from "node:test";

import type { JourneySummary } from "@/platform/persistence/journey-summary-repository";

import {
  recentJourneysArrowState,
  recentJourneysForHome,
  shouldLoopRecentJourneys,
  shouldOpenJourneyCard,
  visibleRecentJourneys,
} from "./recent-journeys-model";

const journeys: JourneySummary[] = Array.from({ length: 6 }, (_, index) => ({
  id: `journey-${index}`,
  name: `Journey ${index}`,
  destination: `Place ${index}`,
  startDate: null,
  endDate: null,
  status: "idea",
  updatedAt: `2026-09-${String(24 - index).padStart(2, "0")}T00:00:00.000Z`,
}));

test("keeps no section data for a new guest", () => {
  assert.deepEqual(recentJourneysForHome([]), []);
  assert.equal(shouldLoopRecentJourneys(0), false);
});

test("keeps one Journey static", () => {
  assert.deepEqual(recentJourneysForHome(journeys.slice(0, 1)), journeys.slice(0, 1));
  assert.equal(shouldLoopRecentJourneys(1), false);
});

test("does not loop two real slides and selects before opening", () => {
  assert.equal(shouldLoopRecentJourneys(2), false);
  assert.equal(shouldOpenJourneyCard(0, 1, false), false);
  assert.equal(shouldOpenJourneyCard(1, 1, false), true);
  assert.equal(shouldOpenJourneyCard(1, 1, true), false);
});

test("bounds the recent-first list at five without changing order", () => {
  assert.deepEqual(recentJourneysForHome(journeys), journeys.slice(0, 5));
  assert.equal(shouldLoopRecentJourneys(5), true);
});

test("hides only successfully deleted Journey IDs from the current Home cards", () => {
  assert.deepEqual(visibleRecentJourneys(journeys.slice(0, 3), ["journey-1"]), [
    journeys[0],
    journeys[2],
  ]);
  assert.deepEqual(visibleRecentJourneys(journeys.slice(0, 1), ["journey-0"]), []);
});

test("arrow state is decided from data both the server and the client already have", () => {
  // Two slides do not loop, so the ends are real ends.
  assert.deepEqual(recentJourneysArrowState(2, 0), { canScrollPrev: false, canScrollNext: true });
  assert.deepEqual(recentJourneysArrowState(2, 1), { canScrollPrev: true, canScrollNext: false });
  // A looping carousel has no end in either direction.
  assert.deepEqual(recentJourneysArrowState(3, 0), { canScrollPrev: true, canScrollNext: true });
  assert.deepEqual(recentJourneysArrowState(5, 4), { canScrollPrev: true, canScrollNext: true });
  // The first render agrees on both sides, which is the whole point: selectedIndex
  // starts at 0 on the server and on the client, and nothing here is measured.
  assert.deepEqual(recentJourneysArrowState(2, 0), recentJourneysArrowState(2, 0));
});
