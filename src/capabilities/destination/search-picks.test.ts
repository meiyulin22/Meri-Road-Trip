import assert from "node:assert/strict";
import test from "node:test";

import type { LocationCandidate } from "@/domain/location/location";

import { destinationSelectionSchema, pickFromSuggestion, withoutAreaNamesakes } from "./search-picks";

function candidate(name: string, kind: LocationCandidate["kind"]): LocationCandidate {
  return {
    providerId: name, name, province: "辽宁省", city: "大连市", district: "金州区",
    region: "辽宁省 大连市 金州区", address: null, longitude: 121.6, latitude: 38.9,
    coordinateSystem: "CGCS2000", kind,
  };
}

test("beside the area itself, a shop, a company and an event are not offered", () => {
  const area = candidate("大连市", "other");
  // Tianditu files these three under the scenic category, exactly like a real park.
  const shop = candidate("大连上升", "sight");
  const company = candidate("大连CS", "sight");
  const festival = candidate("大连啤酒节", "sight");
  const park = candidate("大连光乐园", "sight");
  const beach = candidate("大连老虎滩海洋公园", "sight");
  assert.deepEqual(
    withoutAreaNamesakes([area, shop, company, festival, park, beach], "大连").map((place) => place.name),
    ["大连市", "大连光乐园", "大连老虎滩海洋公园"]);
});

test("without an area answer, namesakes are left alone", () => {
  const museum = candidate("青岛啤酒博物馆", "sight");
  const beer = candidate("青岛啤酒", "other");
  // 青岛 alone would be an area, but it is not among these candidates — nothing is hidden.
  assert.deepEqual(withoutAreaNamesakes([museum, beer], "青岛").map((place) => place.name),
    ["青岛啤酒博物馆", "青岛啤酒"]);
});

test("a name that is exactly the user's word always stays", () => {
  const area = candidate("西湖区", "other");
  const lake = { ...candidate("西湖", "sight"), province: "浙江省", city: "杭州市" };
  const areaInCity = { ...area, province: "浙江省", city: "杭州市" };
  assert.deepEqual(withoutAreaNamesakes([areaInCity, lake], "西湖").map((place) => place.name),
    ["西湖区", "西湖"]);
});

test("a tourist zone that happens to end in 区 is not the area that silences namesakes", () => {
  const zone = candidate("青岛奥帆海洋文化旅游区", "sight");
  const boat = candidate("青岛之星", "sight");
  // No administrative answer here, so nothing is hidden.
  assert.deepEqual(withoutAreaNamesakes([zone, boat], "青岛").map((place) => place.name),
    ["青岛奥帆海洋文化旅游区", "青岛之星"]);
});

test("an autonomous prefecture counts as the area, and a one-character query changes nothing", () => {
  const prefecture = { ...candidate("大理白族自治州", "other"), province: "云南省", city: "大理白族自治州" };
  const shop = { ...candidate("大理饭店", "other"), province: "云南省", city: "大理白族自治州" };
  assert.deepEqual(withoutAreaNamesakes([prefecture, shop], "大理").map((place) => place.name),
    ["大理白族自治州"]);
  assert.equal(withoutAreaNamesakes([prefecture, shop], "大").length, 2);
});

test("a selected one-character tip verifies its full city name and region", () => {
  const city = candidate("大连市", "other");
  const pick = pickFromSuggestion([candidate("大连老虎滩海洋公园", "sight"), city],
    "大连市", "辽宁省大连市西岗区");
  // The tip's district locates the city centre; it must not turn the city into a spot.
  assert.equal(pick?.province, "辽宁省");
  assert.equal(pick?.place, "大连市");
  assert.equal(pick?.spot, null);
});

test("suggestion verification refuses a namesake in a different province, city or district", () => {
  const spot = { ...candidate("大观区", "other"), province: "安徽省", city: "安庆市", district: "大观区" };
  for (const region of ["云南省大理白族自治州", "安徽省合肥市", "安徽省安庆市迎江区"]) {
    assert.equal(pickFromSuggestion([spot], "大观区", region), null);
  }
  assert.equal(pickFromSuggestion([spot], "大观区", "安徽省安庆市大观区")?.spot, "大观区");
  assert.equal(pickFromSuggestion([spot], "大观", "安徽省安庆市大观区"), null);
});

test("missing, foreign or ambiguous suggestions never become a saved preference", () => {
  const first = { ...candidate("大连市", "other"), district: null };
  const other = { ...first, providerId: "other", province: "吉林省", city: "大连市" };
  assert.equal(pickFromSuggestion([], "大连市", null), null);
  assert.equal(pickFromSuggestion([first, other], "大连市", null), null);
  assert.equal(pickFromSuggestion([{ ...first, province: "安大略省" }], "大连市", null), null);
  assert.equal(pickFromSuggestion([first], "大连市", null)?.place, "大连市");
});

test("duplicate POIs for the same suggestion save one province/city/spot preference", () => {
  const first = candidate("大连老虎滩海洋公园", "sight");
  assert.equal(pickFromSuggestion([first, { ...first, providerId: "duplicate" }], first.name,
    "辽宁省大连市金州区")?.id, first.providerId);
  const province = { ...candidate("辽宁省", "other"), city: null, district: null };
  assert.equal(pickFromSuggestion([province], "辽宁省", "辽宁省")?.place, null);
  const municipality = { ...candidate("北京市", "other"), province: "北京市", city: "北京市", district: null };
  assert.equal(pickFromSuggestion([municipality], "北京市", "北京市东城区")?.place, "北京市");
});

test("manual selection accepts either a provider ID or a full suggestion name and region", () => {
  assert.deepEqual(destinationSelectionSchema.parse({ query: " 大连市 ", region: "辽宁省大连市西岗区" }),
    { query: "大连市", region: "辽宁省大连市西岗区" });
  assert.equal(destinationSelectionSchema.safeParse({ query: "大连", id: "city" }).success, true);
  assert.equal(destinationSelectionSchema.safeParse({ query: "大连市", region: null }).success, true);
  for (const input of [{ query: "大", region: null }, { query: "大连市" },
    { query: "大连市", region: "" }, { query: "大连市", id: "city", region: null },
    { query: "大连市", region: null, province: "辽宁省" }, { query: "大连市", region: 12 }]) {
    assert.equal(destinationSelectionSchema.safeParse(input).success, false);
  }
});
