import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { canSelectDestinationRecommendation, canUseDestinationGuidance, DEFAULT_DESTINATION_IMAGE, destinationImageUrl, requestDestinationRecommendations, requestDestinationRecommendationsIfMissing, selectDestinationRecommendation, selectDestinationRecommendationAndApply } from "./destination-recommendation-model";
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

const missingDestination: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};

const nodeRequire = createRequire(import.meta.url);
nodeRequire.extensions[".css"] = (module) => {
  module.exports = { default: new Proxy({}, { get: (_target, key) => String(key) }) };
};

test("guidance and recommendation selection are available while destination is missing", () => {
  assert.equal(canUseDestinationGuidance(missingDestination), true);
  assert.equal(canSelectDestinationRecommendation(missingDestination), true);
});

test("a selected destination disables historical guidance and all recommendation actions", async () => {
  const selected = { ...missingDestination,
    destination: { state: "known", value: "乙", source: "user" } as const };
  assert.equal(canUseDestinationGuidance(selected), false);
  assert.equal(canSelectDestinationRecommendation(selected), false);
  assert.equal(selected.destination.value === message.presentation.destinations[1].name, true);
  let calls = 0;
  const result = await requestDestinationRecommendationsIfMissing("trip-1", selected, async () => {
    calls += 1;
    return Response.json({ message });
  });
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("selected recommendation stays marked while every card button is disabled", async () => {
  const { DestinationRecommendationCard } = await import("./destination-recommendation-card");
  const markup = message.presentation.destinations.map((destination) =>
    renderToStaticMarkup(createElement(DestinationRecommendationCard, {
      destination, onSelect: () => {}, pending: false, error: false,
      selected: destination.name === "乙", disabled: true,
    })));
  assert.equal(markup.length, 3);
  assert.ok(markup.every((card) => /<button[^>]*disabled=""/.test(card)));
  assert.match(markup[1], /data-selected="true"/);
  assert.match(markup[1], /已选择/);
  assert.match(markup[0], /data-selected="false"/);
});

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
