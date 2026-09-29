import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { canSelectDestinationRecommendation, canUseDestinationGuidance, chosenDestinationPlaces, groupRecommendationsByProvince, requestDestinationRecommendations, requestDestinationRecommendationsIfMissing, selectDestinationRecommendation } from "./destination-recommendation-model";
import { DestinationSelectionFollowUpError } from "./workspace-conversation-model";
import { getWorkspaceTitle } from "./workspace-title";
import { journeyFieldLabel } from "./workspace-presentation";
import type { TripState } from "@/domain/trip-state/trip-state";

const message = {
  id: "message-1", tripId: "trip 1", role: "assistant", content: "先看看这三个方向。",
  createdAt: "2026-09-26T00:00:00.000Z",
  presentation: { type: "destination_recommendations", destinations: [
    { id: "a", name: "丽江市", province: "云南省", reason: "古城和雪山都在一天路程里" },
    { id: "b", name: "迪庆藏族自治州", province: "云南省", reason: "适合看高原草甸" },
    { id: "c", name: "甘孜藏族自治州", province: "四川省", reason: "川西环线的主要一段" },
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

test("a region the user named still gets recommendations, because 「去哪」 is still open", () => {
  const area: TripState = { ...missingDestination, destination: { state: "approximate", value: "海南省",
    source: "user", areas: [{ province: "海南省", places: [] }] } };
  assert.equal(canUseDestinationGuidance(area), true);
  assert.equal(canSelectDestinationRecommendation(area), true);
  const chosen: TripState = { ...missingDestination, destination: { state: "known", value: "海南省 三亚市",
    source: "user", areas: [{ province: "海南省", places: ["三亚市"] }] } };
  assert.equal(canUseDestinationGuidance(chosen), false);
  assert.deepEqual(chosenDestinationPlaces(chosen), ["三亚市"]);
  assert.deepEqual(chosenDestinationPlaces(area), []);
});

test("the offered places keep their provinces and their order when they are grouped", () => {
  assert.deepEqual(groupRecommendationsByProvince(message.presentation.destinations), [
    { province: "云南省", destinations: message.presentation.destinations.slice(0, 2) },
    { province: "四川省", destinations: message.presentation.destinations.slice(2) },
  ]);
  assert.deepEqual(groupRecommendationsByProvince([]), []);
});

test("a selected destination disables historical guidance and all recommendation actions", async () => {
  const selected = { ...missingDestination,
    destination: { state: "known", value: "迪庆藏族自治州", source: "user" } as const };
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

test("the picker groups the places under their provinces and offers one commit", async () => {
  const { DestinationRecommendationPicker } = await import("./destination-recommendation-picker");
  const markup = renderToStaticMarkup(createElement(DestinationRecommendationPicker, {
    chosen: [], destinations: message.presentation.destinations, disabled: false,
    error: false, onCommit: () => {}, pending: false,
  }));
  assert.deepEqual(markup.match(/<h3>[^<]+<\/h3>/gu), ["<h3>云南省</h3>", "<h3>四川省</h3>"]);
  assert.equal(markup.match(/type="checkbox"/gu)?.length, 3);
  assert.match(markup, /就去这些/u);
  // Nothing is picked yet, so there is nothing to commit.
  assert.equal(markup.match(/<button[^>]*disabled=""/gu)?.length, 1);
});

test("places already settled come back ticked, and the list stops taking changes", async () => {
  const { DestinationRecommendationPicker } = await import("./destination-recommendation-picker");
  const markup = renderToStaticMarkup(createElement(DestinationRecommendationPicker, {
    chosen: ["丽江市", "甘孜藏族自治州"], destinations: message.presentation.destinations,
    disabled: true, error: false, onCommit: () => {}, pending: false,
  }));
  assert.equal(markup.match(/checked=""/gu)?.length, 2);
  assert.equal(markup.match(/<input[^>]*disabled=""/gu)?.length, 3);
  assert.match(markup, /已选 2 个/u);
  assert.match(markup, /已选好/u);
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
    Response.json({ message: { ...message, presentation: { ...message.presentation, destinations: [] } } })));
  const oneCard = await requestDestinationRecommendations("trip", async () =>
    Response.json({ message: { ...message, presentation: { ...message.presentation,
      destinations: message.presentation.destinations.slice(0, 1) } } }));
  assert.equal(oneCard.presentation?.type === "destination_recommendations" &&
    oneCard.presentation.destinations.length, 1);
  const noCards = await requestDestinationRecommendations("trip", async () =>
    Response.json({ message: { ...message, presentation: undefined } }));
  assert.equal(noCards.presentation, undefined);
});

const selectedState: TripState = {
  name: { state: "missing" }, origin: { state: "missing" },
  destination: { state: "known", value: "香格里拉", source: "user" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};

const followUp = {
  id: "00000000-0000-4000-8000-0000000000f1", tripId: "trip 1", role: "assistant",
  content: "好，目的地定为香格里拉了。", createdAt: "2026-09-28T09:00:00.000Z",
};

test("selection names the card it was offered on and returns the state with Meri's reply", async () => {
  const received = await selectDestinationRecommendation("trip 1", "assistant-cards", ["candidate-2", "candidate-4"],
    async (input, init) => {
      assert.equal(input, "/api/trips/trip%201/destination-recommendation-selection");
      assert.equal(init?.method, "POST");
      // No name leaves the client: the server reads them from the stored list.
      assert.deepEqual(JSON.parse(String(init?.body)),
        { messageId: "assistant-cards", destinationIds: ["candidate-2", "candidate-4"] });
      return Response.json({ tripState: selectedState, assistantMessage: followUp });
    });
  assert.deepEqual(received.tripState, selectedState);
  assert.equal(received.assistantMessage.content, "好，目的地定为香格里拉了。");
});

test("a saved destination whose follow-up failed still reaches the Workspace", async () => {
  await assert.rejects(
    () => selectDestinationRecommendation("trip 1", "assistant-cards", ["candidate-2"],
      async () => Response.json({ error: "failed", code: "follow_up_unavailable", tripState: selectedState },
        { status: 500 })),
    (error: unknown) => error instanceof DestinationSelectionFollowUpError &&
      error.tripState.destination.state === "known");
});

test("a reply for another Journey is refused rather than shown", async () => {
  await assert.rejects(() => selectDestinationRecommendation("trip 1", "assistant-cards", ["candidate-2"],
    async () => Response.json({ tripState: selectedState,
      assistantMessage: { ...followUp, tripId: "other-trip" } })));
});

test("a failed selection leaves the Workspace showing what it had", async () => {
  const original: TripState = {
    name: { state: "known", value: "云南大理之旅", source: "system" },
    origin: { state: "missing" },
    destination: { state: "known", value: "云南大理", source: "user" },
    startDate: { state: "missing" }, endDate: { state: "missing" },
    duration: { state: "missing" }, transportPreference: { state: "missing" },
  };
  await assert.rejects(() => selectDestinationRecommendation("trip", "assistant-cards", ["candidate-2"],
    async () => Response.json({ error: "failed" }, { status: 500 })));
  assert.equal(getWorkspaceTitle(original), "云南大理之旅");
});

test("successful selection applies the server name to Workspace title and Journey overview state", async () => {
  const persisted: TripState = {
    name: { state: "known", value: "泉州之旅", source: "system" },
    origin: { state: "missing" },
    destination: { state: "known", value: "泉州", source: "user" },
    startDate: { state: "missing" }, endDate: { state: "missing" },
    duration: { state: "missing" }, transportPreference: { state: "missing" },
  };
  const { tripState: displayed } = await selectDestinationRecommendation("trip", "assistant-cards", ["candidate-1"],
    async () => Response.json({ tripState: persisted,
      assistantMessage: { ...followUp, tripId: "trip", content: "好，目的地定为泉州了。" } }));
  assert.deepEqual(displayed, persisted);
  assert.equal(getWorkspaceTitle(displayed), "泉州之旅");
  assert.equal(journeyFieldLabel(displayed.name, "旅程名称待定"), "泉州之旅");
});
