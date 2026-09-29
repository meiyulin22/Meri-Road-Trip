import assert from "node:assert/strict";
import test from "node:test";

import { handleDestinationRecommendationsPost } from "@/app/api/trips/[id]/destination-recommendations/route";
import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { TripUserAction } from "@/domain/trip-user-action/trip-user-action";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import type { DestinationRecommendationContext } from "./destination-recommendation-context";
import { InvalidDestinationRecommendationOutputError } from "./destination-recommendation-generator";
import type { DestinationRecommendationWorkflowResult } from "./destination-recommendation-workflow";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const state: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const history: TripMessage[] = [
  { id: "real-user", tripId, role: "user", content: "我想旅行", createdAt: "2026-09-26T00:00:00.000Z" },
];
const workflowResult: DestinationRecommendationWorkflowResult = {
  content: "我结合你的偏好筛了几个方向。",
  presentation: { type: "destination_recommendations", destinations: [
    { id: "c1", name: "甘孜藏族自治州", province: "四川省", reason: "适合徒步" },
    { id: "c2", name: "迪庆藏族自治州", province: "云南省", reason: "适合登山" },
  ] },
};

function dependencies(result: DestinationRecommendationWorkflowResult = workflowResult) {
  const calls: string[] = [];
  const saved: TripMessage[] = [];
  let action: TripUserAction | null = null;
  let context: DestinationRecommendationContext | null = null;
  return { calls, saved, get action() { return action; }, get context() { return context; }, deps: {
    async loadJourney() { calls.push("load"); return { tripState: state }; },
    async persistAction(input: TripUserAction) { calls.push("action"); action = input; return input; },
    async listMessages() { calls.push("history"); return history; },
    async runWorkflow(input: DestinationRecommendationContext) { calls.push("workflow"); context = input; return result; },
    async persistMessage(message: TripMessage) { calls.push("message"); saved.push(message); },
  } };
}

test("explicit action uses shared workflow and persists one assistant with two cards", async () => {
  const fixture = dependencies();
  const response = await handleDestinationRecommendationsPost(tripId, "owner", fixture.deps, "request-1");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(fixture.calls, ["load", "action", "history", "workflow", "message"]);
  assert.equal(fixture.action?.type, "request_destination_recommendations");
  assert.equal(fixture.context?.source, "explicit_action");
  assert.equal(fixture.context?.tripState, state);
  assert.deepEqual(fixture.context?.conversationHistory, [{ role: "user", content: "我想旅行" }]);
  assert.equal(fixture.saved.length, 1);
  assert.deepEqual(body.message, fixture.saved[0]);
  assert.deepEqual(body.message.presentation, workflowResult.presentation);
});

test("zero results persist a reply without a card presentation", async () => {
  const fixture = dependencies({ content: "这次没有筛出合适的目的地。" });
  const response = await handleDestinationRecommendationsPost(tripId, "owner", fixture.deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.message.content, "这次没有筛出合适的目的地。");
  assert.equal("presentation" in body.message, false);
  assert.equal(fixture.saved.length, 1);
});

test("missing owner and established destination never start workflow", async () => {
  const fixture = dependencies();
  assert.equal((await handleDestinationRecommendationsPost(tripId, null, fixture.deps)).status, 404);
  assert.deepEqual(fixture.calls, []);
  const established = { ...fixture.deps, async loadJourney() {
    return { tripState: { ...state, destination: { state: "known" as const, value: "成都", source: "user" as const } } };
  } };
  assert.equal((await handleDestinationRecommendationsPost(tripId, "owner", established)).status, 409);
  assert.deepEqual(fixture.calls, []);
});

test("a province with no place chosen inside it is still open, so the cards are built", async () => {
  const fixture = dependencies();
  const response = await handleDestinationRecommendationsPost(tripId, "owner", { ...fixture.deps,
    async loadJourney() { fixture.calls.push("load"); return { tripState: { ...state,
      destination: { state: "approximate" as const, value: "四川省", source: "user" as const,
        areas: [{ province: "四川省", places: [] }] } } }; } });
  assert.equal(response.status, 200);
  assert.deepEqual(fixture.calls, ["load", "action", "history", "workflow", "message"]);
});

test("wrong owner and an unusable model answer do not persist a recommendation message", async () => {
  const missing = dependencies();
  assert.equal((await handleDestinationRecommendationsPost(tripId, "wrong", {
    ...missing.deps, async loadJourney() { throw new TripNotFoundError(tripId); },
  })).status, 404);
  assert.equal(missing.saved.length, 0);
  const failed = dependencies();
  const response = await handleDestinationRecommendationsPost(tripId, "owner", {
    ...failed.deps, async runWorkflow() { throw new InvalidDestinationRecommendationOutputError("invalid recommendations"); },
  });
  assert.equal(response.status, 502);
  assert.equal(failed.saved.length, 0);
  assert.equal(failed.action?.type, "request_destination_recommendations");
});

test("message persistence failure returns an error", async () => {
  const fixture = dependencies();
  assert.equal((await handleDestinationRecommendationsPost(tripId, "owner", {
    ...fixture.deps, async persistMessage() { throw new Error("database unavailable"); },
  })).status, 500);
});
