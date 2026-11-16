import assert from "node:assert/strict";
import test from "node:test";

import { Mastra } from "@mastra/core";
import { InMemoryStore } from "@mastra/core/storage";

import { afternoon, dali, day, fiveDays, handoff, lijiang, modelAnswering } from "@/agents/planner/plan-test-fixtures";
import { PlanRunService } from "@/capabilities/planning/plan-run-service";
import type { PlanProgressEnvelope } from "@/domain/plan/plan-progress";
import type { CityResearch } from "@/domain/plan/spot-card";
import type { TripPreference } from "@/domain/plan/trip-preference";
import { InMemoryPlanRunRepository } from "@/platform/persistence/in-memory/in-memory-plan-run-repository";

import { createPlanGenerationWorkflow, type PlanGenerationDependencies } from "./plan-generation";

process.env.MASTRA_TELEMETRY_DISABLED = "1";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const trip = handoff(["丽江市", "大理白族自治州"], fiveDays);
const route = {
  cities: [{ id: "c1", days: 3, reason: "雪山和古城" }, { id: "c2", days: 2, reason: "洱海" }],
  days: [{ day: 1, focus: "古城区", theme: "古城" }],
  omitted: [],
};
const researched: Record<string, CityResearch> = {
  丽江市: { ...lijiang, spots: lijiang.spots.map((card) => ({ ...card, mapCheck: { status: "unchecked" as const } })) },
  大理白族自治州: { ...dali, spots: dali.spots.map((card) => ({ ...card, mapCheck: { status: "unchecked" as const } })) },
};

function setup(overrides: Partial<PlanGenerationDependencies> = {}, timeLimitMs?: number) {
  const repository = new InMemoryPlanRunRepository();
  const preferences: TripPreference[] = [];
  const lookups: string[] = [];
  const workflow = createPlanGenerationWorkflow({
    researchCity: async (task, _handoff, onProgress) => {
      onProgress({ kind: "nominating", city: task.city });
      onProgress({ kind: "searching", city: task.city, names: ["玉龙雪山"], done: 1, total: 1 });
      return researched[task.city];
    },
    // Lijiang's spots per city: s1–s8, then Dali's s1–s3 in its own call.
    planModel: { model: modelAnswering({
      routes: [route],
      days: [[day(1, "s1", "s2"), day(2, "s3"), day(3, "s4")], [afternoon(day(4, "s1")), day(5, "s2")]],
    }) },
    map: {
      search: async (name, areas) => {
        lookups.push(name);
        if (name === "蓝月谷") return { status: "failure", reason: "http_error" };
        return { status: "success", candidates: [{
          providerId: name, name, province: areas[0], city: areas[1], district: "古城区", region: areas.join(""),
          address: null, longitude: 100, latitude: 26, coordinateSystem: "CGCS2000",
        }] };
      },
      memory: { get: () => null, set: () => {} },
    },
    // No facts by default: every stop stays unchecked and the loop has nothing to repair.
    verifySpots: async () => ({ availability: new Map(), searches: 0, usage: { inputTokens: 0, outputTokens: 0 } }),
    findImage: async (subject) => subject.spot ? null : { url: `/photos/${subject.place}.jpg`, caption: subject.place ?? "城市" },
    saveVersion: (version) => repository.createVersion(version),
    now: () => new Date("2026-11-15T08:00:00.000Z"),
    ...overrides,
  });
  const mastra = new Mastra({ workflows: { planGeneration: workflow }, storage: new InMemoryStore(), logger: false });
  let id = 0;
  const service = new PlanRunService({
    repository,
    preferences: {
      listByTripId: async () => preferences,
      create: async (preference) => { preferences.push(preference); },
    },
    // A written answer naming 大理 leaves it out; anything else is a plain preference.
    labelAnswer: async (text, _question, cities) => ({
      label: text.slice(0, 10), kind: "interests", pace: null,
      leaveOut: text.includes("大理") ? cities.find((city) => city.startsWith("大理")) ?? null : null,
    }),
    workflow: async () => ({ workflow: mastra.getWorkflow("planGeneration") }),
    newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    timeLimitMs,
  });
  return { repository, service, lookups, preferences };
}

async function followToEnd(service: PlanRunService, repository: InMemoryPlanRunRepository, runId: string, afterSeq = 0) {
  const run = await repository.findRun(tripId, runId);
  assert.ok(run);
  const events: PlanProgressEnvelope[] = [];
  for await (const envelope of service.follow(run, afterSeq, new AbortController().signal)) events.push(envelope);
  return events;
}

test("streams real progress city by city, stops the map at its first failure, and saves a version", async () => {
  const { repository, service, lookups } = setup();
  const started = await service.start(tripId, trip);
  assert.equal(started.status, "running");
  const events = await followToEnd(service, repository, started.runId);
  const types = events.map(({ event }) => event.type);

  // Sequence numbers have no gaps, and the page sees the stages in workflow order.
  assert.deepEqual(events.map(({ seq }) => seq), events.map((_, index) => index + 1));
  assert.deepEqual(events.filter(({ event }) => event.type === "stage.started").map(({ event }) => "stage" in event && event.stage),
    ["scope", "research", "map", "route", "days", "verify", "photos", "save"]);
  assert.equal(types[0], "stage.started");
  assert.equal(types.at(-1), "run.finished");
  // Route before any day, and each day as its city is drafted.
  assert.ok(types.indexOf("route.ready") < types.indexOf("day.ready"));
  assert.deepEqual(events.flatMap(({ event }) => event.type === "day.ready" ? [[event.day.day, event.day.city, event.spots.length]] : []),
    [[1, "丽江市", 2], [2, "丽江市", 1], [3, "丽江市", 1], [4, "大理白族自治州", 1], [5, "大理白族自治州", 1]]);

  // The first failed Tianditu lookup stops the check: no retry, no later lookup.
  assert.deepEqual(lookups, ["黑龙潭", "玉龙雪山", "丽江古城", "蓝月谷"]);
  const map = events.find(({ event }) => event.type === "map.checked")?.event;
  assert.deepEqual(map && map.type === "map.checked" && [map.status, map.located, map.lookups], ["stopped", 3, 4]);

  const research = events.find(({ event }) => event.type === "stage.finished" && event.stage === "research")?.event;
  assert.deepEqual(research && research.type === "stage.finished" && research.summary, { cities: 2, cards: 11, sourced: 11, searches: 4 });

  const finished = events.at(-1)?.event;
  assert.equal(finished?.type === "run.finished" && finished.status, "succeeded");
  const version = repository.versions[0];
  assert.equal(finished?.type === "run.finished" && finished.versionId, version.id);
  assert.equal(version.version, 1);
  assert.deepEqual(version.plan.draft.days.map(({ day: dayNumber, stops }) => [dayNumber, stops.length]), [[1, 2], [2, 1], [3, 1], [4, 1], [5, 1]]);
  assert.deepEqual(version.plan.dayPhotos.map(({ day: dayNumber }) => dayNumber), [1, 2, 3, 4, 5]);
  assert.equal(version.plan.mapCheck, "stopped");

  const run = repository.runs.get(started.runId);
  assert.equal(run?.status, "succeeded");
  assert.deepEqual(run?.usage, { inputTokens: 300, outputTokens: 60, searches: 4, mapLookups: 4 });

  // A page that reconnects gets only what it missed; the same handoff reads the saved plan.
  const missed = await followToEnd(service, repository, started.runId, events.length - 2);
  assert.deepEqual(missed.map(({ seq }) => seq), [events.length - 1, events.length]);
  const again = await service.start(tripId, trip);
  assert.equal(again.status, "ready");
  assert.equal(again.status === "ready" && again.version.id, version.id);
});

test("two requests at once share one run", async () => {
  const { repository, service } = setup();
  const [first, second] = await Promise.all([service.start(tripId, trip), service.start(tripId, trip)]);
  assert.equal(first.runId, second.runId);
  await followToEnd(service, repository, first.runId);
  assert.equal(repository.runs.size, 1);
});

test("an unreachable planner fails the run with its own code, keeping the events so far", async () => {
  const { repository, service } = setup({
    planModel: { model() {
      throw new Error("MOONSHOT_API_KEY is required");
    } },
  });
  const started = await service.start(tripId, trip);
  const events = await followToEnd(service, repository, started.runId);
  const finished = events.at(-1)?.event;
  assert.deepEqual(finished?.type === "run.finished" && [finished.status, finished.errorCode, finished.versionId],
    ["failed", "planner_unavailable", null]);
  assert.ok(events.some(({ event }) => event.type === "city.researched"));
  assert.equal(repository.runs.get(started.runId)?.status, "failed");
  assert.equal(repository.versions.length, 0);
});

test("a run left running by a restart is marked interrupted when a page follows it", async () => {
  const { repository, service } = setup();
  await repository.createRun({
    id: "00000000-0000-4000-8000-000000000009", tripId, status: "running", handoff: trip, handoffKey: "old",
    errorCode: null, usage: null, startedAt: "2026-11-15T07:59:00.000Z", finishedAt: null, durationMs: null,
  });
  await repository.appendEvent({ runId: "00000000-0000-4000-8000-000000000009", seq: 1, at: 1, event: { type: "stage.started", stage: "scope" } });
  const events = await followToEnd(service, repository, "00000000-0000-4000-8000-000000000009");
  assert.deepEqual(events.map(({ seq, event }) => [seq, event.type]), [[1, "stage.started"], [2, "run.finished"]]);
  assert.equal(repository.runs.get("00000000-0000-4000-8000-000000000009")?.status, "interrupted");
});

test("a run past its time limit is stopped and says so", async () => {
  const { repository, service } = setup({
    researchCity: (task) => new Promise((resolve) => setTimeout(() => resolve(researched[task.city]), 200)),
  }, 30);
  const started = await service.start(tripId, trip);
  const events = await followToEnd(service, repository, started.runId);
  const finished = events.at(-1)?.event;
  assert.deepEqual(finished?.type === "run.finished" && [finished.status, finished.errorCode], ["failed", "time_limit"]);
  assert.equal(repository.versions.length, 0);
});

test("pauses on the Plan Agent's question, saves the answer as a preference, and resumes from the route", async () => {
  const routePrompts: { preferences: { kind: string; quote: string }[] }[] = [];
  const routeSystems: string[] = [];
  const asking = { ...route, question: { text: "更想多看山水，还是多逛古城？", options: [
    { label: "山水", kind: "interests" }, { label: "古城烟火", kind: "interests" },
  ] } };
  const { repository, service, preferences } = setup({
    planModel: { model: modelAnswering({
      routes: [asking, route],
      routePrompts,
      routeSystems,
      days: [[day(1, "s1", "s2"), day(2, "s3"), day(3, "s4")], [afternoon(day(4, "s1")), day(5, "s2")]],
    }) },
  });
  const started = await service.start(tripId, trip);
  const before = await followToEnd(service, repository, started.runId);
  const waiting = before.at(-1)?.event;
  assert.equal(waiting?.type, "run.waiting");
  if (waiting?.type !== "run.waiting") return;
  // Paused before any day: nothing routed yet, and the run waits rather than ends.
  assert.ok(!before.some(({ event }) => event.type === "route.ready" || event.type === "run.finished"));
  assert.equal(repository.runs.get(started.runId)?.status, "suspended");
  assert.match(routeSystems[0], /Ask the traveller one question first/u);

  // Another page following the waiting run gets the same events and the question again.
  assert.deepEqual((await followToEnd(service, repository, started.runId)).map(({ seq }) => seq), before.map(({ seq }) => seq));
  // A choice that is not an option, or an old question, does not resume it.
  assert.equal(await service.answer(tripId, started.runId, { questionId: waiting.question.id, choice: "沙漠" }), "wrong_question");

  assert.equal(await service.answer(tripId, started.runId, { questionId: waiting.question.id, choice: "山水" }), "resumed");
  assert.equal(await service.answer(tripId, started.runId, { questionId: waiting.question.id, choice: "山水" }), "not_waiting");
  const after = await followToEnd(service, repository, started.runId, before.at(-1)?.seq);
  assert.deepEqual(after.map(({ seq }) => seq), after.map((_, index) => before.length + index + 1));
  assert.equal(after[0].event.type, "stage.started");
  assert.ok(after.some(({ event }) => event.type === "question.answered" && event.choice === "山水"));
  const finished = after.at(-1)?.event;
  assert.equal(finished?.type === "run.finished" && finished.status, "succeeded");
  // Research and the map were not repeated after the answer.
  assert.ok(!after.some(({ event }) => event.type === "city.researched" || event.type === "map.checked"));

  // The answer is a preference: saved for the trip, read by the second route call, kept in the version.
  assert.deepEqual(preferences.map(({ label, kind, source }) => [label, kind, source]), [["山水", "interests", "question"]]);
  assert.ok(routePrompts[1].preferences.some(({ quote }) => quote.includes("山水")));
  assert.match(routeSystems[1], /question is always null/u);
  assert.ok(repository.versions[0].preferences.some(({ label }) => label === "山水"));
  assert.equal(repository.runs.get(started.runId)?.status, "succeeded");
});

test("a single city, or a resumed route, is never asked about", async () => {
  const routeSystems: string[] = [];
  const { repository, service } = setup({
    planModel: { model: modelAnswering({
      routes: [{ ...route, cities: [{ id: "c1", days: 5, reason: "雪山" }], question: {
        text: "问？", options: [{ label: "甲", kind: "interests" }, { label: "乙", kind: "interests" }] } }],
      routeSystems,
      days: [[day(1, "s1"), day(2, "s2"), day(3, "s3"), day(4, "s4"), day(5, "s5")]],
    }) },
  });
  const started = await service.start(tripId, handoff(["丽江市"], fiveDays));
  const events = await followToEnd(service, repository, started.runId);
  assert.ok(!events.some(({ event }) => event.type === "run.waiting"));
  assert.equal(events.at(-1)?.event.type, "run.finished");
  assert.match(routeSystems[0], /question is always null/u);
});

test("answering leave-one-out lets the resumed route drop exactly that city", async () => {
  const tight = { cities: [{ id: "c1", days: 5, reason: "雪山" }], days: [], omitted: [{ id: "c2", reason: "太赶" }] };
  const { repository, service, preferences } = setup({
    planModel: { model: modelAnswering({
      routes: [{ ...route, question: { text: "五天两城会赶，怎么安排？", options: [
        { label: "两座都去", kind: "pace", pace: "packed", leaveOut: null },
        { label: "只去丽江", kind: "pace", pace: "relaxed", leaveOut: "c2" }] } }, tight],
      days: [[day(1, "s1"), day(2, "s2"), day(3, "s3"), day(4, "s4"), day(5, "s5")]],
    }) },
  });
  const started = await service.start(tripId, trip);
  const waiting = (await followToEnd(service, repository, started.runId)).at(-1)?.event;
  assert.equal(waiting?.type, "run.waiting");
  if (waiting?.type !== "run.waiting") return;
  assert.equal(await service.answer(tripId, started.runId, { questionId: waiting.question.id, choice: "只去丽江" }), "resumed");
  await followToEnd(service, repository, started.runId, 1);
  const plan = repository.versions[0].plan;
  assert.equal(plan.draft.route.source, "agent");
  assert.deepEqual(plan.draft.route.omitted.map(({ city }) => city), ["大理白族自治州"]);
  // The option's direction is saved with the answer (1.2017).
  assert.deepEqual(preferences.map(({ label, kind, pace }) => [label, kind, pace]), [["只去丽江", "pace", "relaxed"]]);
});

test("a written answer is saved in the traveller's words and can leave a city out (1.2018)", async () => {
  const tight = { cities: [{ id: "c1", days: 5, reason: "雪山" }], days: [], omitted: [{ id: "c2", reason: "按你说的不去" }] };
  const { repository, service, preferences } = setup({
    planModel: { model: modelAnswering({
      routes: [{ ...route, question: { text: "五天两城会赶，怎么安排？", options: [
        { label: "两座都去", kind: "pace", pace: "packed", leaveOut: null },
        { label: "只去丽江", kind: "pace", pace: "relaxed", leaveOut: "c2" }] } }, tight],
      days: [[day(1, "s1"), day(2, "s2"), day(3, "s3"), day(4, "s4"), day(5, "s5")]],
    }) },
  });
  const started = await service.start(tripId, trip);
  const waiting = (await followToEnd(service, repository, started.runId)).at(-1)?.event;
  if (waiting?.type !== "run.waiting") throw new Error("expected a question");
  assert.equal(await service.answer(tripId, started.runId, { questionId: waiting.question.id, text: "这次不去大理了" }), "resumed");
  const after = await followToEnd(service, repository, started.runId, 1);
  assert.ok(after.some(({ event }) => event.type === "question.answered" && event.choice === "这次不去大理了"));
  assert.deepEqual(preferences.map(({ quote, source }) => [quote, source]), [["这次不去大理了", "question"]]);
  // The written answer named 大理, so the resumed route may leave it out.
  assert.deepEqual(repository.versions[0].plan.draft.route.omitted.map(({ city }) => city), ["大理白族自治州"]);
});

test("the validation loop moves a closed stop, re-plans a day it cannot fix, and reports the rest", async () => {
  const dated = handoff(["丽江市"], { state: "known", value: "3天", source: "user" });
  const startsMonday = { ...dated, tripState: { ...dated.tripState, startDate: { state: "known" as const, value: "2026-12-21", source: "user" as const } } };
  const quote = (text: string) => ({ url: "https://example.com", title: "来源", publishedAt: null, checkedAt: "2026-11-15T08:00:00.000Z", quote: text });
  const facts = (name: string) => ({
    checkedAt: "2026-11-15T08:00:00.000Z", hours: null, reservation: null, uncertain: [],
    closedWeekdays: name === "玉龙雪山" ? [{ weekday: 1, scope: null, evidence: quote("每周一闭园") }] : [],
    closedRanges: name === "黑龙潭" ? [{ from: "12-01", to: "03-31", scope: null, evidence: quote("12月1日至3月31日闭园") }] : [],
  });
  const asked: string[][] = [];
  const dayPrompts: { candidates: { name: string }[] }[] = [];
  const { repository, service } = setup({
    planModel: { model: modelAnswering({
      routes: [{ cities: [{ id: "c1", days: 3, reason: "雪山" }], days: [], omitted: [] }],
      dayPrompts,
      // 黑龙潭 and 玉龙雪山 on Monday, then the re-plan of day 1 alone.
      days: [[day(1, "s1", "s2"), day(2, "s3"), day(3, "s4")], [day(1, "s1")]],
    }) },
    verifySpots: async (cards) => {
      asked.push(cards.map(({ name }) => name));
      return { availability: new Map(cards.map((card) => [card.id, facts(card.name)])), searches: cards.length,
        usage: { inputTokens: 10, outputTokens: 5 } };
    },
  });
  const started = await service.start(tripId, startsMonday);
  const events = await followToEnd(service, repository, started.runId);

  // Scheduled stops first, then two checked replacements; the re-planned stop is checked after.
  assert.deepEqual(asked[0], ["黑龙潭", "玉龙雪山", "丽江古城", "蓝月谷", "束河古镇", "拉市海"]);
  assert.equal(asked.length, 1);
  // The re-plan of day 1 never offers a spot closed that day or kept elsewhere.
  assert.deepEqual(dayPrompts[1].candidates.map(({ name }) => name), ["束河古镇", "拉市海", "白沙古镇", "玉水寨"]);

  const draft = repository.versions[0].plan.draft;
  const names = (day: number) => draft.days[day - 1].stops.map(({ spotId }) => JSON.parse(spotId)[2]);
  assert.deepEqual([names(1), names(2), names(3)], [["束河古镇"], ["丽江古城", "玉龙雪山"], ["蓝月谷"]]);
  assert.deepEqual(draft.conflicts, [{ kind: "closed_on_day", day: 1, spotId: JSON.stringify(["云南省", "丽江市", "黑龙潭"]) }]);
  const yulong = draft.checks?.find(({ spotId }) => spotId.includes("玉龙雪山"));
  assert.deepEqual(yulong && [yulong.day, yulong.status, yulong.movedFrom], [2, "open", 1]);

  // The page saw the closed verdicts first, then the repaired days, then one ✓ line.
  assert.ok(events.some(({ event }) => event.type === "spot.checked" && event.check.status === "closed"));
  assert.ok(events.some(({ event }) => event.type === "stage.activity" && event.activity.kind === "repairing"));
  const verify = events.filter(({ event }) => event.type === "stage.finished" && event.stage === "verify");
  assert.equal(verify.length, 1);
  assert.deepEqual(verify[0].event.type === "stage.finished" && verify[0].event.summary,
    { checked: 1, stops: 4, reservations: 0, moved: 1, closed: 1, rounds: 1 });
  assert.equal(events.filter(({ event }) => event.type === "stage.started" && event.stage === "verify").length, 1);
});
