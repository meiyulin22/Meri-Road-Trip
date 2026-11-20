import assert from "node:assert/strict";
import test from "node:test";

import { baseOutfit } from "@/domain/plan/outfit";
import { outfitItemIds } from "@/domain/plan/outfit";
import type { PlanDay } from "@/domain/plan/plan-draft";

import { basePixels, gridHeight, gridWidth, itemPixels, outfitManifestSchema } from "./outfit-art";
import { outfitLine, outfitNotes, slotEntries, thermometerAt } from "./plan-outfit-view";

const planDay: PlanDay = { day: 2, date: "2026-11-25", province: "云南省", city: "丽江市", arrivingFrom: null, focus: null, theme: null, stops: [] };
const base = baseOutfit(planDay, [
  { place: "玉龙雪山", elevation: 5369, own: true, forecast: { date: "2026-11-25", code: 45, high: -2, low: -11, precipitationMm: 0, precipitationChance: 0, snowfallCm: 0, gustKmh: 37 } },
  { place: "丽江古城", elevation: 2403, own: true, forecast: { date: "2026-11-25", code: 51, high: 14, low: 2, precipitationMm: 2.1, precipitationChance: 40, snowfallCm: 0, gustKmh: 22 } },
]);
if (!base) throw new Error("expected an outfit");
const outfit = { ...base, extras: [{ name: "暖宝宝", slot: "bag" as const, reason: "索道上风大" }], tip: "羽绒服山下可租。" };

test("every slot is listed in order; basics and Meri's additions sit in their slots with their reasons", () => {
  const slots = slotEntries(outfit, "zh");
  assert.deepEqual(slots.map(({ slot }) => slot), ["head", "face", "neck", "top", "mid", "outer", "hands", "legs", "feet", "bag"]);
  const outer = slots.find(({ slot }) => slot === "outer")?.entries;
  assert.deepEqual(outer?.map(({ name, reasons }) => [name, reasons]), [["羽绒服", ["玉龙雪山最低 -11°"]]]);
  const bag = slots.find(({ slot }) => slot === "bag")?.entries;
  assert.deepEqual(bag?.map(({ kind, name }) => [kind, name]), [["item", "防晒霜"], ["extra", "暖宝宝"]]);
  assert.deepEqual(slots.find(({ slot }) => slot === "face")?.entries[0].reasons, ["玉龙雪山海拔 5369 m，紫外线强"]);
  assert.equal(slotEntries(outfit, "en").find(({ slot }) => slot === "outer")?.entries[0].name, "Down jacket");
});

test("the notes say to dress in layers on a day that swings, then Meri's tip; the day card's line leads with the coat", () => {
  assert.deepEqual(outfitNotes(outfit, "zh"), [
    "最冷 -11°（玉龙雪山），最暖 14°（丽江古城）。出门一整天回不去换衣服，外套选好穿脱的，带个装得下它的包。",
    "羽绒服山下可租。",
  ]);
  assert.deepEqual(outfitNotes({ ...outfit, bigSwing: false, tip: null }, "en"), ["You're out all day: dress before you leave."]);
  assert.equal(outfitLine(outfit, "zh"), "羽绒服 · 毛线帽 · 手套 · 墨镜");
});

test("the thermometer runs from −20° to 35°", () => {
  assert.equal(thermometerAt(-20), 0);
  assert.equal(thermometerAt(35), 1);
  assert.equal(thermometerAt(-30), 0);
  assert.ok(Math.abs(thermometerAt(7.5) - 0.5) < 1e-9);
});

test("placeholder pixels stay on the 32 × 40 grid, and every basic is drawn or kept in the bag", () => {
  const inside = ([x, y, width, height]: readonly [number, number, number, number, string]) =>
    x >= 0 && y >= 0 && x + width <= gridWidth && y + height <= gridHeight;
  assert.ok(basePixels.every(inside));
  for (const id of outfitItemIds) {
    const art = itemPixels[id];
    if (art) assert.ok(art.pixels.every(inside), id);
  }
  assert.equal(itemPixels.sunscreen, null);
});

test("Codex's manifest is read only in the agreed shape", () => {
  const manifest = {
    version: 1, canvas: { width: 512, height: 640 }, pixelated: true, base: "base.webp",
    items: { down_jacket: { file: "down_jacket.webp", z: 42 } },
  };
  assert.equal(outfitManifestSchema.safeParse(manifest).success, true);
  assert.equal(outfitManifestSchema.safeParse({ ...manifest, base: "../secret.webp" }).success, false);
  assert.equal(outfitManifestSchema.safeParse({ ...manifest, items: { cape: { file: "cape.webp", z: 1 } } }).success, false);
});
