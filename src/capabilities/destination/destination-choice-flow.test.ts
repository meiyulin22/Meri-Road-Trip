import assert from "node:assert/strict";
import test from "node:test";

import { applyDestinationEdit } from "./apply-destination-edit";
import { verifyDestinationChoice } from "./verified-destination-choice";
import { namesSamePlace, picksFromSearch, resolveDestinationPlace } from "./resolve-destination-place";
import { resolveDestinationCandidates } from "@/domain/location/destination-resolution-policy";
import { destinationPreferenceId } from "@/domain/trip-message/destination-choice-identity";

const meriCandidate = { providerId: "amap-meri", name: "梅里雪山", province: "云南省",
  city: "迪庆藏族自治州", district: "德钦县", region: "云南省迪庆藏族自治州德钦县",
  address: "德钦县", longitude: 98.67, latitude: 28.43, coordinateSystem: "GCJ-02" as const };

test("foreign or missing province metadata cannot enter manual search or resolved destination picks", async () => {
  for (const province of ["北海道", "安大略省", null]) {
    const candidate = { ...meriCandidate, province };
    assert.deepEqual(picksFromSearch([candidate]), []);
    assert.deepEqual(await resolveDestinationPlace(candidate.name, async () => ({ status: "resolved", candidate })),
      { status: "unresolved" });
  }
  assert.deepEqual(picksFromSearch([{ ...meriCandidate, name: "安大略省", province: "安大略省", city: null }]), []);
  assert.deepEqual(await resolveDestinationPlace("安大略省", async () => ({ status: "area", province: "安大略省" })),
    { status: "unresolved" });
  assert.equal((await resolveDestinationPlace("云南", async () => ({ status: "area", province: "云南省" }))).status, "resolved");
});

test("historical foreign offers cannot bypass coverage through the province shortcut", async () => {
  for (const choice of [
    { id: "province:安大略省", name: "安大略省", province: "安大略省" },
    { id: "foreign-city", name: "札幌市", province: "北海道" },
  ]) {
    assert.deepEqual(await verifyDestinationChoice(choice, {
      search: async () => { throw new Error("out-of-scope offers must be rejected before lookup"); },
    }), { status: "unresolved" });
  }
});

test("a foreign city mislabeled as Chinese is still rejected when provider geography disagrees", async () => {
  assert.deepEqual(await verifyDestinationChoice({ id: "foreign", name: "札幌市", province: "云南省" }, {
    search: async () => ({ status: "success", candidates: [{ ...meriCandidate,
      providerId: "foreign", name: "札幌市", province: "北海道", city: "札幌市" }] }),
  }), { status: "unresolved" });
});

test("a spot the provider had to interpret becomes an offer and does not mutate destination until selection", async () => {
  const current = { state: "missing" } as const;
  const result = await applyDestinationEdit(current, { operation: "set", places: ["梅里"], broadRegion: null },
    async () => ({ status: "resolved", pick: { id: "amap-meri", province: "云南省",
      place: "迪庆藏族自治州", spot: "梅里雪山" }, exact: false }), "我想去梅里");
  assert.equal(result.destination, current);
  assert.equal(result.changed, false);
  assert.equal(result.choices?.presentation.choices[0].name, "迪庆藏族自治州");
  assert.equal(result.choices?.presentation.choices[0].spot, "梅里雪山");
  assert.equal(result.choices?.presentation.choices[0].city, "迪庆藏族自治州");
  assert.equal(result.choices?.presentation.mode, "add");
});

test("selection rechecks provider identity and preserves the named spot", async () => {
  const verified = await verifyDestinationChoice({ id: "amap-meri", name: "梅里雪山", province: "云南省",
    city: "迪庆藏族自治州", spot: "梅里雪山" }, {
    search: async () => ({ status: "success", candidates: [meriCandidate] }),
  });
  assert.deepEqual(verified, { status: "verified",
    pick: { province: "云南省", place: "迪庆藏族自治州", spot: "梅里雪山" } });
  const stale = await verifyDestinationChoice({ id: "other", name: "梅里雪山", province: "四川省",
    city: "迪庆藏族自治州", spot: "梅里雪山" }, {
    search: async () => ({ status: "success", candidates: [meriCandidate] }),
  });
  assert.equal(stale.status, "unresolved");
});

test("three POIs for one named spot in one city are one wish, added directly, and reverify independently of POI order", async () => {
  const candidates = [
    { ...meriCandidate, providerId: "park", name: "梅里雪山国家公园景区", address: "东北七公里处" },
    { ...meriCandidate, providerId: "mountain-a" },
    { ...meriCandidate, providerId: "mountain-b", longitude: 98.68 },
  ];
  const result = await applyDestinationEdit({ state: "missing" },
    { operation: "set", places: ["梅里雪山"], broadRegion: null },
    (expression) => resolveDestinationPlace(expression, async (query) => resolveDestinationCandidates(query, candidates)),
    "我想去梅里雪山");
  assert.equal(result.choices, null);
  assert.deepEqual(result.added, [{ province: "云南省", place: "迪庆藏族自治州", spot: "梅里雪山" }]);
  assert.deepEqual(result.destination, { state: "known", source: "user", areas: [
    { province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["梅里雪山"] }] }] });
  const choice = { id: destinationPreferenceId("云南省", "迪庆藏族自治州", "梅里雪山"), name: "迪庆藏族自治州", province: "云南省", city: "迪庆藏族自治州", spot: "梅里雪山" };
  // IDs and exact coordinates are not the travel decision being confirmed.
  const verified = await verifyDestinationChoice(choice, {
    search: async () => ({ status: "success", candidates: [{ ...candidates[2], providerId: "new-map-record" }] }),
  });
  assert.deepEqual(verified, { status: "verified", pick: {
    province: "云南省", place: "迪庆藏族自治州", spot: "梅里雪山" } });
  assert.equal((await verifyDestinationChoice(choice, {
    search: async () => ({ status: "success", candidates: candidates.map((candidate) => ({ ...candidate, city: "丽江市" })) }),
  })).status, "unresolved");
});

test("three Dalian city records are one exact city, added without a card, and legacy recommendations still verify", async () => {
  const candidates = ["city-a", "city-b", "city-c"].map((providerId) => ({ ...meriCandidate,
    providerId, name: "大连市", province: "辽宁省", city: "大连市", district: null }));
  const result = await applyDestinationEdit({ state: "missing" },
    { operation: "add", places: ["大连市"], broadRegion: null },
    (expression) => resolveDestinationPlace(expression, async (query) => resolveDestinationCandidates(query, candidates)),
    "还想去大连市");
  assert.equal(result.choices, null);
  assert.deepEqual(result.added, [{ province: "辽宁省", place: "大连市", spot: null }]);
  for (const choice of [{ id: destinationPreferenceId("辽宁省", "大连市", null), name: "大连市", province: "辽宁省", city: "大连市" },
    { id: "legacy-random", name: "大连市", province: "辽宁省" }]) {
    assert.deepEqual(await verifyDestinationChoice(choice, {
      search: async () => ({ status: "success", candidates }),
    }), { status: "verified", pick: { province: "辽宁省", place: "大连市", spot: null } });
  }
});

test("same-name spots in different cities stay separate, and different preferences within one city stay separate", async () => {
  const result = await applyDestinationEdit({ state: "missing" },
    { operation: "add", places: ["同名山", "另一个景点"], broadRegion: null }, async (expression) =>
      expression === "同名山" ? { status: "ambiguous", options: [
        { id: "a", province: "云南省", place: "迪庆藏族自治州", spot: expression },
        { id: "b", province: "云南省", place: "丽江市", spot: expression },
        { id: "c", province: "四川省", place: "甘孜藏族自治州", spot: expression },
      ] } : { status: "resolved", pick: { id: "d", province: "云南省", place: "迪庆藏族自治州", spot: expression }, exact: false }, "同名山和另一个景点");
  assert.equal(result.choices?.presentation.choices.length, 4);
  assert.equal(new Set(result.choices?.presentation.choices.map((choice) => choice.id)).size, 4);
});

test("only the user's own words plus an administrative or scenic suffix count as the same place", () => {
  for (const [name, said] of [["大连市", "大连"], ["大连市", "大连市"], ["云南省", "云南"], ["迪庆藏族自治州", "迪庆"],
    ["阿坝藏族羌族自治州", "阿坝"], ["香格里拉市", "香格里拉"], ["玉龙雪山风景区", "玉龙雪山"], ["香港特别行政区", "香港"]]) {
    assert.equal(namesSamePlace(name, said), true, `${said} → ${name}`);
  }
  for (const [name, said] of [["大连市", "大莲"], ["梅里雪山", "梅里"], ["大理白族自治州", "大"],
    ["梅里雪山观景台", "梅里雪山"], ["丽江古城", "丽江"]]) {
    assert.equal(namesSamePlace(name, said), false, `${said} → ${name}`);
  }
});

test("exact names are written straight in while uncertain ones in the same message are offered", async () => {
  const result = await applyDestinationEdit({ state: "known", source: "user", areas: [{ province: "云南省", places: [] }] },
    { operation: "add", places: ["大连", "大里"], broadRegion: null }, async (expression) => expression === "大连"
      ? { status: "resolved", pick: { id: "dl", province: "辽宁省", place: "大连市", spot: null }, exact: true }
      : { status: "resolved", pick: { id: "dali", province: "云南省", place: "大理白族自治州", spot: null }, exact: false },
    "我想去大连和大里");
  assert.equal(result.changed, true);
  assert.deepEqual(result.destination, { state: "known", source: "user", areas: [
    { province: "云南省", places: [] }, { province: "辽宁省", places: [{ name: "大连市", spots: [] }] }] });
  assert.equal(result.choices?.answering, "大里");
  assert.deepEqual(result.choices?.presentation.choices.map((choice) => choice.name), ["大理白族自治州"]);
});

test("an exact name already in the Journey changes nothing", async () => {
  const current = { state: "known" as const, source: "user" as const,
    areas: [{ province: "辽宁省", places: [{ name: "大连市", spots: [] }] }] };
  const result = await applyDestinationEdit(current, { operation: "add", places: ["大连"], broadRegion: null },
    async () => ({ status: "resolved", pick: { id: "dl", province: "辽宁省", place: "大连市", spot: null }, exact: true }),
    "大连");
  assert.equal(result.changed, false);
  assert.equal(result.destination, current);
  assert.deepEqual(result.added, []);
});

test("a name the model wrote but the user never typed is offered, however exactly it matched", async () => {
  const result = await applyDestinationEdit({ state: "missing" }, { operation: "add", places: ["大理"], broadRegion: null },
    async () => ({ status: "resolved", pick: { id: "dali", province: "云南省", place: "大理白族自治州", spot: null }, exact: true }),
    "我还想去大莲");
  assert.equal(result.changed, false);
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.choices?.presentation.choices.map((choice) => choice.name), ["大理白族自治州"]);
});
