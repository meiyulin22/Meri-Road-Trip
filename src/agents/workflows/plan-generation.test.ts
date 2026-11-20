import assert from "node:assert/strict";
import test from "node:test";

import { Mastra } from "@mastra/core";
import { InMemoryStore } from "@mastra/core/storage";

import { afternoon, dali, day, fiveDays, handoff, lijiang, modelAnswering } from "@/agents/planner/plan-test-fixtures";
import { beijingDayStart, type PlanRunLimits, type PlanRunStart, PlanRunService, workingMs } from "@/capabilities/planning/plan-run-service";
import type { PlanProgressEnvelope } from "@/domain/plan/plan-progress";
import type { CityResearch } from "@/domain/plan/spot-card";
import type { TripPreference } from "@/domain/plan/trip-preference";
import { createMoonshotChatModel } from "@/platform/llm/moonshot-chat-model";
import { InMemoryPlanRunRepository } from "@/platform/persistence/in-memory/in-memory-plan-run-repository";
import type { TrainSearch } from "@/platform/rail/rail-12306";

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

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let at = Date.parse(from); at <= Date.parse(to); at += 86_400_000) dates.push(new Date(at).toISOString().slice(0, 10));
  return dates;
}

function setup(overrides: Partial<PlanGenerationDependencies> = {}, timeLimitMs?: number, limits?: PlanRunLimits) {
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
    // Every located pair takes ten minutes over three kilometres.
    drive: {
      drive: async (from, to) => ({ status: "success", route: {
        distanceKm: 3, durationSeconds: 600, path: [[from.longitude, from.latitude], [to.longitude, to.latitude]],
        offRoadStartMeters: 0, offRoadEndMeters: 0,
      } }),
      memory: { get: () => null, set: () => {} },
      key: (from, to, mode) => `${mode}:${from.longitude},${from.latitude}>${to.longitude},${to.latitude}`,
    },
    // Each city's centre a degree apart; the drive between them is the same fake as between stops.
    transfers: {
      cityPoint: async (name) => ({ status: "found", city: {
        name, adminCode: name.startsWith("丽江") ? "156530700" : "156532900",
        point: name.startsWith("丽江") ? { longitude: 100.2, latitude: 26.9 } : { longitude: 100.2, latitude: 25.6 },
      } }),
      cityMemory: { get: () => null, set: () => {} },
      drive: {
        drive: async (from, to) => ({ status: "success", route: {
          distanceKm: 186.4, durationSeconds: 10_200, path: [[from.longitude, from.latitude], [to.longitude, to.latitude]],
          offRoadStartMeters: 0, offRoadEndMeters: 0,
        } }),
        memory: { get: () => null, set: () => {} },
        key: (from, to, mode) => `${mode}:${from.longitude},${from.latitude}>${to.longitude},${to.latitude}`,
      },
    },
    // The trip has no transport preference, so no train is searched; asking would fail the test.
    transport: {
      searchTrains: async () => { throw new Error("no train search expected"); },
      model: () => { throw new Error("no transport model expected"); },
    },
    // Clear and mild at every point on every date asked; a trip without dates never asks (1.2117).
    weather: async (points, range) => ({ status: "ok", points: points.map(() => ({ elevation: 2400, days: datesBetween(range.from, range.to)
      .map((date) => ({ date, code: 1, high: 15, low: 3, precipitationMm: 0, precipitationChance: 0, snowfallCm: 0, gustKmh: 20 })) })) }),
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
    now: () => new Date("2026-11-19T08:00:00.000Z"),
    ...(limits ? { limits } : {}),
  });
  return { repository, service, lookups, preferences };
}

/** A run that started: these tests set no site limits, so a start is never refused. */
function begun(start: PlanRunStart): Exclude<PlanRunStart, { status: "limited" }> {
  if (start.status === "limited") throw new Error(`The run was refused: ${start.reason}`);
  return start;
}

async function followToEnd(service: PlanRunService, repository: InMemoryPlanRunRepository, runId: string, afterSeq = 0) {
  // By id alone: a few tests start runs on trips of their own.
  const run = repository.runs.get(runId);
  assert.ok(run);
  const events: PlanProgressEnvelope[] = [];
  for await (const envelope of service.follow(run, afterSeq, new AbortController().signal)) events.push(envelope);
  return events;
}

test("streams real progress city by city, stops the map at its first failure, and saves a version", async () => {
  const { repository, service, lookups } = setup();
  const started = begun(await service.start(tripId, trip));
  assert.equal(started.status, "running");
  const events = await followToEnd(service, repository, started.runId);
  const types = events.map(({ event }) => event.type);

  // Sequence numbers have no gaps, and the page sees the stages in workflow order.
  assert.deepEqual(events.map(({ seq }) => seq), events.map((_, index) => index + 1));
  assert.deepEqual(events.filter(({ event }) => event.type === "stage.started").map(({ event }) => "stage" in event && event.stage),
    ["scope", "research", "map", "route", "transfers", "days", "verify", "drive", "photos", "save"]);
  assert.equal(types[0], "stage.started");
  assert.equal(types.at(-1), "run.finished");
  // Route before any day, and each day as its city is drafted.
  assert.ok(types.indexOf("route.ready") < types.indexOf("day.ready"));
  assert.deepEqual(events.flatMap(({ event }) => event.type === "day.ready" ? [[event.day.day, event.day.city, event.spots.length]] : []),
    [[1, "丽江市", 2], [2, "丽江市", 1], [3, "丽江市", 1], [4, "大理白族自治州", 1], [5, "大理白族自治州", 1]]);

  // Each city locates its spots right after its research (1.2116), so the two cities' lookups take
  // turns on Tianditu's queue. The first failure (蓝月谷) still stops the run: no retry, no lookup after it.
  assert.deepEqual(lookups, ["黑龙潭", "洱海", "玉龙雪山", "崇圣寺三塔", "丽江古城", "喜洲古镇", "蓝月谷"]);
  assert.equal(lookups.at(-1), "蓝月谷");
  const map = events.find(({ event }) => event.type === "map.checked")?.event;
  assert.deepEqual(map && map.type === "map.checked" && [map.status, map.located, map.lookups], ["stopped", 6, 7]);
  // Locating shows under research now, city by city.
  assert.ok(events.some(({ event }) => event.type === "stage.activity" && event.stage === "research" && event.activity.kind === "locating"));

  const research = events.find(({ event }) => event.type === "stage.finished" && event.stage === "research")?.event;
  assert.deepEqual(research && research.type === "stage.finished" && research.summary, { cities: 2, cards: 11, sourced: 11, searches: 4 });

  const finished = events.at(-1)?.event;
  assert.equal(finished?.type === "run.finished" && finished.status, "succeeded");
  const version = repository.versions[0];
  assert.equal(finished?.type === "run.finished" && finished.versionId, version.id);
  assert.equal(version.version, 1);
  assert.deepEqual(version.plan.draft.days.map(({ day: dayNumber, stops }) => [dayNumber, stops.length]), [[1, 2], [2, 1], [3, 1], [4, 1], [5, 1]]);
  // Only city photos exist here: each city's goes to its first day, and no photo repeats (1.2103).
  assert.deepEqual(version.plan.dayPhotos.map(({ day: dayNumber }) => dayNumber), [1, 4]);
  assert.equal(version.plan.mapCheck, "stopped");
  // Day 1's two located stops get a leg; its lookup counts toward the map's. Both sit on the same
  // point here, so they are walked, and the minutes come from the distance at walking pace (1.2103).
  assert.deepEqual(version.plan.draft.legs?.map(({ day: dayNumber, mode, durationMinutes, distanceKm }) => [dayNumber, mode, durationMinutes, distanceKm]),
    [[1, "walk", 40, 3]]);
  // No origin: setting off and going back say so; 丽江 → 大理 on day 4 is a rough drive (1.2106).
  assert.deepEqual(version.plan.draft.transfers?.map(({ kind, day: dayNumber, from, to, estimate }) =>
    [kind, dayNumber, from, to, estimate.status, estimate.status === "estimated" ? estimate.durationMinutes : null]), [
    ["outbound", 1, null, "丽江市", "origin_missing", null],
    ["between", 4, "丽江市", "大理白族自治州", "estimated", 170],
    ["return", 5, "大理白族自治州", null, "origin_missing", null],
  ]);

  const run = repository.runs.get(started.runId);
  assert.equal(run?.status, "succeeded");
  // Seven spot lookups and four for setting off, changing city and the drive between stops.
  assert.deepEqual(run?.usage, { inputTokens: 300, outputTokens: 60, searches: 4, mapLookups: 11 });

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
  assert.ok(first.status !== "limited" && second.status !== "limited");
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
  const started = begun(await service.start(tripId, trip));
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
  const started = begun(await service.start(tripId, trip));
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
  const started = begun(await service.start(tripId, trip));
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
  const started = begun(await service.start(tripId, handoff(["丽江市"], fiveDays)));
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
  const started = begun(await service.start(tripId, trip));
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
  const started = begun(await service.start(tripId, trip));
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
  const started = begun(await service.start(tripId, startsMonday));
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

test("the transport agent's question pauses at the transfers and resumes there with no new search (1.2112)", async () => {
  // From 上海 by train on fixed dates: setting off and heading home take a day on the train.
  const byTrain = { ...trip, tripState: {
    ...trip.tripState,
    origin: { state: "known" as const, value: "上海", source: "user" as const },
    startDate: { state: "known" as const, value: "2026-11-20", source: "user" as const },
    transportPreference: { state: "known" as const, value: "public_transport" as const, source: "user" as const },
  } };
  const trainSearches: string[] = [];
  const flightSearches: string[] = [];
  const longTrain = { code: "Z162", from: "上海南", to: "丽江", departs: "17:38", arrives: "22:10", arriveDayOffset: 1, durationMinutes: 1712,
    seats: [{ name: "硬卧", price: 580, left: "有" }] };
  const shortTrain = { ...longTrain, code: "C378", from: "丽江", to: "大理", departs: "12:00", arrives: "14:22", arriveDayOffset: 0, durationMinutes: 142 };
  const steps = [
    [0, 1, 2].map((leg) => ({ name: "searchTrains", args: { leg } })),
    [{ name: "searchFlights", args: { leg: 0, fromCode: "SHA", toCode: "LJG" } }, { name: "searchFlights", args: { leg: 2, fromCode: "DLU", toCode: "SHA" } }],
  ];
  const transportModel = () => createMoonshotChatModel({
    apiKey: "test", baseUrl: "https://model.test/v1", model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        messages: { role: string; tool_calls?: unknown }[]; response_format?: { json_schema?: { name?: string } };
      };
      const answer = (message: object, finish = "stop") => Response.json({ id: "chat", model: "test", created: 1,
        choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: finish }],
        usage: { prompt_tokens: 40, completion_tokens: 10, total_tokens: 50 } });
      // The pick: C378 between the cities, nothing for the ends, and no wish to ask; code asks anyway.
      if (request.response_format?.json_schema?.name === "transport_pick") return answer({ content: JSON.stringify({ legs: [
        { leg: 1, mode: "train", trainCode: "C378", flightNo: null, reason: "中午出发，下午到大理", askTraveller: null },
      ] }) });
      const calls = steps[request.messages.filter(({ role, tool_calls: made }) => role === "assistant" && made).length];
      if (!calls) return answer({ content: "done" });
      return answer({ content: null, tool_calls: calls.map(({ name, args }, index) => ({
        index, id: `call-${name}-${index}`, type: "function", function: { name, arguments: JSON.stringify(args) },
      })) }, "tool_calls");
    },
  });
  const centre = (name: string) => name.startsWith("上海") ? { longitude: 121.47, latitude: 31.23 }
    : name.startsWith("丽江") ? { longitude: 100.2, latitude: 26.9 } : { longitude: 100.2, latitude: 25.6 };
  const fakeDrive = {
    drive: async (from: { longitude: number; latitude: number }, to: { longitude: number; latitude: number }) => ({ status: "success" as const, route: {
      distanceKm: 186.4, durationSeconds: 10_200, path: [[from.longitude, from.latitude], [to.longitude, to.latitude]] as [number, number][],
      offRoadStartMeters: 0, offRoadEndMeters: 0,
    } }),
    memory: { get: () => null, set: () => {} },
    key: (from: { longitude: number }, to: { longitude: number }, mode: string) => `${mode}:${from.longitude}>${to.longitude}`,
  };
  const { repository, service, preferences } = setup({
    transfers: {
      cityPoint: async (name) => ({ status: "found", city: { name, adminCode: name, point: centre(name) } }),
      cityMemory: { get: () => null, set: () => {} },
      drive: fakeDrive,
    },
    transport: {
      searchTrains: async (search: TrainSearch) => {
        trainSearches.push(`${search.fromCity}>${search.toCity}`);
        const options = search.fromCity === "丽江" ? [shortTrain] : [longTrain];
        return { status: "found", trains: { queriedDate: search.date, reference: false, checkedAt: "2026-11-18T08:00:00.000Z", options } };
      },
      searchFlights: async (search) => {
        flightSearches.push(`${search.fromCode}>${search.toCode}`);
        return { status: "found", flights: { queriedDate: search.date, checkedAt: "2026-11-18T08:00:00.000Z", options: [{
          flightNo: "CA8559", fromAirport: "上海浦东", toAirport: "丽江三义", departs: "07:55", arrives: "11:50", arriveDayOffset: 0,
          durationMinutes: 235, cabin: "经济舱", price: 670, seatsLeft: 9, charges: 190, stopCity: null, codeshare: false,
        }] } };
      },
      model: transportModel,
    },
  });
  const started = begun(await service.start(tripId, byTrain));
  const before = await followToEnd(service, repository, started.runId);
  const waiting = before.at(-1)?.event;
  assert.equal(waiting?.type, "run.waiting");
  if (waiting?.type !== "run.waiting") return;
  // Asked by the transfers step, after the route and before any day.
  assert.equal(waiting.question.step, "transfer-legs");
  assert.match(waiting.question.text, /^去程火车最快28小时32分（Z162），飞机 CA8559 约3小时55分、¥670；回程/u);
  assert.ok(before.some(({ event }) => event.type === "route.ready"));
  assert.ok(!before.some(({ event }) => event.type === "day.ready"));
  assert.equal(repository.runs.get(started.runId)?.status, "suspended");
  assert.deepEqual(trainSearches, ["上海>丽江", "丽江>大理", "大理>上海"]);
  assert.deepEqual(flightSearches, ["SHA>LJG", "DLU>SHA"]);

  // Options only: written words do not answer it.
  assert.equal(await service.answer(tripId, started.runId, { questionId: waiting.question.id, text: "坐飞机吧" }), "wrong_question");
  assert.equal(await service.answer(tripId, started.runId, { questionId: waiting.question.id, choice: "改坐飞机" }), "resumed");
  const after = await followToEnd(service, repository, started.runId, before.at(-1)?.seq);
  const finished = after.at(-1)?.event;
  assert.equal(finished?.type === "run.finished" && finished.status, "succeeded");
  assert.ok(after.some(({ event }) => event.type === "question.answered" && event.choice === "改坐飞机"));
  // Nothing was searched again, and the route was not asked again.
  assert.equal(trainSearches.length, 3);
  assert.equal(flightSearches.length, 2);
  assert.ok(!after.some(({ event }) => event.type === "route.ready" || event.type === "city.researched"));

  const transfers = repository.versions[0].plan.draft.transfers ?? [];
  assert.deepEqual(transfers.map(({ kind, recommendation }) => [kind, recommendation?.mode, recommendation?.trainCode ?? recommendation?.flightNo, recommendation?.by]), [
    ["outbound", "flight", "CA8559", "code"],
    ["between", "train", "C378", "agent"],
    ["return", "flight", "CA8559", "code"],
  ]);
  assert.equal(transfers[0].recommendation?.reason, "你选了改坐飞机，这是用时最短的一班");
  // The answer is a preference of kind other, kept in the version too.
  assert.deepEqual(preferences.map(({ label, kind, source }) => [label, kind, source]), [["改坐飞机", "other", "question"]]);
  assert.ok(repository.versions[0].preferences.some(({ label }) => label === "改坐飞机"));
  assert.equal(repository.runs.get(started.runId)?.status, "succeeded");
});

test("a run's working time leaves out every wait for an answer", () => {
  const at = (ms: number, event: PlanProgressEnvelope["event"]): PlanProgressEnvelope => ({ runId: "r", seq: ms, at: ms, event });
  const question = { id: "00000000-0000-4000-8000-000000000001", text: "?", options: [
    { label: "a", kind: "other" as const }, { label: "b", kind: "other" as const },
  ] };
  const events = [
    at(1_000, { type: "stage.started", stage: "scope" }),
    at(5_000, { type: "run.waiting", question }),
    at(65_000, { type: "question.answered", questionId: question.id, choice: "a" }),
    at(70_000, { type: "run.waiting", question }),
  ];
  // 4 s before the first question, then 5 s after its answer: the minute of waiting is not counted.
  assert.equal(workingMs(events, 1_000), 9_000);
  assert.equal(workingMs(events.slice(0, 2), 1_000), 4_000);
});

test("the site's runs a day count only new runs; a saved plan or the same handoff never does (step 2)", async () => {
  const { repository, service } = setup({}, undefined, { runsPerDay: 1, kimiRefusal: () => null });
  const first = begun(await service.start(tripId, trip));
  await followToEnd(service, repository, first.runId);
  // The same handoff reads its saved plan, not a new run.
  assert.equal((await service.start(tripId, trip)).status, "ready");
  // Another trip's run would be the second today.
  const other = handoff(["丽江市"], fiveDays);
  assert.deepEqual(await service.start("8c3f9f0e-6f4b-4d0a-9f55-1d2a3b4c5d6e", other), { status: "limited", reason: "daily_runs" });
  assert.equal(repository.runs.size, 1);
  // Runs from before midnight in Beijing do not count.
  assert.equal(beijingDayStart(new Date("2026-11-19T08:00:00.000Z")), "2026-11-18T16:00:00.000Z");
  assert.equal(beijingDayStart(new Date("2026-11-18T17:00:00.000Z")), "2026-11-18T16:00:00.000Z");
});

test("with paid calls off or Kimi's day spent, no run starts, and a run Kimi stopped says why", async () => {
  const paused = setup({}, undefined, { runsPerDay: 15, kimiRefusal: () => "paid_calls_paused" });
  assert.deepEqual(await paused.service.start(tripId, trip), { status: "limited", reason: "paid_calls_paused" });
  assert.equal(paused.repository.runs.size, 0);
  // Kimi refused mid-run: the run ends with the limit's code, not "planner unavailable".
  let refusing = false;
  const spent = setup({ planModel: { model() {
    refusing = true;
    throw new Error("refused");
  } } }, undefined, { runsPerDay: 15, kimiRefusal: () => (refusing ? "daily_quota" : null) });
  const started = begun(await spent.service.start(tripId, trip));
  const events = await followToEnd(spent.service, spent.repository, started.runId);
  const finished = events.at(-1)?.event;
  assert.deepEqual(finished?.type === "run.finished" && [finished.status, finished.errorCode], ["failed", "daily_quota"]);
});

test("one visitor and one address get their own runs a day; a run that failed on our side gives the turn back (step 3)", async () => {
  const otherTrip = (n: number) => `8c3f9f0e-6f4b-4d0a-9f55-${String(n).padStart(12, "0")}`;
  let guestCount = 0;
  // Two runs succeed here, so the fake planner answers twice.
  const twice = [[day(1, "s1", "s2"), day(2, "s3"), day(3, "s4")], [afternoon(day(4, "s1")), day(5, "s2")]];
  const { repository, service } = setup({ planModel: { model: modelAnswering({ routes: [route, route], days: [...twice, ...twice] }) } }, undefined, {
    runsPerDay: 30, kimiRefusal: () => null,
    runsPerGuest: 1, guestRuns: async () => guestCount,
    runsPerAddress: 2,
  });
  const visitor = { guestId: "guest-a", address: "203.0.113.70" };
  const first = begun(await service.start(otherTrip(1), trip, visitor));
  await followToEnd(service, repository, first.runId);
  assert.equal(repository.runs.get(first.runId)?.status, "succeeded");
  guestCount = 1;
  // The same visitor again: its one run a day is used.
  assert.deepEqual(await service.start(otherTrip(2), trip, visitor), { status: "limited", reason: "guest_runs" });
  // A new cookie from the same address gets the address's second run, then no more.
  const fresh = { guestId: "guest-b", address: "203.0.113.70" };
  guestCount = 0;
  const second = begun(await service.start(otherTrip(3), trip, fresh));
  await followToEnd(service, repository, second.runId);
  assert.equal(repository.runs.get(second.runId)?.status, "succeeded");
  assert.deepEqual(await service.start(otherTrip(4), trip, { guestId: "guest-c", address: "203.0.113.70" }), { status: "limited", reason: "address_runs" });
});

test("a run that fails on Meri's side does not use up the address's runs", async () => {
  const { repository, service } = setup({ planModel: { model() {
    throw new Error("MOONSHOT_API_KEY is required");
  } } }, undefined, { runsPerDay: 30, kimiRefusal: () => null, runsPerAddress: 1 });
  const visitor = { guestId: "guest-d", address: "203.0.113.71" };
  const failed = begun(await service.start(tripId, trip, visitor));
  await followToEnd(service, repository, failed.runId);
  assert.equal(repository.runs.get(failed.runId)?.status, "failed");
  // The failed run was given back: the same address may start again.
  assert.notEqual((await service.start("8c3f9f0e-6f4b-4d0a-9f55-000000000099", handoff(["丽江市"], fiveDays), visitor)).status, "limited");
});

test("each city's spots get their forecast inside research, and the saved plan keeps it (1.2117)", async () => {
  const dated = { ...trip, tripState: { ...trip.tripState, startDate: { state: "known" as const, value: "2026-11-20", source: "user" as const } } };
  const asked: { points: number; from: string; to: string }[] = [];
  const { repository, service } = setup({
    weather: async (points, range) => {
      asked.push({ points: points.length, ...range });
      return { status: "ok", points: points.map(() => ({ elevation: 2454, days: ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"]
        .map((date) => ({ date, code: date === "2026-11-21" ? 95 : 1, high: 15, low: 3, precipitationMm: date === "2026-11-21" ? 30 : 0,
          precipitationChance: 0, snowfallCm: 0, gustKmh: 20 })) })) };
    },
  });
  const started = begun(await service.start(tripId, dated));
  const events = await followToEnd(service, repository, started.runId);

  // The fake map fails at 蓝月谷, which stops Tianditu for the run: a spot left unlocated then has no
  // centre to fall back on and no weather; every other spot has its forecast.
  // One request a city, over the whole trip's dates (now is 2026-11-15, so all five are inside the forecast).
  assert.equal(asked.length, 2);
  assert.ok(asked.every(({ from, to }) => from === "2026-11-20" && to === "2026-11-24"));
  assert.ok(events.some(({ event }) => event.type === "stage.activity" && event.activity.kind === "forecasting"));
  const spots = repository.versions[0].plan.spots;
  assert.ok(spots.length > 0);
  const forecasts = spots.filter(({ weather }) => weather?.status === "forecast");
  assert.ok(forecasts.length > 0);
  assert.ok(forecasts.every(({ weather }) => weather?.status === "forecast" && weather.days.length === 5));
  assert.ok(spots.filter(({ mapCheck }) => mapCheck.status !== "located").every(({ weather }) => weather?.status === "unavailable"));
});
