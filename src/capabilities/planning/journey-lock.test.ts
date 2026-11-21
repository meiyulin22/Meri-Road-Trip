import assert from "node:assert/strict";
import test from "node:test";

import type { PlanRun } from "@/domain/plan/plan-run";

import { isJourneyLocked, refuseIfLocked } from "./journey-lock";

const run = { id: "run" } as PlanRun;
const owner = "1d064379-9aab-45fc-9243-a0f7b490f438";

test("a journey with any plan run is locked; one without is open", async () => {
  assert.equal(await isJourneyLocked("trip", { findLatestRun: async () => run }), true);
  assert.equal(await isJourneyLocked("trip", { findLatestRun: async () => null }), false);
});

test("a Workspace write to a locked journey of one's own gets 409 journey_locked", async () => {
  const response = await refuseIfLocked("trip", owner, { findLatestRun: async () => run, loadJourney: async () => ({}) });
  assert.equal(response?.status, 409);
  assert.deepEqual(((await response?.json()) as { error: { code: string } }).error.code, "journey_locked");
});

test("an open journey, no visitor, or someone else's trip goes on to the route as before", async () => {
  assert.equal(await refuseIfLocked("trip", owner, { findLatestRun: async () => null, loadJourney: async () => ({}) }), null);
  assert.equal(await refuseIfLocked("trip", null, { findLatestRun: async () => run, loadJourney: async () => ({}) }), null);
  // Not the owner: nothing is said about whether the trip has a plan; the route answers 404 as usual.
  assert.equal(await refuseIfLocked("trip", owner, {
    findLatestRun: async () => run, loadJourney: async () => { throw new Error("not found"); },
  }), null);
});
