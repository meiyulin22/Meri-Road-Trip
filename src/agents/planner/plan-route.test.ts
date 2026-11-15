import assert from "node:assert/strict";
import test from "node:test";

import { planScope, type PlanScope } from "@/domain/plan/plan-draft";

import { planRoute } from "./plan-route";
import { dali, fiveDays, handoff, lijiang, modelAnswering } from "./plan-test-fixtures";

function ready(scope: PlanScope) {
  if (scope.status !== "ready") throw new Error("expected a ready scope");
  return scope;
}

test("routes Lijiang and Dali over five days in the Agent's order, with a transfer day", async () => {
  const trip = handoff(["丽江市", "大理白族自治州"], fiveDays);
  const routePrompts: { cities: { id: string; city: string; districts: string[] }[] }[] = [];
  const attempts: number[] = [];
  const result = await planRoute(trip, ready(planScope(trip.tripState)), [lijiang, dali], {
    model: modelAnswering({ routePrompts, routes: [{
      cities: [{ id: "c2", days: 2, reason: "洱海慢慢走" }, { id: "c1", days: 3, reason: "雪山和古城" }],
      days: [{ day: 1, focus: "大理市", theme: "洱海" }, { day: 3, focus: "古城区", theme: "古城" }],
      omitted: [],
    }] }),
  }, ({ attempt }) => attempts.push(attempt));

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  // The model sees each city's located districts under a short ID.
  assert.deepEqual(routePrompts[0].cities.map(({ id, city, districts }) => [id, city, districts]),
    [["c1", "丽江市", ["古城区"]], ["c2", "大理白族自治州", ["大理市"]]]);
  assert.deepEqual(result.plan.route.cities.map(({ city, days }) => [city, days]), [["大理白族自治州", 2], ["丽江市", 3]]);
  assert.deepEqual(result.plan.frames.map(({ day, city, arrivingFrom, focus }) => [day, city, arrivingFrom, focus]), [
    [1, "大理白族自治州", null, "大理市"], [2, "大理白族自治州", null, null],
    [3, "丽江市", "大理白族自治州", "古城区"], [4, "丽江市", null, null], [5, "丽江市", null, null],
  ]);
  assert.equal(result.attempts, 1);
  assert.deepEqual(attempts, [1]);
  assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 20 });
});

test("a route that fails its checks twice falls back to the order the cities were added", async () => {
  const trip = handoff(["丽江市", "大理白族自治州"], fiveDays);
  const wrong = { cities: [{ id: "c1", days: 5, reason: "…" }], days: [], omitted: [] };
  const result = await planRoute(trip, ready(planScope(trip.tripState)), [lijiang, dali], {
    model: modelAnswering({ routes: [wrong, wrong] }),
  });
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.attempts, 2);
  assert.equal(result.plan.route.source, "fallback");
  assert.deepEqual(result.plan.route.cities.map(({ city, days }) => [city, days]), [["丽江市", 3], ["大理白族自治州", 2]]);
  assert.equal(result.plan.frames[3].arrivingFrom, "丽江市");
});

test("a model that cannot be built is unavailable before any call", async () => {
  const trip = handoff(["丽江市"], fiveDays);
  const result = await planRoute(trip, ready(planScope(trip.tripState)), [lijiang], {
    model() {
      throw new Error("MOONSHOT_API_KEY is required");
    },
  });
  assert.deepEqual(result, { status: "unavailable" });
});

test("a question is returned only when allowed and well formed; otherwise the route stands", async () => {
  const trip = handoff(["丽江市", "大理白族自治州"], fiveDays);
  const scope = ready(planScope(trip.tripState));
  const answer = {
    cities: [{ id: "c1", days: 3, reason: "雪山" }, { id: "c2", days: 2, reason: "洱海" }], days: [], omitted: [],
    question: { text: "山水还是古城？", options: [{ label: "山水", kind: "interests" }, { label: "古城", kind: "interests" }] },
  };
  const asked = await planRoute(trip, scope, [lijiang, dali], { model: modelAnswering({ routes: [answer] }) }, () => {},
    { allowQuestion: true });
  assert.equal(asked.status, "question");
  assert.deepEqual(asked.status === "question" && asked.question.options.map(({ label }) => label), ["山水", "古城"]);

  // Not allowed: the same answer is just a route.
  const notAllowed = await planRoute(trip, scope, [lijiang, dali], { model: modelAnswering({ routes: [answer] }) });
  assert.equal(notAllowed.status, "ready");

  // One option, a duplicate label or an unknown kind is no question at all.
  for (const options of [
    [{ label: "山水", kind: "interests" }],
    [{ label: "山水", kind: "interests" }, { label: "山水", kind: "pace" }],
    [{ label: "山水", kind: "interests" }, { label: "古城", kind: "mood" }],
  ]) {
    const result = await planRoute(trip, scope, [lijiang, dali],
      { model: modelAnswering({ routes: [{ ...answer, question: { text: "？", options } }] }) }, () => {}, { allowQuestion: true });
    assert.equal(result.status, "ready");
  }
});

test("an empty reason is a missing reason, not a failed route", async () => {
  const trip = handoff(["丽江市", "大理白族自治州"], fiveDays);
  const result = await planRoute(trip, ready(planScope(trip.tripState)), [lijiang, dali], {
    model: modelAnswering({ routes: [{ cities: [{ id: "c1", days: 3, reason: "" }, { id: "c2", days: 2, reason: "洱海" }], days: [], omitted: [] }] }),
  });
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.attempts, 1);
  assert.equal(result.plan.route.source, "agent");
  assert.deepEqual(result.plan.route.cities.map(({ reason }) => reason), [null, "洱海"]);
});
