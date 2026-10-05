import assert from "node:assert/strict";
import test from "node:test";

import type { JourneySummary } from "@/platform/persistence/journey-summary-repository";

import {
  recentJourneyIndexAfterStep,
  recentJourneysForHome,
  shouldOpenJourneyCard,
  visibleRecentJourneys,
} from "./recent-journeys-model";

const journeys: JourneySummary[] = Array.from({ length: 6 }, (_, index) => ({
  id: `journey-${index}`,
  name: `Journey ${index}`,
  destination: `Place ${index}`,
  destinationAreas: [],
  startDate: null,
  endDate: null,
  status: "idea",
  updatedAt: `2026-09-${String(24 - index).padStart(2, "0")}T00:00:00.000Z`,
}));

test("keeps no section data for a new guest", () => {
  assert.deepEqual(recentJourneysForHome([]), []);
  assert.equal(recentJourneyIndexAfterStep(0, 0, 1), 0);
});

test("keeps one Journey static", () => {
  assert.deepEqual(recentJourneysForHome(journeys.slice(0, 1)), journeys.slice(0, 1));
  assert.equal(recentJourneyIndexAfterStep(1, 0, -1), 0);
});

test("wraps two slides and selects before opening", () => {
  assert.equal(recentJourneyIndexAfterStep(2, 0, -1), 1);
  assert.equal(recentJourneyIndexAfterStep(2, 1, 1), 0);
  assert.equal(shouldOpenJourneyCard(0, 1, false), false);
  assert.equal(shouldOpenJourneyCard(1, 1, false), true);
  assert.equal(shouldOpenJourneyCard(1, 1, true), false);
});

test("bounds the recent-first list at five without changing order", () => {
  assert.deepEqual(recentJourneysForHome(journeys), journeys.slice(0, 5));
});

test("hides only successfully deleted Journey IDs from the current Home cards", () => {
  assert.deepEqual(visibleRecentJourneys(journeys.slice(0, 3), ["journey-1"]), [
    journeys[0],
    journeys[2],
  ]);
  assert.deepEqual(visibleRecentJourneys(journeys.slice(0, 1), ["journey-0"]), []);
});

test("steps through recent journeys and wraps at both ends", () => {
  assert.equal(recentJourneyIndexAfterStep(5, 0, -1), 4);
  assert.equal(recentJourneyIndexAfterStep(5, 4, 1), 0);
  assert.equal(recentJourneyIndexAfterStep(5, 2, -1), 1);
  assert.equal(recentJourneyIndexAfterStep(5, 2, 1), 3);
});
