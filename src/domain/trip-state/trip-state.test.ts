import assert from "node:assert/strict";
import test from "node:test";

import type { TripDraft } from "@/domain/trip-draft/trip-draft";
import { applyTripStatePatch, destinationText, initializeTripState, InvalidTripStateError,
  isDestinationOpenToRecommendations, validateTripState, validateTripStatePatch } from "./trip-state";

const draft: TripDraft = {
  name: { state: "missing" }, origin: { state: "known", value: "大连" },
  destinationEdit: { operation: "set", places: ["梅里雪山"], broadRegion: null },
  startDate: { state: "approximate", value: "十月底" }, endDate: { state: "missing" },
  duration: { state: "approximate", value: "大概一周" },
  transportPreference: { state: "known", value: "no_self_drive" },
};
const yunnan = { state: "known", source: "user", areas: [
  { province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["梅里雪山"] }] },
] } as const;

test("initialization preserves ordinary fields but awaits explicit destination selection", () => {
  const before = structuredClone(draft);
  const state = initializeTripState(draft);
  assert.deepEqual(draft, before);
  assert.deepEqual(state.destination, { state: "missing" });
  assert.deepEqual(state.origin, { state: "known", value: "大连", source: "user" });
  assert.deepEqual(state.startDate, { state: "approximate", value: "十月底", source: "user" });
});

test("a confirmed destination generates a name and user names remain authoritative", () => {
  const state = initializeTripState(draft);
  const selected = applyTripStatePatch(state, { destination: yunnan });
  assert.deepEqual(selected.name, { state: "known", value: "迪庆藏族自治州之旅", source: "system" });
  const renamed = applyTripStatePatch(selected, { name: { state: "known", value: "我的旅行", source: "user" } });
  const later = applyTripStatePatch(renamed, { destination: { state: "known", source: "user", areas: [
    { province: "广东省", places: [{ name: "潮州市", spots: [] }] },
  ] } });
  assert.deepEqual(later.name, renamed.name);
});

test("structured destination text derives from province, city and spot", () => {
  assert.equal(destinationText(yunnan), "云南省 迪庆藏族自治州（梅里雪山）");
  assert.equal(destinationText({ state: "missing" }), null);
  const roundTrip = JSON.parse(JSON.stringify(applyTripStatePatch(initializeTripState(draft),
    { destination: yunnan })));
  assert.deepEqual(validateTripState(roundTrip).destination, yunnan);
});

test("a plain external state PATCH cannot forge a destination", () => {
  assert.throws(() => validateTripStatePatch({ destination: yunnan }), InvalidTripStateError);
  assert.throws(() => validateTripStatePatch({}), InvalidTripStateError);
  assert.deepEqual(validateTripStatePatch({ duration: { state: "known", value: "五天", source: "user" } }),
    { duration: { state: "known", value: "五天", source: "user" } });
});

test("origin selection metadata remains validated independently", () => {
  const origin = { state: "known", value: "大连站", source: "user", selection: {
    provider: "amap", providerId: "tip-dalian", region: "辽宁省大连市",
    coordinates: { longitude: 121.63, latitude: 38.92, coordinateSystem: "GCJ-02" },
  } } as const;
  assert.deepEqual(validateTripStatePatch({ origin }).origin, origin);
  assert.throws(() => validateTripStatePatch({ origin: { ...origin, selection: {
    provider: "amap", coordinates: { longitude: 121, latitude: 100, coordinateSystem: "GCJ-02" },
  } } }), InvalidTripStateError);
});

test("recommendations remain open for empty provinces and close after a city or legacy preference", () => {
  assert.equal(isDestinationOpenToRecommendations({ state: "missing" }), true);
  assert.equal(isDestinationOpenToRecommendations({ state: "known", source: "user",
    areas: [{ province: "海南省", places: [] }] }), true);
  assert.equal(isDestinationOpenToRecommendations(yunnan), false);
  assert.equal(isDestinationOpenToRecommendations({ state: "known", source: "user", areas: [],
    legacyText: "旧目的地" }), false);
});

test("older free text is retained without assigning an unverified city", () => {
  const state = initializeTripState(draft);
  const old = validateTripState({ ...state, destination: { state:"known", source:"user", value:"梅里雪山", areas:[{province:"云南省",places:["梅里雪山"]}] } });
  assert.deepEqual(old.destination, { state: "known", source: "user", areas: [], legacyText: "梅里雪山" });
});
