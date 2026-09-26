import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_DESTINATION_IMAGE, destinationImageUrl, requestDestinationRecommendations, selectDestinationRecommendation, selectDestinationRecommendationAndApply } from "./destination-recommendation-model";
import { getWorkspaceTitle } from "./workspace-title";
import { journeyFieldLabel } from "./workspace-presentation";
import type { TripState } from "@/domain/trip-state/trip-state";

const message = {
  id: "message-1", tripId: "trip 1", role: "assistant", content: "先看看这三个方向。",
  createdAt: "2026-09-26T00:00:00.000Z",
  presentation: { type: "destination_recommendations", destinations: [
    { id: "a", name: "甲", region: null, reason: "方向一", imageUrl: null },
    { id: "b", name: "乙", region: "四川", reason: "方向二", imageUrl: null },
    { id: "c", name: "丙", region: null, reason: "方向三", imageUrl: null },
  ] },
};

test("button client posts without a synthetic user message and validates result", async () => {
  const received = await requestDestinationRecommendations("trip 1", async (input, init) => {
    assert.equal(input, "/api/trips/trip%201/destination-recommendations");
    assert.equal(init?.method, "POST");
    assert.equal(init?.body, undefined);
    return Response.json({ message });
  });
  assert.deepEqual(received, message);
});

test("client rejects failed and invalid recommendation responses", async () => {
  await assert.rejects(requestDestinationRecommendations("trip", async () =>
    Response.json({ error: "failed" }, { status: 502 })));
  await assert.rejects(requestDestinationRecommendations("trip", async () =>
    Response.json({ message: { ...message, presentation: { ...message.presentation, destinations: message.presentation.destinations.slice(0, 2) } } })));
});

test("selection PATCH sends only a known user destination and returns authoritative state", async () => {
  const state = {
    name: { state: "missing" }, origin: { state: "missing" },
    destination: { state: "known", value: "香格里拉", source: "user" },
    startDate: { state: "missing" }, endDate: { state: "missing" },
    duration: { state: "missing" }, transportPreference: { state: "missing" },
  };
  const received = await selectDestinationRecommendation("trip 1", "香格里拉", async (input, init) => {
    assert.equal(input, "/api/trips/trip%201/state");
    assert.equal(init?.method, "PATCH");
    assert.deepEqual(JSON.parse(String(init?.body)), { patch: { destination: state.destination } });
    return Response.json({ tripState: state });
  });
  assert.deepEqual(received, state);
  assert.equal("selection" in received.destination, false);
});

test("failed selection PATCH rejects without returning optimistic state", async () => {
  const original: TripState = {
    name: { state: "known", value: "云南大理之旅", source: "system" },
    origin: { state: "missing" },
    destination: { state: "known", value: "云南大理", source: "user" },
    startDate: { state: "missing" }, endDate: { state: "missing" },
    duration: { state: "missing" }, transportPreference: { state: "missing" },
  };
  let displayed = original;
  await assert.rejects(selectDestinationRecommendationAndApply("trip", "香格里拉", () => {
    displayed = { ...original, name: { state: "known", value: "香格里拉之旅", source: "system" } };
  }, async () => Response.json({ error: "failed" }, { status: 500 })));
  assert.strictEqual(displayed, original);
  assert.equal(getWorkspaceTitle(displayed), "云南大理之旅");
  await assert.rejects(selectDestinationRecommendation("trip", "香格里拉", async () =>
    Response.json({ error: "failed" }, { status: 500 })));
});

test("successful selection applies the server name to Workspace title and Journey overview state", async () => {
  const persisted: TripState = {
    name: { state: "known", value: "泉州之旅", source: "system" },
    origin: { state: "missing" },
    destination: { state: "known", value: "泉州", source: "user" },
    startDate: { state: "missing" }, endDate: { state: "missing" },
    duration: { state: "missing" }, transportPreference: { state: "missing" },
  };
  const appliedStates: TripState[] = [];
  await selectDestinationRecommendationAndApply("trip", "泉州", (state) => { appliedStates.push(state); },
    async () => Response.json({ tripState: persisted }));
  assert.equal(appliedStates.length, 1);
  const displayed = appliedStates[0];
  assert.deepEqual(displayed, persisted);
  assert.equal(getWorkspaceTitle(displayed), "泉州之旅");
  assert.equal(journeyFieldLabel(displayed.name, "旅程名称待定"), "泉州之旅");
});

test("unavailable or broken provider image uses the same local destination image", () => {
  assert.equal(destinationImageUrl(null, false), DEFAULT_DESTINATION_IMAGE);
  assert.equal(destinationImageUrl("https://example.com/photo.jpg", true), DEFAULT_DESTINATION_IMAGE);
  assert.equal(destinationImageUrl("https://example.com/photo.jpg", false), "https://example.com/photo.jpg");
});
