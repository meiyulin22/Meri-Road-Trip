import assert from "node:assert/strict";
import test from "node:test";

import { validateTripDraftDomain, type TripDraft } from "@/domain/trip-draft/trip-draft";
import { applyTripStatePatch, initializeTripState } from "@/domain/trip-state/trip-state";
import type { LocationCandidate } from "@/domain/location/location";
import type { Journey } from "./journey-service";
import { createJourneyWithOpening } from "./create-journey-with-opening";

const journey: Journey = {
  trip: {
    id: "3d17d2c7-fd9b-4748-b751-3a76a9a920be",
    status: "idea",
    createdAt: "2026-09-25T01:00:00.000Z",
    updatedAt: "2026-09-25T01:00:00.000Z",
  },
  tripState: {
    name: { state: "known", value: "日本滑雪", source: "system" },
    origin: { state: "missing" },
    destination: { state: "known", value: "日本", source: "user" },
    startDate: { state: "missing" },
    endDate: { state: "missing" },
    duration: { state: "missing" },
    transportPreference: { state: "missing" },
  },
};
const draft: TripDraft = {
  name: { state: "known", value: "调皮省开心市之旅" },
  origin: { state: "missing" },
  destination: { state: "known", value: "调皮省开心市" },
  startDate: { state: "approximate", value: "十月份" },
  endDate: { state: "missing" },
  duration: { state: "known", value: "5天" },
  transportPreference: { state: "missing" },
};
const input = {
  draft,
  ownerGuestId: "25ba5b26-8db0-4fe3-bfcc-b684dd7889cc",
  initialUserMessage: "Original Home idea",
  requestId: "request-1",
  referenceDate: "2026-09-25",
  timezone: "Asia/Shanghai",
};

test("creates Journey and initial user before generating the opening reply", async () => {
  const order: string[] = [];
  const result = await createJourneyWithOpening(input, {
    async resolveDestination() { order.push("resolve"); return { status: "resolved", candidate: candidateA }; },
    async createJourney(draft, owner, message) {
      order.push("journey-and-user");
      assert.deepEqual(draft, input.draft);
      assert.equal(owner, input.ownerGuestId);
      assert.equal(message, input.initialUserMessage);
      return journey;
    },
    async initializeOpening(request) {
      order.push("assistant");
      assert.equal(request.tripId, journey.trip.id);
    },
  });
  assert.deepEqual(order, ["resolve", "journey-and-user", "assistant"]);
  assert.equal(result.opening, "completed");
});

test("AI failure leaves the created Journey available", async () => {
  const aiError = new Error("model unavailable");
  const result = await createJourneyWithOpening(input, {
    async resolveDestination() { return { status: "resolved", candidate: candidateA }; },
    async createJourney() { return journey; },
    async initializeOpening() { throw aiError; },
  });
  assert.strictEqual(result.journey, journey);
  assert.equal(result.opening, "failed");
  assert.equal(result.openingError, aiError);
});

test("creation failure does not call AI and absent initial message does not need one", async () => {
  let calls = 0;
  await assert.rejects(createJourneyWithOpening(input, {
    async resolveDestination() { return { status: "resolved", candidate: candidateA }; },
    async createJourney() { throw new Error("initial user insert failed"); },
    async initializeOpening() { calls += 1; },
  }));
  const result = await createJourneyWithOpening({ ...input, initialUserMessage: undefined }, {
    async resolveDestination() { return { status: "resolved", candidate: candidateA }; },
    async createJourney() { return journey; },
    async initializeOpening() { calls += 1; },
  });
  assert.equal(calls, 0);
  assert.equal(result.opening, "not_requested");
});

const candidateA: LocationCandidate = {
  providerId: "poi-a", name: "青岛市", province: "山东省", city: "青岛市", district: null,
  region: "山东省", address: null,
  longitude: 120.38, latitude: 36.07, coordinateSystem: "GCJ-02",
};
const candidateB: LocationCandidate = {
  ...candidateA, providerId: "poi-b", name: "青岛", address: "市南区",
};

test("missing destination skips Provider and preserves ordinary opening", async () => {
  let lookups = 0;
  let openings = 0;
  const missingDraft = { ...draft, name: { state: "missing" as const }, destination: { state: "missing" as const } };
  const result = await createJourneyWithOpening({ ...input, draft: missingDraft }, {
    async resolveDestination() { lookups += 1; throw new Error("Provider must not be called"); },
    async createJourney(received, _owner, _message, assistant) {
      assert.deepEqual(received, missingDraft);
      assert.equal(assistant, undefined);
      return journey;
    },
    async initializeOpening() { openings += 1; },
  });
  assert.equal(lookups, 0);
  assert.equal(openings, 1);
  assert.equal(result.opening, "completed");
});

test("resolved destination is validated exactly once before persistence without selection metadata", async () => {
  const order: string[] = [];
  const result = await createJourneyWithOpening(input, {
    async resolveDestination(expression) {
      order.push("provider");
      assert.equal(expression, draft.destination.state === "missing" ? null : draft.destination.value);
      return { status: "resolved", candidate: candidateA };
    },
    async createJourney(received, _owner, _message, assistant) {
      order.push("persist");
      assert.equal(assistant, undefined);
      assert.deepEqual(received, draft);
      const state = initializeTripState(received as TripDraft);
      assert.deepEqual(state.destination, { state: "known", value: "调皮省开心市", source: "user" });
      return { ...journey, tripState: state };
    },
    async initializeOpening() { order.push("llm"); },
  });
  assert.equal(result.opening, "completed");
  assert.deepEqual(order, ["provider", "persist", "llm"]);
});

test("missing auxiliary signal follows direct Home destination validation", async () => {
  const directDraft: TripDraft = { ...draft,
    destinationDisambiguation: { state: "missing", value: null } };
  let lookups = 0;
  await createJourneyWithOpening({ ...input, draft: directDraft }, {
    async resolveDestination(expression) {
      lookups += 1;
      assert.equal(expression, "调皮省开心市");
      return { status: "resolved", candidate: candidateA };
    },
    async createJourney(received) {
      assert.equal(validateTripDraftDomain(received).destination.state, "known");
      return journey;
    },
    async initializeOpening() {},
  });
  assert.equal(lookups, 1);
});

test("ambiguous destination is removed, other fields survive, and persisted opening carries candidates", async () => {
  let openingModelCalls = 0;
  const presentation = { type: "location_candidates" as const, candidates: [candidateA, candidateB] };
  const result = await createJourneyWithOpening(input, {
    async resolveDestination() { return { status: "ambiguous", candidates: [candidateA, candidateB] }; },
    async createJourney(received, _owner, _message, assistant) {
      const state = initializeTripState(validateTripDraftDomain(received));
      assert.deepEqual(state.destination, { state: "missing" });
      assert.deepEqual(state.name, { state: "missing" });
      assert.deepEqual(state.startDate, { state: "approximate", value: "十月份", source: "user" });
      assert.deepEqual(state.duration, { state: "known", value: "5天", source: "user" });
      assert.deepEqual(assistant?.presentation, presentation);
      assert.match(assistant?.content ?? "", /请选一个/);
      assert.match(assistant?.content ?? "", /Journey Overview/);
      return { ...journey, tripState: state };
    },
    async initializeOpening() { openingModelCalls += 1; },
  });
  assert.equal(result.opening, "completed");
  assert.equal(openingModelCalls, 0);
  const selected = applyTripStatePatch(result.journey.tripState, {
    destination: { state: "known", value: candidateA.name, source: "user", selection: {
      provider: "amap", providerId: candidateA.providerId, region: candidateA.region,
      address: candidateA.address, coordinates: { longitude: candidateA.longitude,
        latitude: candidateA.latitude, coordinateSystem: candidateA.coordinateSystem },
    } },
  });
  assert.equal(selected.name.state, "known");
  assert.equal(selected.name.value, "青岛市之旅");
});

test("unresolved and provider_error keep destination missing with distinct respectful replies", async () => {
  for (const status of ["unresolved", "provider_error"] as const) {
    const result = await createJourneyWithOpening(input, {
      async resolveDestination() { return { status }; },
      async createJourney(received, _owner, _message, assistant) {
        const state = initializeTripState(received as TripDraft);
        assert.equal(state.destination.state, "missing");
        assert.equal(state.name.state, "missing");
        assert.equal(state.duration.state, "known");
        assert.equal(state.startDate.state, "approximate");
        assert.ok(assistant);
        assert.match(assistant.content, status === "unresolved" ? /暂时没找到/ : /暂时无法验证/);
        assert.match(assistant.content, /Journey Overview/);
        assert.doesNotMatch(assistant.content, /不存在|假|错误|已记住/);
        return { ...journey, tripState: state };
      },
      async initializeOpening() { throw new Error("Rejected destination must not use opening LLM"); },
    });
    assert.equal(result.opening, "completed");
  }
});

test("fuzzy Home creation skips raw lookup, keeps dates, and stores a single confirmation card", async () => {
  const fuzzyDraft: TripDraft = { ...draft, destination: { state: "known", value: "潮汕" },
    destinationDisambiguation: { state: "known", value: ["潮州", "汕头"] } };
  const result = await createJourneyWithOpening({ ...input, draft: fuzzyDraft }, {
    async resolveDestination() { throw new Error("raw fuzzy lookup must be skipped"); },
    async verifyDisambiguation(expressions) {
      assert.deepEqual(expressions, ["潮州", "汕头"]);
      return { status: "verified", candidates: [candidateA] };
    },
    async createJourney(received, _owner, _message, assistant) {
      const state = initializeTripState(validateTripDraftDomain(received));
      assert.equal(state.destination.state, "missing");
      assert.equal(state.startDate.state, "approximate");
      assert.equal(state.duration.state, "known");
      assert.deepEqual(assistant?.presentation, { type: "location_candidates", candidates: [candidateA] });
      assert.match(assistant?.content ?? "", /潮汕.*一个更具体的地点/);
      return { ...journey, tripState: state };
    },
    async initializeOpening() { throw new Error("no extra LLM call"); },
  });
  assert.equal(result.opening, "completed");
});

test("fuzzy Home provider failure creates a Journey without destination or cards", async () => {
  const fuzzyDraft: TripDraft = { ...draft,
    destinationDisambiguation: { state: "known", value: ["潮州", "汕头"] } };
  const result = await createJourneyWithOpening({ ...input, draft: fuzzyDraft }, {
    async resolveDestination() { throw new Error("raw lookup must be skipped"); },
    async verifyDisambiguation() { return { status: "provider_error" }; },
    async createJourney(received, _owner, _message, assistant) {
      const state = initializeTripState(validateTripDraftDomain(received));
      assert.equal(state.destination.state, "missing");
      assert.equal(state.duration.state, "known");
      assert.equal(assistant?.presentation, undefined);
      assert.match(assistant?.content ?? "", /暂时无法验证/);
      return { ...journey, tripState: state };
    },
    async initializeOpening() { throw new Error("no extra LLM call"); },
  });
  assert.equal(result.opening, "completed");
});

test("fuzzy Home creation presents multiple verified candidates", async () => {
  const fuzzyDraft: TripDraft = { ...draft,
    destinationDisambiguation: { state: "known", value: ["潮州", "汕头"] } };
  await createJourneyWithOpening({ ...input, draft: fuzzyDraft }, {
    async resolveDestination() { throw new Error("raw lookup must be skipped"); },
    async verifyDisambiguation() { return { status: "verified", candidates: [candidateA, candidateB] }; },
    async createJourney(received, _owner, _message, assistant) {
      assert.equal(validateTripDraftDomain(received).destination.state, "missing");
      assert.deepEqual(assistant?.presentation, { type: "location_candidates", candidates: [candidateA, candidateB] });
      return journey;
    },
    async initializeOpening() { throw new Error("no extra LLM call"); },
  });
});
