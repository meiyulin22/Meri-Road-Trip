import assert from "node:assert/strict";
import test from "node:test";

import { handoff, fiveDays } from "@/agents/planner/plan-test-fixtures";
import type { PlanRun } from "@/domain/plan/plan-run";
import { applyTripStatePatch, type TripState, type TripStatePatch } from "@/domain/trip-state/trip-state";

import { checkPlanDates, fillPlanDates, handlePlanDatesPost, type PlanDatesDependencies } from "./plan-dates";

const threeDays = { state: "known", value: "3天", source: "user" } as const;
const planned = handoff(["大理白族自治州"], threeDays);
const run = { id: "run", handoff: planned } as PlanRun;

function journey(initial: TripState) {
  let state = initial;
  const patches: TripStatePatch[] = [];
  const deps: PlanDatesDependencies = {
    loadJourney: async () => ({ tripState: state }),
    updateTripState: async (_id, _owner, patch) => { patches.push(patch); state = applyTripStatePatch(state, patch); return state; },
    findLatestRun: async () => run,
    today: () => "2026-11-21",
  };
  return { deps, patches, state: () => state };
}

test("a start date fills a planned trip of known length once; the end follows and the handoff is the run's with the new journey", async () => {
  const { deps, patches, state } = journey(planned.tripState);
  const outcome = await fillPlanDates("trip", "owner", { startDate: "2026-11-25", endDate: null }, deps);
  assert.equal(outcome.status, "filled");
  if (outcome.status !== "filled") return;
  assert.deepEqual(patches, [{ startDate: { state: "known", value: "2026-11-25", source: "user" } }]);
  assert.deepEqual([state().startDate, state().endDate].map((field) => field.state === "known" ? field.value : null), ["2026-11-25", "2026-11-27"]);
  assert.equal(outcome.handoff.tripState, state());
  assert.equal(outcome.handoff.referenceDate, "2026-11-21");
  assert.deepEqual(outcome.handoff.preferences, planned.preferences);

  // Filled once, then locked.
  assert.deepEqual(await fillPlanDates("trip", "owner", { startDate: "2026-11-26", endDate: null }, deps), { status: "already_filled" });
});

test("without a known length both dates are needed, and the length follows", async () => {
  const noLength = handoff(["大理白族自治州"], { state: "missing" }).tripState;
  const { deps, state } = journey(noLength);
  assert.deepEqual(await fillPlanDates("trip", "owner", { startDate: "2026-11-25", endDate: null }, deps), { status: "invalid_dates", reason: "end_required" });
  const outcome = await fillPlanDates("trip", "owner", { startDate: "2026-11-25", endDate: "2026-11-28" }, deps);
  assert.equal(outcome.status, "filled");
  const duration = state().duration;
  assert.equal(duration.state === "known" ? duration.value : null, "4天");
});

test("dates must be from today, within a year, in order, and agree with the known length", () => {
  const known = handoff(["大理白族自治州"], fiveDays).tripState;
  assert.deepEqual(checkPlanDates({ startDate: "2026-11-20", endDate: null }, known, "2026-11-21"), { status: "invalid_dates", reason: "past" });
  assert.deepEqual(checkPlanDates({ startDate: "2027-12-01", endDate: null }, known, "2026-11-21"), { status: "invalid_dates", reason: "too_far" });
  assert.deepEqual(checkPlanDates({ startDate: "2026-11-25", endDate: "2026-11-24" }, known, "2026-11-21"), { status: "invalid_dates", reason: "end_before_start" });
  assert.deepEqual(checkPlanDates({ startDate: "2026-11-25", endDate: "2026-11-27" }, known, "2026-11-21"), { status: "invalid_dates", reason: "end_mismatch" });
  assert.equal(checkPlanDates({ startDate: "2026-11-21", endDate: "2026-11-25" }, known, "2026-11-21"), null);
});

test("a journey without a plan run keeps its Workspace for dates; the route answers 404, 400 and 409 as it should", async () => {
  const { deps } = journey(planned.tripState);
  assert.deepEqual(await fillPlanDates("trip", "owner", { startDate: "2026-11-25", endDate: null }, { ...deps, findLatestRun: async () => null }), { status: "no_plan" });
  const notFound = () => true;
  assert.equal((await handlePlanDatesPost("trip", null, {}, deps, notFound)).status, 404);
  assert.equal((await handlePlanDatesPost("trip", "owner", { startDate: "soon" }, deps, notFound)).status, 400);
  const stranger = await handlePlanDatesPost("trip", "owner", { startDate: "2026-11-25", endDate: null },
    { ...deps, loadJourney: async () => { throw new Error("not theirs"); } }, notFound);
  assert.equal(stranger.status, 404);
  const ok = await handlePlanDatesPost("trip", "owner", { startDate: "2026-11-25", endDate: null }, deps, notFound);
  assert.equal(ok.status, 200);
  const again = await handlePlanDatesPost("trip", "owner", { startDate: "2026-11-25", endDate: null }, deps, notFound);
  assert.deepEqual([again.status, ((await again.json()) as { error: { code: string } }).error.code], [409, "already_filled"]);
});
