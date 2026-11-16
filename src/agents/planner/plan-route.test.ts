import assert from "node:assert/strict";
import test from "node:test";

import { planScope, type PlanScope } from "@/domain/plan/plan-draft";

import { fallbackQuestion, planRoute } from "./plan-route";
import { dali, diqing, fiveDays, handoff, lijiang, modelAnswering } from "./plan-test-fixtures";

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

test("a tight trip may ask to leave a city out, and only the city the traveller chose may go", async () => {
  const trip = handoff(["丽江市", "大理白族自治州"], fiveDays);
  const scope = ready(planScope(trip.tripState));
  const asking = {
    cities: [{ id: "c1", days: 5, reason: "雪山" }], days: [], omitted: [{ id: "c2", reason: "太赶" }],
    question: { text: "五天去两座城会赶，怎么安排？", options: [
      { label: "两座都去", kind: "pace", leaveOut: null },
      { label: "只去丽江", kind: "pace", leaveOut: "c2" },
    ] },
  };
  const asked = await planRoute(trip, scope, [lijiang, dali], { model: modelAnswering({ routes: [asking] }) }, () => {},
    { allowQuestion: true });
  assert.equal(asked.status, "question");
  // The short ID becomes the city's own name, which survives the pause.
  assert.deepEqual(asked.status === "question" && asked.question.options.map(({ leaveOut }) => leaveOut), [null, "大理白族自治州"]);

  // An option that names an unknown city makes the question unusable.
  const unknown = { ...asking, question: { ...asking.question, options: [
    { label: "甲", kind: "pace", leaveOut: "c9" }, { label: "乙", kind: "pace", leaveOut: null }] } };
  const ignored = await planRoute(trip, scope, [lijiang, dali], { model: modelAnswering({ routes: [unknown, unknown] }) }, () => {},
    { allowQuestion: true });
  assert.equal(ignored.status, "ready");

  // Two options leaving out the same city are one trip worded twice: the first is kept.
  const repeated = { ...asking, question: { ...asking.question, options: [
    { label: "丽江+大理", kind: "pace", leaveOut: "c2" },
    { label: "大理+丽江", kind: "pace", leaveOut: "c2" },
    { label: "两座都去", kind: "pace", leaveOut: null },
  ] } };
  const deduped = await planRoute(trip, scope, [lijiang, dali], { model: modelAnswering({ routes: [repeated] }) }, () => {},
    { allowQuestion: true });
  assert.deepEqual(deduped.status === "question" && deduped.question.options.map(({ label }) => label), ["丽江+大理", "两座都去"]);

  // Without the traveller's choice, leaving 大理 out is refused; with it, the Agent's route stands.
  const routeOnly = { ...asking, question: null };
  const refused = await planRoute(trip, scope, [lijiang, dali], { model: modelAnswering({ routes: [routeOnly, routeOnly] }) });
  assert.equal(refused.status === "ready" && refused.plan.route.source, "fallback");
  const chosen = await planRoute(trip, scope, [lijiang, dali], { model: modelAnswering({ routes: [routeOnly] }) }, () => {},
    { leaveOut: ["大理白族自治州"] });
  assert.equal(chosen.status === "ready" && chosen.plan.route.source, "agent");
  assert.deepEqual(chosen.status === "ready" && chosen.plan.route.omitted.map(({ city }) => city), ["大理白族自治州"]);
});

test("a city's areas named by the traveller reach the route call", async () => {
  const trip = handoff(["丽江市", "大理白族自治州"], fiveDays);
  const destination = trip.tripState.destination;
  if (destination.state !== "known") throw new Error("expected a destination");
  const withArea = { ...trip, tripState: { ...trip.tripState, destination: { ...destination, areas: [{ province: "云南省", places: [
    { name: "丽江市", spots: [] }, { name: "大理白族自治州", spots: ["大理市", "洱海"] }] }] } } };
  const routePrompts: { cities: { city: string; travellerAreas: string[] }[] }[] = [];
  await planRoute(withArea, ready(planScope(withArea.tripState)), [lijiang, dali], {
    model: modelAnswering({ routePrompts, routes: [{ cities: [{ id: "c1", days: 3, reason: "雪山" }, { id: "c2", days: 2, reason: "洱海" }], days: [], omitted: [] }] }),
  });
  assert.deepEqual(routePrompts[0].cities.map(({ city, travellerAreas }) => [city, travellerAreas]),
    [["丽江市", []], ["大理白族自治州", ["大理市"]]]);
});

test("a traveller who wants a packed trip is not asked whether to keep every city when they all fit (1.2017)", async () => {
  const trip = handoff(["丽江市", "大理白族自治州"], fiveDays);
  const packed = { ...trip, preferences: [...trip.preferences,
    { ...trip.preferences[0], id: "p2", kind: "pace" as const, pace: "packed" as const, quote: "可以紧凑一点" }] };
  const scope = ready(planScope(packed.tripState));
  const asking = { cities: [{ id: "c1", days: 3, reason: "雪山" }, { id: "c2", days: 2, reason: "洱海" }], days: [], omitted: [],
    question: { text: "五天两城会赶，都去吗？", options: [
      { label: "两座都去", kind: "pace", pace: "packed", leaveOut: null }, { label: "只去丽江", kind: "pace", pace: "relaxed", leaveOut: "c2" }] } };
  const systems: string[] = [];
  const prompts: { preferences: { kind: string; pace: string | null }[] }[] = [];
  const result = await planRoute(packed, scope, [lijiang, dali],
    { model: modelAnswering({ routes: [asking], routeSystems: systems, routePrompts: prompts }) }, () => {}, { allowQuestion: true });
  assert.equal(result.status, "ready");
  assert.match(systems[0], /question is always null/u);
  assert.deepEqual(prompts[0].preferences.map(({ kind, pace }) => [kind, pace]), [["walking", null], ["pace", "packed"]]);

  // A relaxed traveller with the same trip may still be asked.
  const relaxed = { ...packed, preferences: packed.preferences.map((item) => item.id === "p2" ? { ...item, pace: "relaxed" as const } : item) };
  const asked = await planRoute(relaxed, scope, [lijiang, dali], { model: modelAnswering({ routes: [asking] }) }, () => {}, { allowQuestion: true });
  assert.equal(asked.status, "question");
  // A direction is kept only on a pace option.
  assert.deepEqual(asked.status === "question" && asked.question.options.map(({ pace }) => pace), ["packed", "relaxed"]);
});

test("a relaxed traveller who would leave a city the day they arrive must be asked (1.2018)", async () => {
  const days = (count: number) => ({ state: "known", value: `${count}天`, source: "user" } as const);
  const cities = ["大理白族自治州", "丽江市", "迪庆藏族自治州"];
  const relaxed = (count: number) => {
    const trip = handoff(cities, days(count));
    return { ...trip, preferences: [...trip.preferences,
      { ...trip.preferences[0], id: "p2", kind: "pace" as const, pace: "relaxed" as const, quote: "想每个地方慢慢玩" }] };
  };
  const every = (count: number) => ({
    cities: [{ id: "c1", days: 1, reason: "洱海" }, { id: "c2", days: 1, reason: "古城" }, { id: "c3", days: count - 2, reason: "雪山" }],
    days: [], omitted: [], question: null,
  });
  const asking = (count: number) => ({ ...every(count), question: { text: "三城都去会天天换地方，怎么安排？", options: [
    { label: "三城都去", kind: "pace", pace: "packed", leaveOut: null },
    { label: "放弃大理，慢慢玩", kind: "pace", pace: "relaxed", leaveOut: "c1" },
  ] } });

  // Three days for three cities: two are transfer days, one day is free of travel.
  const three = relaxed(3);
  const prompts: { problemsWithPreviousAnswer?: string[] }[] = [];
  const asked = await planRoute(three, ready(planScope(three.tripState)), [dali, lijiang, diqing],
    { model: modelAnswering({ routes: [every(3), asking(3)], routePrompts: prompts }) }, () => {}, { allowQuestion: true });
  assert.equal(asked.status, "question");
  assert.match(prompts[1].problemsWithPreviousAnswer?.[0] ?? "", /relaxed pace.*only 1 of 3 days/u);

  // Five days: every city gets a day free of travel, so the route is taken as it is.
  const five = relaxed(5);
  const roomy = await planRoute(five, ready(planScope(five.tripState)), [dali, lijiang, diqing],
    { model: modelAnswering({ routes: [every(5)] }) }, () => {}, { allowQuestion: true });
  assert.equal(roomy.status === "ready" && roomy.attempts, 1);

  // Three days without a relaxed preference: nothing is sent back.
  const plain = handoff(cities, days(3));
  const notRelaxed = await planRoute(plain, ready(planScope(plain.tripState)), [dali, lijiang, diqing],
    { model: modelAnswering({ routes: [every(3)] }) }, () => {}, { allowQuestion: true });
  assert.equal(notRelaxed.status === "ready" && notRelaxed.attempts, 1);
});

test("the question code builds itself names the cities with the fewest candidates, in the trip's language (1.2018)", () => {
  const cities = [{ city: "大理白族自治州", candidates: 5 }, { city: "丽江市", candidates: 8 }, { city: "迪庆藏族自治州", candidates: 2 }];
  const relaxed = fallbackQuestion("relaxed_rushed", cities, 3, "zh");
  assert.equal(relaxed?.text, "3天去3座城，几乎每天都在换地方。您想怎么安排？");
  assert.deepEqual(relaxed?.options.map(({ label, pace, leaveOut }) => [label, pace, leaveOut]), [
    ["3座城都去，每天换城", "packed", null],
    ["不去迪庆，慢慢玩", "relaxed", "迪庆藏族自治州"],
    ["不去大理，慢慢玩", "relaxed", "大理白族自治州"],
  ]);
  const english = fallbackQuestion("too_few_days", cities, 2, "en");
  assert.equal(english?.text, "2 days cannot fit 3 cities. Which one should go?");
  assert.deepEqual(english?.options.map(({ label }) => label), ["Skip 迪庆", "Skip 大理", "Skip 丽江"]);
});

test("with fewer days than cities and no taste preference, a route without a question is sent back once (1.2016)", async () => {
  const oneDay = { state: "known", value: "1天", source: "user" } as const;
  const trip = handoff(["丽江市", "大理白族自治州"], oneDay);
  const scope = ready(planScope(trip.tripState));
  const unasked = { cities: [{ id: "c1", days: 1, reason: "雪山" }], days: [], omitted: [{ id: "c2", reason: "只有一天" }], question: null };
  const asking = { ...unasked, question: { text: "一天只够一座城，去哪里？", options: [
    { label: "去丽江，放弃大理", kind: "interests", leaveOut: "c2" },
    { label: "去大理，放弃丽江", kind: "interests", leaveOut: "c1" },
  ] } };

  // The second answer asks: that question is used.
  const systems: string[] = [];
  const prompts: { problemsWithPreviousAnswer?: string[] }[] = [];
  const asked = await planRoute(trip, scope, [lijiang, dali],
    { model: modelAnswering({ routes: [unasked, asking], routeSystems: systems, routePrompts: prompts }) }, () => {}, { allowQuestion: true });
  assert.equal(asked.status, "question");
  assert.match(prompts[1].problemsWithPreviousAnswer?.[0] ?? "", /fewer days than cities/);
  assert.match(systems[1], /Ask the traveller one question/);

  // Neither answer asks: code asks itself rather than leaving the choice to the model (1.2018).
  const built = await planRoute(trip, scope, [lijiang, dali],
    { model: modelAnswering({ routes: [unasked, unasked] }) }, () => {}, { allowQuestion: true });
  assert.equal(built.status, "question");
  // 大理 has fewer candidates than 丽江, so it is offered first.
  assert.deepEqual(built.status === "question" && built.question.options.map(({ label, leaveOut }) => [label, leaveOut]),
    [["不去大理", "大理白族自治州"], ["不去丽江", "丽江市"]]);
  assert.equal(built.status === "question" && built.question.text, "1天去不了2座城，放弃哪一座？");

  // An interests or pace preference may settle it: the first route is taken as it is.
  const withTaste = { ...trip, preferences: [...trip.preferences,
    { ...trip.preferences[0], id: "p2", kind: "interests" as const, quote: "最想看雪山" }] };
  const taken = await planRoute(withTaste, scope, [lijiang, dali],
    { model: modelAnswering({ routes: [unasked] }) }, () => {}, { allowQuestion: true });
  assert.equal(taken.status === "ready" && taken.attempts, 1);

  // Without permission to ask (a resumed run), nothing is sent back.
  const resumed = await planRoute(trip, scope, [lijiang, dali], { model: modelAnswering({ routes: [unasked] }) });
  assert.equal(resumed.status === "ready" && resumed.attempts, 1);
});
