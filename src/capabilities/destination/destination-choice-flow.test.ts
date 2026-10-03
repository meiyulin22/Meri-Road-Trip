import assert from "node:assert/strict";
import test from "node:test";

import { applyDestinationEdit } from "./apply-destination-edit";
import { verifyDestinationChoice } from "./verified-destination-choice";
import { picksFromSearch, resolveDestinationPlace } from "./resolve-destination-place";
import { resolveDestinationCandidates } from "@/domain/location/destination-resolution-policy";

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

test("a foreign city mislabeled as domestic is still rejected when provider geography disagrees", async () => {
  assert.deepEqual(await verifyDestinationChoice({ id: "foreign", name: "札幌市", province: "云南省" }, {
    search: async () => ({ status: "success", candidates: [{ ...meriCandidate,
      providerId: "foreign", name: "札幌市", province: "北海道", city: "札幌市" }] }),
  }), { status: "unresolved" });
});

test("a verified spot becomes an offer and does not mutate destination until selection", async () => {
  const current = { state: "missing" } as const;
  const result = await applyDestinationEdit(current, { operation: "set", places: ["梅里雪山"], broadRegion: null },
    async () => ({ status: "resolved", pick: { id: "amap-meri", province: "云南省",
      place: "迪庆藏族自治州", spot: "梅里雪山" } }));
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

test("three POIs in one city offer one city with a named preference, reverified independently of POI order", async () => {
  const candidates = [
    { ...meriCandidate, providerId: "park", name: "梅里雪山国家公园景区", address: "东北七公里处" },
    { ...meriCandidate, providerId: "mountain-a" },
    { ...meriCandidate, providerId: "mountain-b", longitude: 98.68 },
  ];
  const result = await applyDestinationEdit({ state: "missing" },
    { operation: "set", places: ["梅里雪山"], broadRegion: null },
    (expression) => resolveDestinationPlace(expression, async (query) => resolveDestinationCandidates(query, candidates)));
  const choices = result.choices?.presentation.choices ?? [];
  assert.equal(choices.length, 1);
  assert.equal(choices[0].name, "迪庆藏族自治州");
  assert.equal(choices[0].spot, "梅里雪山");
  assert.equal(choices[0].detail, undefined);
  // IDs and exact coordinates are not the travel decision being confirmed.
  const verified = await verifyDestinationChoice(choices[0], {
    search: async () => ({ status: "success", candidates: [{ ...candidates[2], providerId: "new-map-record" }] }),
  });
  assert.deepEqual(verified, { status: "verified", pick: {
    province: "云南省", place: "迪庆藏族自治州", spot: "梅里雪山" } });
  assert.equal((await verifyDestinationChoice(choices[0], {
    search: async () => ({ status: "success", candidates: candidates.map((candidate) => ({ ...candidate, city: "丽江市" })) }),
  })).status, "unresolved");
});

test("three Dalian city records make one city choice and legacy recommendations still verify", async () => {
  const candidates = ["city-a", "city-b", "city-c"].map((providerId) => ({ ...meriCandidate,
    providerId, name: "大连市", province: "辽宁省", city: "大连市", district: null }));
  const result = await applyDestinationEdit({ state: "missing" },
    { operation: "add", places: ["大连市"], broadRegion: null },
    (expression) => resolveDestinationPlace(expression, async (query) => resolveDestinationCandidates(query, candidates)));
  const choices = result.choices?.presentation.choices ?? [];
  assert.equal(choices.length, 1);
  assert.equal(choices[0].spot, undefined);
  for (const choice of [choices[0], { id: "legacy-random", name: "大连市", province: "辽宁省" }]) {
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
      ] } : { status: "resolved", pick: { id: "d", province: "云南省", place: "迪庆藏族自治州", spot: expression } });
  assert.equal(result.choices?.presentation.choices.length, 4);
  assert.equal(new Set(result.choices?.presentation.choices.map((choice) => choice.id)).size, 4);
});
