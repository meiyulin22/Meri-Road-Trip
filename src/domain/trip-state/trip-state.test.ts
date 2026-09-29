import assert from "node:assert/strict";
import test from "node:test";

import type { TripDraft } from "@/domain/trip-draft/trip-draft";

import {
  applyTripStatePatch,
  initializeTripState,
  InvalidTripStateError,
  isDestinationOpenToRecommendations,
  validateTripState,
  validateTripStatePatch,
  type TripStatePatch,
} from "./trip-state";

const draft: TripDraft = {
  name: { state: "known", value: "冬季滑雪之旅" },
  origin: { state: "known", value: "大连" },
  destination: { state: "ambiguous", value: "二世谷或者富良野" },
  startDate: { state: "approximate", value: "十月底" },
  endDate: { state: "missing" },
  duration: { state: "approximate", value: "大概一周" },
  transportPreference: { state: "known", value: "no_self_drive" },
};

test("initializes TripState without mutating TripDraft", () => {
  const originalDraft = structuredClone(draft);
  const state = initializeTripState(draft);

  assert.deepEqual(draft, originalDraft);
  assert.deepEqual(state.startDate, {
    state: "approximate",
    value: "十月底",
    source: "user",
  });
  assert.deepEqual(state.destination, {
    state: "ambiguous",
    value: "二世谷或者富良野",
    source: "user",
  });
  assert.deepEqual(state.endDate, { state: "missing" });
  assert.equal("source" in state.endDate, false);
});

test("uses the narrow system default for a TripDraft name with unknown provenance", () => {
  const state = initializeTripState(draft);

  assert.deepEqual(state.name, {
    state: "known",
    value: "冬季滑雪之旅",
    source: "system",
  });
});

test("initializes a default name from a known destination", () => {
  const state = initializeTripState({
    ...draft,
    name: { state: "missing" },
    destination: { state: "known", value: "东京" },
  });

  assert.deepEqual(state.name, {
    state: "known",
    value: "东京之旅",
    source: "system",
  });
});

test("keeps the name missing when the initial destination is not known", () => {
  for (const destination of [
    { state: "missing" },
    { state: "approximate", value: "日本附近" },
    { state: "ambiguous", value: "东京或大阪" },
  ] as const) {
    const state = initializeTripState({
      ...draft,
      name: { state: "missing" },
      destination,
    });
    assert.deepEqual(state.name, { state: "missing" });
  }
});

test("generates a default name when a later destination becomes known", () => {
  const state = initializeTripState({
    ...draft,
    name: { state: "missing" },
    destination: { state: "missing" },
  });
  const nextState = applyTripStatePatch(state, {
    destination: { state: "known", value: "东京", source: "user" },
  });

  assert.deepEqual(nextState.name, {
    state: "known",
    value: "东京之旅",
    source: "system",
  });
  assert.deepEqual(state.name, { state: "missing" });
});

test("a changed destination renames a system-named Journey and retains system source", () => {
  const state = initializeTripState({
    ...draft,
    name: { state: "missing" },
    destination: { state: "known", value: "云南大理" },
  });
  const nextState = applyTripStatePatch(state, {
    destination: { state: "known", value: "泉州", source: "user" },
  });

  assert.deepEqual(nextState.name, { state: "known", value: "泉州之旅", source: "system" });
  assert.deepEqual(state.name, { state: "known", value: "云南大理之旅", source: "system" });
});

test("a changed destination preserves a user-named Journey", () => {
  const state = initializeTripState({
    ...draft,
    name: { state: "missing" },
    destination: { state: "known", value: "云南大理" },
  });
  const userNamed = applyTripStatePatch(state, {
    name: { state: "known", value: "我的毕业旅行", source: "user" },
  });

  assert.deepEqual(applyTripStatePatch(userNamed, {
    destination: { state: "known", value: "泉州", source: "user" },
  }).name, { state: "known", value: "我的毕业旅行", source: "user" });
});

test("does not generate from approximate or ambiguous destination patches", () => {
  const state = initializeTripState({
    ...draft,
    name: { state: "missing" },
    destination: { state: "missing" },
  });

  for (const destination of [
    { state: "approximate", value: "日本附近", source: "user" },
    { state: "ambiguous", value: "东京或大阪", source: "user" },
    { state: "missing" },
  ] as const) {
    assert.deepEqual(
      applyTripStatePatch(state, { destination }).name,
      { state: "missing" },
    );
  }
});

test("an explicit name patch wins over default generation", () => {
  const state = initializeTripState({
    ...draft,
    name: { state: "missing" },
    destination: { state: "missing" },
  });
  const destination = { state: "known", value: "东京", source: "user" } as const;

  assert.deepEqual(
    applyTripStatePatch(state, {
      name: { state: "known", value: "我的秋季旅行", source: "user" },
      destination,
    }).name,
    { state: "known", value: "我的秋季旅行", source: "user" },
  );
  assert.deepEqual(
    applyTripStatePatch(state, { name: { state: "missing" }, destination }).name,
    { state: "missing" },
  );
});

test("preserves a user name when destination changes", () => {
  const name = { state: "known", value: "我的旅行", source: "user" } as const;
  const state = initializeTripState({
    ...draft,
    name: { state: "missing" },
    destination: { state: "missing" },
  });
  const nextState = applyTripStatePatch({ ...state, name }, {
    destination: { state: "known", value: "东京", source: "user" },
  });
  assert.strictEqual(nextState.name, name);
});

test("applies a patch without changing or reconstructing unrelated fields", () => {
  const state = initializeTripState(draft);
  const patch: TripStatePatch = {
    startDate: {
      state: "approximate",
      value: "十月底左右",
      source: "user",
    },
  };
  const nextState = applyTripStatePatch(state, patch);

  assert.deepEqual(nextState.startDate, {
    state: "approximate",
    value: "十月底左右",
    source: "user",
  });
  assert.strictEqual(nextState.destination, state.destination);
  assert.strictEqual(nextState.duration, state.duration);
  assert.notEqual(state.startDate.state, "missing");
  if (state.startDate.state !== "missing") {
    assert.equal(state.startDate.value, "十月底");
  }
});

test("validates a focused external TripStatePatch", () => {
  assert.deepEqual(
    validateTripStatePatch({
      destination: {
        state: "ambiguous",
        value: "二世谷或者富良野",
        source: "user",
      },
    }),
    {
      destination: {
        state: "ambiguous",
        value: "二世谷或者富良野",
        source: "user",
      },
    },
  );
});

test("rejects empty and unknown TripStatePatch fields", () => {
  assert.throws(() => validateTripStatePatch({}), InvalidTripStateError);
  assert.throws(
    () => validateTripStatePatch({ weather: { state: "missing" } }),
    InvalidTripStateError,
  );
});

test("validates old TripState JSON and a known selected destination without changing its display value", () => {
  const oldState = initializeTripState({ ...draft, destination: { state: "known", value: "香格里拉" } });
  assert.deepEqual(validateTripState(JSON.parse(JSON.stringify(oldState))), oldState);

  const destination = {
    state: "known",
    value: "香格里拉",
    source: "user",
    selection: {
      provider: "amap",
      providerId: "tip-1",
      region: "云南省迪庆藏族自治州德钦县",
      address: "环湖公路18号",
      coordinates: { longitude: 99.1, latitude: 28.2, coordinateSystem: "GCJ-02" },
    },
  } as const;
  assert.deepEqual(validateTripStatePatch({ destination }).destination, destination);
  const selectedState = applyTripStatePatch(oldState, { destination });
  assert.deepEqual(validateTripState(JSON.parse(JSON.stringify(selectedState))), selectedState);
  assert.equal(selectedState.destination.state === "known" && selectedState.destination.value, "香格里拉");
});

test("selected destination accepts absent optional provider ID and coordinates", () => {
  const destination = {
    state: "known",
    value: "香格里拉",
    source: "user",
    selection: { provider: "amap", region: "四川省凉山彝族自治州" },
  } as const;
  assert.deepEqual(validateTripStatePatch({ destination }).destination, destination);
});

test("old origin and selected known user origin both validate through TripState JSON", () => {
  const oldState = initializeTripState(draft);
  assert.deepEqual(validateTripState(JSON.parse(JSON.stringify(oldState))), oldState);

  const origin = {
    state: "known", value: "大连站", source: "user",
    selection: {
      provider: "amap", providerId: "tip-dalian", region: "辽宁省大连市",
      coordinates: { longitude: 121.63, latitude: 38.92, coordinateSystem: "GCJ-02" },
    },
  } as const;
  assert.deepEqual(validateTripStatePatch({ origin }).origin, origin);
  const selectedState = applyTripStatePatch(oldState, { origin });
  assert.deepEqual(validateTripState(JSON.parse(JSON.stringify(selectedState))), selectedState);
  assert.equal(selectedState.origin.state === "known" && selectedState.origin.value, "大连站");
});

test("origin selection rejects malformed metadata and approximate or ambiguous states", () => {
  const selected = {
    state: "known", value: "大连", source: "user",
    selection: { provider: "amap", region: "辽宁省" },
  };
  for (const origin of [
    { ...selected, state: "approximate" },
    { ...selected, state: "ambiguous" },
    { ...selected, source: "system" },
    { ...selected, selection: { provider: "unknown" } },
    { ...selected, selection: { provider: "amap", adcode: "210200" } },
    { ...selected, selection: { provider: "amap", coordinates: { longitude: 121, latitude: 100, coordinateSystem: "GCJ-02" } } },
  ]) {
    assert.throws(() => validateTripStatePatch({ origin }), InvalidTripStateError);
  }
});

test("destination selection rejects invalid shapes and non-known states", () => {
  const selected = {
    state: "known",
    value: "香格里拉",
    source: "user",
    selection: { provider: "amap", region: "云南省" },
  };
  for (const destination of [
    { ...selected, state: "approximate" },
    { ...selected, state: "ambiguous" },
    { ...selected, source: "system" },
    { ...selected, selection: { provider: "amap", adcode: "123" } },
    { ...selected, selection: { provider: "unknown" } },
    { ...selected, selection: { provider: "amap", providerId: "" } },
    { ...selected, selection: { provider: "amap", coordinates: { longitude: 200, latitude: 28, coordinateSystem: "GCJ-02" } } },
    { ...selected, selection: { provider: "amap", coordinates: { longitude: 99, latitude: 28, coordinateSystem: "WGS84" } } },
  ]) {
    assert.throws(() => validateTripStatePatch({ destination }), InvalidTripStateError);
  }
});

test("a conversational destination replacement removes stale selection", () => {
  const state = initializeTripState({ ...draft, destination: { state: "known", value: "香格里拉" } });
  const selected = applyTripStatePatch(state, {
    destination: { state: "known", value: "香格里拉", source: "user", selection: { provider: "amap", region: "云南省" } },
  });
  const replaced = applyTripStatePatch(selected, {
    destination: { state: "known", value: "富良野", source: "user" },
  });
  assert.deepEqual(replaced.destination, { state: "known", value: "富良野", source: "user" });
});

test("a destination carries the provinces and places it covers, and they survive storage", () => {
  const destination = {
    state: "approximate", value: "四川省 稻城亚丁 · 云南省 梅里雪山", source: "user",
    areas: [
      { province: "四川省", places: ["稻城亚丁"] },
      { province: "云南省", places: ["梅里雪山"] },
    ],
  } as const;
  assert.deepEqual(validateTripStatePatch({ destination }).destination, destination);

  const state = applyTripStatePatch(initializeTripState(draft), { destination });
  assert.deepEqual(validateTripState(JSON.parse(JSON.stringify(state))), state);
  assert.deepEqual(validateTripStatePatch({
    destination: { state: "known", value: "海南省", source: "user",
      selection: { provider: "amap", region: "海南省" }, areas: [{ province: "海南省", places: [] }] },
  }).destination?.state, "known");
});

test("a Journey without areas keeps validating, because most of them have none", () => {
  const state = initializeTripState({ ...draft, destination: { state: "known", value: "香格里拉" } });
  assert.deepEqual(validateTripState(JSON.parse(JSON.stringify(state))), state);
  assert.equal(Object.hasOwn(validateTripStatePatch({
    destination: { state: "known", value: "香格里拉", source: "user" },
  }).destination ?? {}, "areas"), false);
});

test("a malformed area is a corrupt destination, and an origin can never carry one", () => {
  for (const destination of [
    { state: "approximate", value: "四川省", source: "user", areas: [] },
    { state: "approximate", value: "四川省", source: "user", areas: "四川省" },
    { state: "approximate", value: "四川省", source: "user", areas: [{ province: "", places: [] }] },
    { state: "missing", areas: [{ province: "四川省", places: [] }] },
  ]) {
    assert.throws(() => validateTripStatePatch({ destination }), InvalidTripStateError);
  }
  assert.throws(() => validateTripStatePatch({
    origin: { state: "approximate", value: "四川省", source: "user", areas: [{ province: "四川省", places: [] }] },
  }), InvalidTripStateError);
});

test("the Journey is named after the destination's own structure, not its whole text", () => {
  const areas = [
    { province: "四川省", places: ["稻城亚丁", "四姑娘山"] },
    { province: "云南省", places: ["梅里雪山"] },
  ];
  const unnamed: TripStatePatch = { destination: { state: "known", value: "川滇线", source: "user", areas } };
  const state = applyTripStatePatch(
    initializeTripState({ ...draft, name: { state: "missing" }, destination: { state: "missing" } }), unnamed);
  assert.deepEqual(state.name, { state: "known", value: "四川省、云南省之旅", source: "system" });

  const single = applyTripStatePatch(state, {
    destination: { state: "known", value: "云南省 梅里雪山", source: "user",
      areas: [{ province: "云南省", places: ["梅里雪山"] }] },
  });
  assert.deepEqual(single.name, { state: "known", value: "梅里雪山之旅", source: "system" });
});

test("「去哪」 stays open until a place is chosen, and closes once one is", () => {
  assert.equal(isDestinationOpenToRecommendations({ state: "missing" }), true);
  assert.equal(isDestinationOpenToRecommendations({ state: "approximate", value: "海南省",
    source: "user", areas: [{ province: "海南省", places: [] }] }), true);
  assert.equal(isDestinationOpenToRecommendations({ state: "ambiguous", value: "海南或者广西",
    source: "user" }), true);
  assert.equal(isDestinationOpenToRecommendations({ state: "known", value: "海南省 三亚市",
    source: "user", areas: [{ province: "海南省", places: ["三亚市"] }] }), false);
  // A place in one of two provinces still answers the question that was asked.
  assert.equal(isDestinationOpenToRecommendations({ state: "approximate", value: "海南省 · 广西壮族自治区 北海市",
    source: "user", areas: [{ province: "海南省", places: [] },
      { province: "广西壮族自治区", places: ["北海市"] }] }), false);
  // Destinations saved before places were grouped carry no areas; a named one is an answer.
  assert.equal(isDestinationOpenToRecommendations({ state: "known", value: "三亚", source: "user" }), false);
  assert.equal(isDestinationOpenToRecommendations({ state: "approximate", value: "海南", source: "user" }), true);
});
