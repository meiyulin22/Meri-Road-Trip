import assert from "node:assert/strict";
import test from "node:test";

import type { JourneySummary } from "@/repositories/journey-summary-repository";

import {
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
