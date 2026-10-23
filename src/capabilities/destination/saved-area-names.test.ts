import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import { savedAreaNames } from "./saved-area-names";

const base: TripState = {
  name: { state: "missing" },
  origin: { state: "missing" },
  destination: { state: "missing" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

test("a trip with no destination has no areas to narrow by", () => {
  assert.deepEqual(savedAreaNames(base), []);
  assert.deepEqual(savedAreaNames({ ...base, destination: {
    state: "known", source: "user", areas: [], legacyText: "云南徒步" } }), []);
});

test("the provinces and 市 a trip already holds, without spots and without repeats", () => {
  assert.deepEqual(savedAreaNames({ ...base, destination: { state: "known", source: "user", areas: [
    { province: "云南省", places: [{ name: "大理白族自治州", spots: ["苍山", "洱海"] }] },
    { province: "云南省", places: [{ name: "丽江市", spots: [] }] },
    { province: "四川省", places: [] },
  ] } }), ["云南省", "大理白族自治州", "丽江市", "四川省"]);
});
