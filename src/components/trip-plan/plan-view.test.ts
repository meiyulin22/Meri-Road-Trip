import assert from "node:assert/strict";
import test from "node:test";

import { samplePlan } from "./plan-sample";
import { addDays, duration, missingFacts, missingFor, runSteps, sectionReady, sectionsUsing, verificationCount, type PlanFacts } from "./plan-view";

const destinationOnly: PlanFacts = { days: null, startDate: null, origin: null, transport: null };
const complete: PlanFacts = { days: 5, startDate: "2026-11-14", origin: "上海", transport: "flight" };

test("with only a destination, the first day can be planned and every other section waits for its fact", () => {
  assert.deepEqual(missingFor("firstDay", destinationOnly), []);
  assert.deepEqual(missingFor("otherDays", destinationOnly), ["days"]);
  assert.deepEqual(missingFor("gettingThere", destinationOnly), ["origin", "transport"]);
  assert.deepEqual(missingFor("weather", destinationOnly), ["startDate"]);
  assert.deepEqual(missingFor("gettingThere", { ...destinationOnly, origin: "上海" }), ["transport"]);
  assert.equal(missingFacts(destinationOnly).length, 4);
  assert.equal(missingFacts(complete).length, 0);
});

test("changing a fact re-plans only the sections that use it", () => {
  assert.deepEqual(sectionsUsing("days"), ["otherDays"]);
  assert.deepEqual(sectionsUsing("startDate"), ["weather", "stays"]);
  assert.deepEqual(sectionsUsing("origin"), ["gettingThere"]);
});

test("a run plans the first day before anything else it can unlock, and skips what is still locked", () => {
  assert.deepEqual(runSteps(destinationOnly), ["places", "candidates", "hours", "routes", "firstDay"]);
  const steps = runSteps(complete);
  assert.deepEqual(steps, ["places", "candidates", "hours", "routes", "weather", "firstDay", "gettingThere", "stays", "otherDays"]);
  assert.equal(sectionReady("firstDay", steps, 5), false);
  assert.equal(sectionReady("firstDay", steps, 6), true);
  assert.equal(sectionReady("otherDays", steps, 8), false);
  assert.equal(sectionReady("otherDays", runSteps(destinationOnly), 5), false);
});

test("durations read naturally in both languages", () => {
  const en = { hour: "h", minute: "min" };
  assert.equal(duration(8, en), "8 min");
  assert.equal(duration(60, en), "1 h");
  assert.equal(duration(115, { hour: "小时", minute: "分钟" }), "1 小时 55 分钟");
});

test("the sample plan is consistent: five days, one leg between each pair of stops, and counted sources", () => {
  assert.equal(samplePlan.days.length, 5);
  for (const day of samplePlan.days) {
    assert.equal(day.legs.length, day.stops.length - 1, `day ${day.day}`);
  }
  const counted = verificationCount(samplePlan.days);
  assert.ok(counted.verified > 0 && counted.unverified > 0);
});

test("days follow the chosen start date across a month end", () => {
  assert.equal(addDays("2026-11-14", 0), "2026-11-14");
  assert.equal(addDays("2026-11-28", 4), "2026-12-02");
  assert.equal(addDays("2026-11-14", -1), "2026-11-13");
});
