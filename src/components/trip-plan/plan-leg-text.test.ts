import assert from "node:assert/strict";
import test from "node:test";

import type { DriveLeg } from "@/domain/plan/plan-draft";

import { legText } from "./plan-leg-text";

const names = { from: "洱海", to: "南诏风情岛" };

const leg = (overrides: Partial<DriveLeg>): DriveLeg => ({
  day: 1, fromSpotId: "a", toSpotId: "b", mode: "drive", distanceKm: 2.5, durationMinutes: 4, path: [[100, 25], [100.1, 25]],
  offRoadStartMeters: 0, offRoadEndMeters: 0, ...overrides,
});

test("a road leg is worded by how the traveller gets around; a walk says walk (1.2103)", () => {
  assert.equal(legText(leg({}), "self_drive", "zh", names), "开车约 4 分钟 · 2.5 公里");
  assert.equal(legText(leg({}), "no_self_drive", "zh", names), "打车约 4 分钟 · 2.5 公里");
  assert.equal(legText(leg({}), null, "zh", names), "车程约 4 分钟 · 2.5 公里");
  assert.equal(legText(leg({ mode: "walk", durationMinutes: 14, distanceKm: 1 }), "self_drive", "zh", names), "步行约 14 分钟 · 1 公里");
  assert.equal(legText(leg({}), "public_transport", "en", names), "About 4 min by taxi · 2.5 km");
  // Plans made in 1.2102 have no mode: they drove.
  assert.equal(legText(leg({ mode: undefined }), "flexible", "zh", names), "车程约 4 分钟 · 2.5 公里");
});

test("where the map has no road for part of the way, or at all, it is said without guessing how", () => {
  // 双廊古镇 → 南诏风情岛 by road: the road ends on the shore.
  assert.equal(legText(leg({ distanceKm: 0.7, durationMinutes: 1, offRoadEndMeters: 640 }), "self_drive", "zh", names),
    "开车约 1 分钟 · 0.7 公里，最后约 650 米地图上没有路（可能要坐船、索道或步行）");
  // A short stretch to the gate is ordinary and not mentioned.
  assert.equal(legText(leg({ offRoadEndMeters: 120 }), "self_drive", "zh", names), "开车约 4 分钟 · 2.5 公里");
  assert.equal(legText(leg({ mode: "none", distanceKm: 0.6, durationMinutes: 0 }), "self_drive", "zh", names),
    "地图上找不到路，直线约 0.6 公里（可能要坐船、索道或步行）");
});

test("an end more than 1 km from any road is a large area: no minutes and no kilometres (1.2105)", () => {
  // 洱海 → 南诏风情岛, measured 2026-11-17: Tianditu put 洱海 mid-lake, the first 1.7 km had no road.
  const lake = leg({ distanceKm: 54, durationMinutes: 70, offRoadStartMeters: 1700, offRoadEndMeters: 40 });
  assert.equal(legText(lake, "self_drive", "zh", names), "洱海是一大片区域，车程要看具体从哪里出发，无法估算");
  assert.equal(legText(lake, "self_drive", "en", { from: "Erhai", to: "Nanzhao Island" }),
    "Erhai is a large area, so the time depends on where you start and can't be estimated");
  assert.equal(legText(leg({ offRoadEndMeters: 1001 }), null, "zh", { from: "大理古城", to: "苍山" }), "苍山是一大片区域，车程要看具体到哪里，无法估算");
  assert.equal(legText(leg({ offRoadStartMeters: 1200, offRoadEndMeters: 1500 }), null, "zh", { from: "洱海", to: "苍山" }),
    "洱海和苍山都是一大片区域，车程要看具体从哪里到哪里，无法估算");
  assert.equal(legText(leg({ mode: "walk", offRoadEndMeters: 1100 }), null, "zh", names), "南诏风情岛是一大片区域，步行时间要看具体到哪里，无法估算");
  // Exactly 1 km is still a stretch with no road, said with the time.
  assert.equal(legText(leg({ offRoadEndMeters: 1000 }), "self_drive", "zh", names),
    "开车约 4 分钟 · 2.5 公里，最后约 1000 米地图上没有路（可能要坐船、索道或步行）");
});
