import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import {
  createDirectTripStatePatch,
  requestTripStateUpdate,
  TripStatePersistenceRequestError,
} from "./trip-state-persistence-model";

const state: TripState = {
  name: { state: "known", value: "冬季滑雪", source: "system" },
  origin: { state: "missing" },
  destination: {
    state: "ambiguous",
    value: "二世谷或者富良野",
    source: "user",
  },
  startDate: { state: "approximate", value: "今年冬天", source: "user" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

test("creates a user patch while preserving existing certainty", () => {
  assert.deepEqual(
    createDirectTripStatePatch(state, "startDate", "十月底左右"),
    {
      startDate: {
        state: "approximate",
        value: "十月底左右",
        source: "user",
      },
    },
  );
});

test("creates missing when a direct edit is cleared", () => {
  assert.deepEqual(createDirectTripStatePatch(state, "destination", "  "), {
    destination: { state: "missing" },
  });
});

test("persists against the real Trip ID and returns validated state", async () => {
  let requestedUrl = "";
  let requestedBody = "";
  const updatedState: TripState = {
    ...state,
    destination: { state: "known", value: "富良野", source: "user" },
  };

  const result = await requestTripStateUpdate(
    "trip_123",
    { destination: updatedState.destination },
    async (input, init) => {
      requestedUrl = input.toString();
      requestedBody = init?.body as string;
      return Response.json({ tripState: updatedState });
    },
  );

  assert.equal(requestedUrl, "/api/trips/trip_123/state");
  assert.deepEqual(JSON.parse(requestedBody), {
    patch: { destination: updatedState.destination },
  });
  assert.deepEqual(result, updatedState);
});

test("rejects a failed persistence response", async () => {
  await assert.rejects(
    requestTripStateUpdate(
      "trip_123",
      { origin: { state: "missing" } },
      async () => Response.json({ error: "failed" }, { status: 500 }),
    ),
    TripStatePersistenceRequestError,
  );
});
