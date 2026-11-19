import assert from "node:assert/strict";
import test from "node:test";

import { fiveDays, handoff as handoffFor } from "@/agents/planner/plan-test-fixtures";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { TransferLeg } from "@/domain/plan/transfer-legs";
import { InMemoryPlanRunRepository } from "@/platform/persistence/in-memory/in-memory-plan-run-repository";

import { handoffKey } from "./plan-run-service";
import { handleLegModePost, switchPlanLegMode } from "./plan-leg-mode";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const runId = "00000000-0000-4000-8000-000000000001";
const owner = "85cbd49a-25fa-4942-aa49-4d01cf63023f";
const handoff = handoffFor(["丽江市"], fiveDays);
const outbound: TransferLeg = {
  kind: "outbound", day: 1, from: "上海", to: "丽江市",
  estimate: { status: "estimated", distanceKm: 2700, durationMinutes: 2280, path: [[121, 31], [100, 26]] },
  trains: { queriedDate: "2026-11-20", reference: false, checkedAt: "2026-11-18T08:00:00.000Z", options: [{
    code: "Z162", from: "上海南", to: "丽江", departs: "17:38", arrives: "22:10", arriveDayOffset: 1, durationMinutes: 1712,
    seats: [{ name: "硬卧", price: 580, left: "有" }] }] },
  flights: { queriedDate: "2026-11-20", checkedAt: "2026-11-18T08:00:00.000Z", options: [{
    flightNo: "CA8559", fromAirport: "上海浦东", toAirport: "丽江三义", departs: "07:55", arrives: "11:50", arriveDayOffset: 0,
    durationMinutes: 235, cabin: "经济舱", price: 670, seatsLeft: 9, charges: 190, stopCity: null, codeshare: false }] },
  recommendation: { mode: "train", trainCode: "Z162", flightNo: null, reason: "坚持坐火车", by: "code" },
};
const plan: ReadyPlan = {
  status: "ready",
  draft: { mode: "full", totalDays: 5, route: { source: "agent", cities: [], omitted: [] }, days: [], conflicts: [], unverified: [], transfers: [outbound] },
  spots: [], cities: [], pendingProvinces: [], dayPhotos: [], mapCheck: "complete",
};

function setup(current = handoff.tripState) {
  const repository = new InMemoryPlanRunRepository();
  repository.runs.set(runId, { id: runId, tripId, status: "succeeded", handoff, handoffKey: handoffKey(handoff),
    errorCode: null, usage: null, startedAt: "2026-11-17T08:00:00.000Z", finishedAt: "2026-11-17T08:01:00.000Z", durationMs: 60_000 });
  repository.versions.push({ id: "00000000-0000-4000-8000-000000000002", tripId, runId, version: 1, tripState: handoff.tripState,
    preferences: [], plan, createdAt: "2026-11-17T08:01:00.000Z" });
  return { repository, deps: { loadJourney: async () => ({ tripState: current }), repository } };
}

test("switching to the flight changes only this plan's leg, never TripState or the run's handoff (1.2115)", async () => {
  const { repository, deps } = setup();
  const outcome = await switchPlanLegMode(tripId, owner, { leg: "outbound", mode: "flight" }, deps);
  assert.equal(outcome.status, "switched");
  const saved = repository.versions[0];
  assert.equal(saved.plan.draft.transfers?.[0].recommendation?.flightNo, "CA8559");
  assert.equal(saved.plan.draft.transfers?.[0].recommendation?.by, "traveller");
  assert.deepEqual(saved.tripState, handoff.tripState);
  assert.equal(repository.runs.get(runId)?.handoffKey, handoffKey(handoff));
  // And back again.
  assert.equal((await switchPlanLegMode(tripId, owner, { leg: "outbound", mode: "train" }, deps)).status, "switched");
  assert.equal(repository.versions[0].plan.draft.transfers?.[0].recommendation?.trainCode, "Z162");
});

test("a leg with no such choice, a changed journey or a bad request is refused", async () => {
  assert.equal((await switchPlanLegMode(tripId, owner, { leg: "return", mode: "flight" }, setup().deps)).status, "not_offered");
  assert.equal((await switchPlanLegMode(tripId, owner, { leg: "outbound", mode: "train" }, setup().deps)).status, "not_offered");
  const changed = { ...handoff.tripState, duration: { state: "known" as const, value: "6天", source: "user" as const } };
  assert.equal((await switchPlanLegMode(tripId, owner, { leg: "outbound", mode: "flight" }, setup(changed).deps)).status, "plan_stale");
  assert.equal((await handleLegModePost(tripId, owner, { leg: "between", mode: "flight" }, setup().deps, () => false)).status, 400);
});
