import assert from "node:assert/strict";
import test from "node:test";

import {
  destinationAreasText,
  destinationAreasTitle,
  destinationProvinceText,
  groupDestinationAreas,
  parseDestinationAreas,
  sameDestinationAreas,
} from "./destination-areas";

const sichuan = { province: "四川省", places: ["稻城亚丁", "四姑娘山"] };
const yunnan = { province: "云南省", places: ["梅里雪山"] };
const hainan = { province: "海南省", places: [] };

test("a destination reads as its places under their provinces", () => {
  assert.equal(destinationAreasText([sichuan, yunnan]), "四川省 稻城亚丁、四姑娘山 · 云南省 梅里雪山");
  assert.equal(destinationProvinceText([sichuan, yunnan]), "四川省、云南省");
});

test("a province with no places is the destination text, not an empty one", () => {
  // 「我想去海南」 before knowing where in 海南 is an answer, and it has to display.
  assert.equal(destinationAreasText([hainan]), "海南省");
  assert.equal(destinationAreasTitle([hainan]), "海南省");
  assert.equal(destinationAreasText([hainan, sichuan]), "海南省 · 四川省 稻城亚丁、四姑娘山");
});

test("the title is the one place when there is one, and the provinces otherwise", () => {
  assert.equal(destinationAreasTitle([yunnan]), "梅里雪山");
  assert.equal(destinationAreasTitle([sichuan]), "四川省");
  assert.equal(destinationAreasTitle([sichuan, yunnan]), "四川省、云南省");
});

test("stored areas are parsed into their own structure, not trusted as given", () => {
  const areas = parseDestinationAreas([{ province: "四川省", places: ["稻城亚丁"] }]);
  assert.deepEqual(areas, [{ province: "四川省", places: ["稻城亚丁"] }]);
  assert.deepEqual(parseDestinationAreas([{ province: "海南省", places: [] }]), [hainan]);
});

test("a shape that is not a destination is rejected rather than half-read", () => {
  for (const value of [
    undefined, null, "四川省", {}, [],
    [{ province: "  ", places: [] }],
    [{ province: "四川省" }],
    [{ places: ["稻城亚丁"] }],
    [{ province: "四川省", places: ["稻城亚丁"], note: "x" }],
    [{ province: "四川省", places: "稻城亚丁" }],
    [{ province: "四川省", places: [""] }],
    [{ province: "四川省", places: ["稻城亚丁", "稻城亚丁"] }],
    [{ province: "四川省", places: [] }, { province: "四川省", places: ["四姑娘山"] }],
  ]) {
    assert.equal(parseDestinationAreas(value), null, JSON.stringify(value ?? null));
  }
});

test("picked places are grouped under their provinces, in the order they were offered", () => {
  assert.deepEqual(groupDestinationAreas([
    { province: "四川省", name: "稻城亚丁" },
    { province: "云南省", name: "梅里雪山" },
    { province: "四川省", name: "四姑娘山" },
  ]), [sichuan, yunnan]);
  assert.deepEqual(groupDestinationAreas([]), []);
});

test("the same place picked twice is one place, not two", () => {
  assert.deepEqual(groupDestinationAreas([
    { province: "云南省", name: "梅里雪山" },
    { province: "云南省", name: "梅里雪山" },
  ]), [yunnan]);
});

test("the same places are one choice however they were ordered or grouped", () => {
  assert.ok(sameDestinationAreas([sichuan, yunnan], [yunnan, sichuan]));
  assert.ok(sameDestinationAreas([sichuan], [{ province: "四川省", places: ["四姑娘山", "稻城亚丁"] }]));
  assert.ok(sameDestinationAreas([hainan], [hainan]));
  assert.ok(sameDestinationAreas([], []));
});

test("a different set of places is a different choice", () => {
  assert.equal(sameDestinationAreas([sichuan], [sichuan, yunnan]), false);
  assert.equal(sameDestinationAreas([sichuan], [{ province: "四川省", places: ["稻城亚丁"] }]), false);
  assert.equal(sameDestinationAreas([sichuan], [{ province: "四川省", places: ["稻城亚丁", "泸沽湖"] }]), false);
  assert.equal(sameDestinationAreas([yunnan], [{ province: "四川省", places: ["梅里雪山"] }]), false);
  assert.equal(sameDestinationAreas([hainan], [{ province: "海南省", places: ["三亚市"] }]), false);
});
