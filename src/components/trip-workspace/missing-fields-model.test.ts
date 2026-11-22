import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import { missingTripFields } from "./missing-fields-model";

const empty: TripState = {
  name: { state: "known", value: "上海苏州之旅", source: "system" },
  origin: { state: "known", value: "大连", source: "user" },
  destination: { state: "known", source: "user", areas: [{ province: "上海市", places: [{ name: "上海市", spots: [] }] }] },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

test("the buttons under a reply ask only for what TripState still lacks", () => {
  assert.deepEqual(missingTripFields(empty), ["dates", "transport"]);
  // A length alone, or a vague start, still leaves the dates to fill in.
  assert.deepEqual(missingTripFields({ ...empty, duration: { state: "known", value: "3天", source: "user" } }), ["dates", "transport"]);
  assert.deepEqual(missingTripFields({ ...empty, startDate: { state: "approximate", value: "月底", source: "user" },
    duration: { state: "known", value: "3天", source: "user" } }), ["dates", "transport"]);
  const dated: TripState = { ...empty, startDate: { state: "known", value: "2026-11-24", source: "user" },
    duration: { state: "known", value: "3天", source: "user" } };
  assert.deepEqual(missingTripFields(dated), ["transport"]);
  assert.deepEqual(missingTripFields({ ...dated, transportPreference: { state: "known", value: "public_transport", source: "user" } }), []);
});
