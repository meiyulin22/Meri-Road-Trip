import assert from "node:assert/strict";
import test from "node:test";

import { Mastra } from "@mastra/core";
import { InMemoryStore } from "@mastra/core/storage";

import { afternoon, dali, day, fiveDays, handoff, lijiang, modelAnswering } from "@/agents/planner/plan-test-fixtures";
import { PlanRunService } from "@/capabilities/planning/plan-run-service";
import type { PlanProgressEnvelope } from "@/domain/plan/plan-progress";
import type { CityResearch } from "@/domain/plan/spot-card";
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
    findImage: async (subject) => subject.spot ? null : { url: `/photos/${subject.place}.jpg`, caption: subject.place ?? "城市" },
    saveVersion: (version) => repository.createVersion(version),
    now: () => new Date("2026-11-15T08:00:00.000Z"),
    ...overrides,
  });
  const mastra = new Mastra({ workflows: { planGeneration: workflow }, storage: new InMemoryStore(), logger: false });
  let id = 0;
  const service = new PlanRunService({
    repository,
    workflow: async () => ({ workflow: mastra.getWorkflow("planGeneration") }),
    newId: () => `00000000-0000-4000-8000-00000000000${++id}`,
    timeLimitMs,
  });
  return { repository, service, lookups };
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
    ["scope", "research", "map", "route", "days", "photos", "save"]);
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
