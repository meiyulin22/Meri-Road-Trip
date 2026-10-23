import assert from "node:assert/strict";
import test from "node:test";

import type { LocationCandidate } from "@/domain/location/location";

import { withoutAreaNamesakes } from "./search-picks";

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
