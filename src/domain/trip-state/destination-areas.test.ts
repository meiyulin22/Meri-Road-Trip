import assert from "node:assert/strict";
import test from "node:test";

import { addToDestination, destinationAdditions, destinationAreasText, destinationAreasTitle, destinationContains,
  destinationProvinceText, parseDestinationAreas, removeFromDestination } from "./destination-areas";

const sichuan = { province: "四川省", places: [
  { name: "甘孜藏族自治州", spots: ["稻城亚丁"] },
  { name: "阿坝藏族羌族自治州", spots: ["四姑娘山"] },
] };
const yunnan = { province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["梅里雪山"] }] };
const hainan = { province: "海南省", places: [] };

test("destination text groups cities and their spot preferences under provinces", () => {
  assert.equal(destinationAreasText([sichuan, yunnan]),
    "四川省 甘孜藏族自治州（稻城亚丁）、阿坝藏族羌族自治州（四姑娘山） · 云南省 迪庆藏族自治州（梅里雪山）");
  assert.equal(destinationProvinceText([sichuan, yunnan]), "四川省、云南省");
});

test("empty province remains visible after its final city is deleted", () => {
  assert.equal(destinationAreasText([hainan]), "海南省");
  assert.equal(destinationAreasTitle([hainan]), "海南省");
  const removed = removeFromDestination([{ province: "海南省", places: [{ name: "三亚市", spots: ["蜈支洲岛"] }] }],
    { province: "海南省", place: "三亚市", spot: null });
  assert.deepEqual(removed, [hainan]);
});

test("one city names the trip; multiple cities use provinces", () => {
  assert.equal(destinationAreasTitle([yunnan]), "迪庆藏族自治州");
  assert.equal(destinationAreasTitle([sichuan]), "四川省");
  assert.equal(destinationAreasTitle([sichuan, yunnan]), "四川省、云南省");
});

test("past two provinces the title names the first two and the count", () => {
  assert.equal(destinationAreasTitle([sichuan, yunnan, hainan]), "四川省、云南省等3省");
});

test("additions name only new provinces, new cities and new spots", () => {
  const before = [{ province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["梅里雪山"] }] }];
  const after = [
    { province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["梅里雪山", "香格里拉市"] }, { name: "丽江市", spots: [] }] },
    { province: "浙江省", places: [{ name: "杭州市", spots: [] }] },
  ];
  assert.deepEqual(destinationAdditions(before, after), [
    { province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["香格里拉市"] }, { name: "丽江市", spots: [] }] },
    { province: "浙江省", places: [{ name: "杭州市", spots: [] }] },
  ]);
  assert.deepEqual(destinationAdditions(after, after), []);
});

test("stored areas are copied and invalid structures are rejected", () => {
  const input = [{ province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["梅里雪山"] }] }];
  const parsed = parseDestinationAreas(input);
  assert.deepEqual(parsed, input);
  assert.notStrictEqual(parsed, input);
  assert.deepEqual(parseDestinationAreas([hainan]), [hainan]);
  for (const value of [undefined, null, "云南省", {}, [],
    [{ province: "云南省", places: ["梅里雪山"] }],
    [{ province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["梅里雪山", "梅里雪山"] }] }],
    [hainan, hainan]]) {
    assert.equal(parseDestinationAreas(value), null);
  }
});

test("adding a new spot preserves all other cities and deduplicates repeats", () => {
  const areas = addToDestination([sichuan], { province: "四川省", place: "甘孜藏族自治州", spot: "贡嘎山" });
  assert.deepEqual(areas[0].places[0].spots, ["稻城亚丁", "贡嘎山"]);
  assert.deepEqual(areas[0].places[1], sichuan.places[1]);
  assert.equal(destinationContains(areas, { province: "四川省", place: "甘孜藏族自治州", spot: "贡嘎山" }), true);
  assert.deepEqual(addToDestination(areas, { province: "四川省", place: "甘孜藏族自治州", spot: "贡嘎山" }), areas);
});
