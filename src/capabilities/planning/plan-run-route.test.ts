import assert from "node:assert/strict";
import test from "node:test";

import {
  answerPlanQuestion,
  parseProgressMessage,
  planRunEventsUrl,
  PlanDraftRequestError,
  readLatestPlan,
  runFailure,
  sourceHost,
  sourcedFacts,
  startPlanRun,
  stopsBySlot,
} from "@/components/trip-plan/plan-draft-model";
import { applyProgress, emptyProgress, pendingDays } from "@/components/trip-plan/plan-progress-view";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { PlanProgressEnvelope } from "@/domain/plan/plan-progress";
import type { PlanRun, PlanVersion } from "@/domain/plan/plan-run";
import type { PlanDraft } from "@/domain/plan/plan-draft";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import type { CityResearch, SpotCard } from "@/domain/plan/spot-card";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";

import { dayPhotos } from "@/agents/planner/day-photos";

import {
  handlePlanAnswerPost,
  handlePlanGet,
  handlePlanRunEvents,
  handlePlanRunPost,
  type PlanRunDependencies,
} from "./plan-run-handler";
import { canonicalJson } from "./plan-run-service";

const tripState: TripState = {
  name: { state: "missing" },
  origin: { state: "missing" },
  destination: { state: "known", source: "user", areas: [
    { province: "云南省", places: [{ name: "丽江市", spots: ["玉龙雪山"] }] },
    { province: "四川省", places: [] },
  ] },
  startDate: { state: "known", value: "2026-12-20", source: "user" },
  endDate: { state: "missing" },
  duration: { state: "known", value: "2天", source: "user" },
  transportPreference: { state: "missing" },
};
const handoff: PlanHandoff = {
  tripState, referenceDate: "2026-11-12", timezone: "Asia/Shanghai", locale: "zh",
  preferenceStatus: "ready", preferences: [{ id: "p1", label: "晚上逛古城", kind: "interests", pace: null, quote: "晚上想逛古城", source: "conversation",
    messageId: "m1", createdAt: "2026-11-12T08:00:00.000Z" }],
};
const evidence = { url: "https://www.example.com/a", title: "来源", publishedAt: null, checkedAt: "2026-11-12T08:00:00.000Z", quote: "索道末班16:00" };

function card(name: string, overrides: Partial<SpotCard> = {}): SpotCard {
  return {
    id: name, province: "云南省", city: "丽江市", name, requested: false,
    location: { ...evidence, quote: name + "位于丽江市" }, opening: null, reservation: null,
    setting: null, walking: null, suggestedDuration: null, mapCheck: { status: "unchecked" }, ...overrides,
  };
}

const research: CityResearch[] = [{
  province: "云南省", city: "丽江市", status: "partial", searchCalls: 3,
  spots: [card("玉龙雪山", { requested: true, opening: evidence }), card("丽江古城"), card("黑龙潭")],
}];
const draft: PlanDraft = {
  mode: "full",
  totalDays: 2,
  route: { source: "agent", cities: [{ province: "云南省", city: "丽江市", days: 2, reason: "雪山和古城" }], omitted: [] },
  days: [
    { day: 1, date: "2026-12-20", province: "云南省", city: "丽江市", arrivingFrom: null, focus: "玉龙纳西族自治县", theme: "雪山", stops: [
      { spotId: "丽江古城", slot: "evening", anchor: null },
      { spotId: "玉龙雪山", slot: "morning", anchor: { time: "16:00", reason: "索道末班 16:00", evidence } },
    ] },
    { day: 2, date: "2026-12-21", province: "云南省", city: "丽江市", arrivingFrom: null, focus: null, theme: null, stops: [] },
  ],
  conflicts: [{ kind: "not_enough_candidates", day: 2 }],
  unverified: [{ spotId: "丽江古城", fields: ["opening", "reservation"] }],
};
const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const runId = "00000000-0000-4000-8000-000000000001";
const versionId = "00000000-0000-4000-8000-000000000002";
const plan: ReadyPlan = {
  status: "ready", draft, spots: research[0].spots.slice(0, 2), cities: [{ province: "云南省", city: "丽江市", status: "partial" }],
  pendingProvinces: ["四川省"], mapCheck: "stopped", dayPhotos: [{ day: 1, image: { url: "/photos/yulong.jpg", caption: "玉龙雪山" } }],
};
const run: PlanRun = {
  id: runId, tripId, status: "running", handoff, handoffKey: "key", errorCode: null, usage: null,
  startedAt: "2026-11-15T08:00:00.000Z", finishedAt: null, durationMs: null,
};
const version: PlanVersion = {
  id: versionId, tripId, runId, version: 1, tripState, preferences: handoff.preferences, plan, createdAt: "2026-11-15T08:01:00.000Z",
};
const unreachable = async (): Promise<never> => assert.fail("Dependency should not be called");

function deps(overrides: Partial<PlanRunDependencies["service"]> = {}, state: TripState = tripState): PlanRunDependencies {
  return {
    async loadJourney(id, owner) {
      assert.deepEqual([id, owner], [tripId, "owner-id"]);
      return { tripState: state };
    },
    service: { start: unreachable, latest: unreachable, findRun: unreachable, answer: unreachable,
      follow: () => assert.fail("follow"), ...overrides },
  };
}

test("starts a run for a handoff that matches the saved journey, or answers with its saved plan", async () => {
  const running = await startPlanRun(tripId, handoff, new AbortController().signal, async (url, init) => {
    assert.equal(url, `/api/trips/${tripId}/plan-runs`);
    assert.equal(init?.method, "POST");
    return handlePlanRunPost(tripId, "owner-id", JSON.parse(String(init?.body)), deps({
      async start(id, received) {
        assert.equal(id, tripId);
        assert.deepEqual(received.preferences, handoff.preferences);
        return { status: "running", runId };
      },
    }));
  });
  assert.deepEqual(running, { status: "running", runId });

  const ready = await startPlanRun(tripId, handoff, new AbortController().signal, async (_url, init) =>
    handlePlanRunPost(tripId, "owner-id", JSON.parse(String(init?.body)), deps({
      start: async () => ({ status: "ready", runId, version }),
    })));
  assert.equal(ready.status, "ready");
  assert.equal(ready.status === "ready" && ready.plan.draft.days[0].stops[1].anchor?.time, "16:00");
});

test("refuses a changed journey before any run, answers a trip without a city, and maps the other failures", async () => {
  const changed: TripState = { ...tripState, duration: { state: "known", value: "3天", source: "user" } };
  const conflict = await handlePlanRunPost(tripId, "owner-id", handoff, deps({}, changed));
  assert.equal(conflict.status, 409);
  await assert.rejects(startPlanRun(tripId, handoff, new AbortController().signal, async () => conflict),
    (error) => error instanceof PlanDraftRequestError && error.reason === "journey_changed");

  const provinceOnly: TripState = { ...tripState, destination: { state: "known", source: "user", areas: [
    { province: "云南省", places: [] },
  ] } };
  const unsupported = await handlePlanRunPost(tripId, "owner-id", { ...handoff, tripState: provinceOnly }, deps({}, provinceOnly));
  assert.deepEqual(await unsupported.json(), { status: "unsupported", reason: "no_city" });

  assert.equal((await handlePlanRunPost(tripId, null, handoff, deps())).status, 404);
  assert.equal((await handlePlanRunPost(tripId, "owner-id", { tripState }, deps())).status, 400);
  assert.equal((await handlePlanRunPost(tripId, "owner-id", handoff, {
    loadJourney: async () => { throw new TripNotFoundError(tripId); }, service: deps().service,
  })).status, 404);
  assert.equal(runFailure("planner_unavailable"), "unavailable");
  assert.equal(runFailure("interrupted"), "interrupted");
});

test("reads the newest plan and says when the trip changed after it", async () => {
  const changed: TripState = { ...tripState, endDate: { state: "known", value: "2026-12-22", source: "user" } };
  const latest = await readLatestPlan(tripId, new AbortController().signal, async () =>
    handlePlanGet(tripId, "owner-id", deps({
      latest: async () => ({ version, run: { ...run, status: "succeeded", finishedAt: "2026-11-15T08:01:00.000Z", durationMs: 60_000 } }),
    }, changed)));
  assert.equal(latest.version?.stale, true);
  assert.equal(latest.run?.status, "succeeded");

  const fresh = await handlePlanGet(tripId, "owner-id", deps({ latest: async () => ({ version, run: null }) }));
  assert.equal((await fresh.json()).version.stale, false);
  // Key order differs once jsonb has stored it; the comparison does not care.
  assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] }), canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
});

test("streams a run's events as SSE from Last-Event-ID, which the page reads back in order", async () => {
  const envelopes: PlanProgressEnvelope[] = [
    { runId, seq: 3, at: 3000, event: { type: "route.ready", route: draft.route } },
    { runId, seq: 4, at: 4000, event: { type: "day.ready", day: draft.days[0], spots: research[0].spots.slice(0, 2) } },
    { runId, seq: 5, at: 5000, event: { type: "run.finished", status: "succeeded", versionId, errorCode: null, ms: 5000 } },
  ];
  const response = await handlePlanRunEvents(tripId, "owner-id", runId, "2", new AbortController().signal, deps({
    findRun: async () => run,
    async *follow(followed, afterSeq) {
      assert.equal(followed, run);
      assert.equal(afterSeq, 2);
      yield* envelopes;
    },
  }));
  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const body = await response.text();
  const messages = body.split("\n\n").filter((block) => block.startsWith("id: "));
  assert.deepEqual(messages.map((block) => block.split("\n")[0]), ["id: 3", "id: 4", "id: 5"]);

  // The page applies them: route first, then the day with its cards, then the end.
  let view = { ...emptyProgress, lastSeq: 2 };
  for (const block of messages) {
    const envelope = parseProgressMessage(block.split("\n")[1].slice("data: ".length), runId);
    assert.ok(envelope);
    view = applyProgress(view, envelope);
  }
  assert.deepEqual(view.route, draft.route);
  assert.deepEqual(pendingDays(view), [2]);
  assert.deepEqual(Object.keys(view.spots), ["玉龙雪山", "丽江古城"]);
  assert.equal(view.finished?.status, "succeeded");
  // A replayed event changes nothing; another run's event is not read.
  assert.equal(applyProgress(view, envelopes[0]), view);
  assert.equal(parseProgressMessage(JSON.stringify({ ...envelopes[0], runId: versionId }), runId), null);

  const missing = await handlePlanRunEvents(tripId, "owner-id", runId, null, new AbortController().signal, deps({
    findRun: async () => null,
  }));
  assert.equal(missing.status, 404);
});

test("the live view keeps one activity line a city and clears it when the city is done", () => {
  let view = applyProgress(emptyProgress, { runId, seq: 1, at: 1000, event: { type: "stage.started", stage: "research" } });
  view = applyProgress(view, { runId, seq: 2, at: 1100, event: { type: "stage.activity", stage: "research",
    activity: { kind: "nominating", city: "丽江市" } } });
  view = applyProgress(view, { runId, seq: 3, at: 1200, event: { type: "stage.activity", stage: "research",
    activity: { kind: "searching", city: "丽江市", names: ["玉龙雪山"], done: 0, total: 1 } } });
  view = applyProgress(view, { runId, seq: 4, at: 1300, event: { type: "stage.activity", stage: "research",
    activity: { kind: "nominating", city: "大理白族自治州" } } });
  const research = () => view.stages.find(({ stage }) => stage === "research");
  // 丽江市 keeps the first line while it changes; 大理 joins below it.
  assert.deepEqual(research()?.activities.map((activity) => [activity.kind, "city" in activity && activity.city]),
    [["searching", "丽江市"], ["nominating", "大理白族自治州"]]);
  view = applyProgress(view, { runId, seq: 5, at: 1350, event: { type: "stage.activity", stage: "research",
    activity: { kind: "reviewing", city: "丽江市", sources: 12 } } });
  assert.deepEqual(research()?.activities.map((activity) => activity.kind), ["reviewing", "nominating"]);
  view = applyProgress(view, { runId, seq: 6, at: 9000, event: { type: "city.researched", province: "云南省", city: "丽江市",
    status: "ready", cards: 7, sourced: 7, searches: 3, ms: 7900 } });
  assert.deepEqual(research()?.activities.map((activity) => "city" in activity && activity.city), ["大理白族自治州"]);
  assert.equal(research()?.status, "running");
  assert.equal(research()?.startedAt, 1000);
  view = applyProgress(view, { runId, seq: 7, at: 20000, event: { type: "stage.finished", stage: "research", ms: 19000,
    summary: { cities: 2, cards: 12, sourced: 11, searches: 7 } } });
  assert.equal(research()?.status, "done");
  assert.deepEqual(research()?.activities, []);

  // Days are drafted one city at a time: the next city's line replaces the last.
  view = applyProgress(view, { runId, seq: 8, at: 21000, event: { type: "stage.activity", stage: "days",
    activity: { kind: "drafting", city: "大理白族自治州", days: [1, 2], attempt: 1 } } });
  view = applyProgress(view, { runId, seq: 9, at: 25000, event: { type: "stage.activity", stage: "days",
    activity: { kind: "drafting", city: "丽江市", days: [3, 4, 5], attempt: 1 } } });
  assert.deepEqual(view.stages.find(({ stage }) => stage === "days")?.activities.map((activity) => "city" in activity && activity.city),
    ["丽江市"]);
});

test("the page groups a day by slot and shows each sourced fact once", () => {
  assert.deepEqual(stopsBySlot(draft.days[0]).map(({ slot, stops }) => [slot, stops.map(({ spotId }) => spotId)]),
    [["morning", ["玉龙雪山"]], ["evening", ["丽江古城"]]]);
  assert.deepEqual(stopsBySlot(draft.days[1]), []);
  assert.deepEqual(sourcedFacts(research[0].spots[0]).map(({ fact }) => fact), ["opening"]);
  assert.equal(sourceHost("https://www.example.com/a"), "example.com");
  assert.equal(sourceHost("not a url"), "not a url");
});

test("two days in one city use different photos, and a day with nothing new goes without (1.2103)", async () => {
  const days = [1, 2, 3].map((day) => ({ day, date: null, province: "云南省", city: "丽江市", arrivingFrom: null, focus: null, theme: null,
    stops: [{ spotId: day === 1 ? "玉龙雪山" : "丽江古城", slot: "morning" as const, anchor: null }] }));
  const reported: number[] = [];
  const photos = await dayPhotos(days, (spotId) => spotId, async (subject) =>
    subject.spot === "玉龙雪山" ? { url: "/photos/yulong.jpg", caption: "玉龙雪山" }
      : subject.spot === null ? { url: "/photos/lijiang.jpg", caption: "丽江市" } : null, ({ day }) => reported.push(day));
  assert.deepEqual(photos.map(({ day, image }) => [day, image.url]),
    [[1, "/photos/yulong.jpg"], [2, "/photos/lijiang.jpg"]]);
  assert.deepEqual(reported, [1, 2]);
});

test("answers a waiting run's question, and refuses answers it cannot take", async () => {
  const questionId = "00000000-0000-4000-8000-000000000003";
  await answerPlanQuestion(tripId, runId, { questionId, choice: "山水" }, new AbortController().signal, async (url, init) => {
    assert.equal(url, `/api/trips/${tripId}/plan-runs/${runId}/answer`);
    return handlePlanAnswerPost(tripId, "owner-id", runId, JSON.parse(String(init?.body)), deps({
      async answer(id, run, answer) {
        assert.deepEqual([id, run, answer], [tripId, runId, { questionId, choice: "山水" }]);
        return "resumed";
      },
    }));
  });
  for (const [outcome, status] of [["not_found", 404], ["not_waiting", 409], ["wrong_question", 409]] as const) {
    const response = await handlePlanAnswerPost(tripId, "owner-id", runId, { questionId, choice: null }, deps({ answer: async () => outcome }));
    assert.equal(response.status, status);
  }
  assert.equal((await handlePlanAnswerPost(tripId, "owner-id", runId, { choice: "山水" }, deps())).status, 400);
  assert.equal((await handlePlanAnswerPost(tripId, null, runId, { questionId, choice: null }, deps())).status, 404);
  // After answering, the page opens a new stream after the last event it has.
  assert.equal(planRunEventsUrl(tripId, runId, 12), `/api/trips/${tripId}/plan-runs/${runId}/events?after=12`);
  assert.equal(planRunEventsUrl(tripId, runId), `/api/trips/${tripId}/plan-runs/${runId}/events`);
});

test("the live view stops its clock while waiting for an answer and remembers the answer", () => {
  const question = { id: "00000000-0000-4000-8000-000000000003", text: "山水还是古城？",
    options: [{ label: "山水", kind: "interests" as const }, { label: "古城", kind: "interests" as const }] };
  let view = applyProgress(emptyProgress, { runId, seq: 1, at: 1000, event: { type: "stage.started", stage: "route" } });
  view = applyProgress(view, { runId, seq: 2, at: 4000, event: { type: "run.waiting", question } });
  assert.equal(view.question?.id, question.id);
  assert.equal(view.waitingSince, 4000);
  view = applyProgress(view, { runId, seq: 3, at: 64000, event: { type: "question.answered", questionId: question.id, choice: "山水" } });
  assert.equal(view.question, null);
  assert.equal(view.waitedMs, 60000);
  assert.deepEqual(view.answers, [{ question: "山水还是古城？", choice: "山水", step: "plan-route" }]);
});

test("each answer keeps the step that asked, so the transport answer is listed under the transfers (1.2112)", () => {
  const runId = "00000000-0000-4000-8000-000000000001";
  const question = (id: string, step?: "transfer-legs") => ({ id, text: "?", ...(step ? { step } : {}), options: [
    { label: "a", kind: "other" as const }, { label: "b", kind: "other" as const },
  ] });
  const route = question("00000000-0000-4000-8000-000000000002");
  const transport = question("00000000-0000-4000-8000-000000000003", "transfer-legs");
  let view = applyProgress(emptyProgress, { runId, seq: 1, at: 1000, event: { type: "run.waiting", question: route } });
  view = applyProgress(view, { runId, seq: 2, at: 2000, event: { type: "question.answered", questionId: route.id, choice: "a" } });
  view = applyProgress(view, { runId, seq: 3, at: 3000, event: { type: "run.waiting", question: transport } });
  view = applyProgress(view, { runId, seq: 4, at: 5000, event: { type: "question.answered", questionId: transport.id, choice: null } });
  assert.deepEqual(view.answers.map(({ choice, step }) => [choice, step]), [["a", "plan-route"], [null, "transfer-legs"]]);
  assert.equal(view.waitedMs, 3000);
});
