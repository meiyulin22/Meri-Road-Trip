import assert from "node:assert/strict";
import test from "node:test";

import type { TransferLeg } from "@/domain/plan/transfer-legs";

import { driveDuration, trainLine, trainSource, transferEnds, transferLabel, transferText } from "./plan-transfer-text";

const leg = (estimate: TransferLeg["estimate"], overrides: Partial<TransferLeg> = {}): TransferLeg =>
  ({ kind: "between", day: 3, from: "丽江市", to: "大理白族自治州", estimate, ...overrides });
const drive = (durationMinutes: number, distanceKm: number): TransferLeg["estimate"] =>
  ({ status: "estimated", durationMinutes, distanceKm, path: [[1, 1], [2, 2]] });

test("a drive's length reads as people say it, rounded to ten minutes once it is over an hour (1.2106)", () => {
  assert.equal(driveDuration(45, "zh"), "45 分钟");
  assert.equal(driveDuration(163, "zh"), "2 小时 40 分钟");
  assert.equal(driveDuration(178, "zh"), "3 小时");
  assert.equal(driveDuration(163, "en"), "2 h 40 min");
});

test("an estimated leg is worded for a self-driver or by road, and a long one points to trains and flights", () => {
  assert.equal(transferText(leg(drive(163, 186)), "self_drive", "zh"), "开车约 2 小时 40 分钟 · 186 公里（估算）");
  assert.equal(transferText(leg(drive(163, 186)), null, "zh"), "车程约 2 小时 40 分钟 · 186 公里（估算）");
  assert.equal(transferText(leg(drive(163, 186)), "public_transport", "en"), "About 2 h 40 min by road · 186 km (estimate)");
  assert.equal(transferText(leg(drive(2280, 2700)), null, "zh"), "车程约 38 小时 · 2700 公里（估算），路程较远，可以考虑火车或飞机");
});

test("a leg without a time says why", () => {
  assert.equal(transferText(leg({ status: "origin_missing" }, { kind: "outbound", from: null }), null, "zh"), "出发地还没写，这段暂不估算");
  assert.equal(transferText(leg({ status: "origin_uncertain" }, { kind: "return", to: "江浙一带" }), null, "zh"), "出发地还不确定（江浙一带），这段暂不估算");
  assert.equal(transferText(leg({ status: "not_found", place: "伦敦" }), null, "zh"), "地图上没找到「伦敦」，这段暂不估算");
  assert.equal(transferText(leg({ status: "not_looked_up" }), null, "zh"), "车程还没查到");
  assert.deepEqual(transferEnds(leg({ status: "origin_missing" }, { kind: "outbound", from: null }), "zh"), { from: "出发地", to: "大理白族自治州" });
  assert.deepEqual([transferLabel("outbound", "zh"), transferLabel("between", "zh"), transferLabel("return", "en")], ["启程", "转场", "Heading home"]);
});

test("a missing train or a chosen flight is said first, with the drive as a reference (1.2107–1.2108)", () => {
  assert.equal(transferText({ ...leg(drive(163, 186)), trainsMissing: "none" }, "public_transport", "zh", "train"),
    "这段没查到合适的直达车次（可能要中转）；先给开车参考：车程约 2 小时 40 分钟 · 186 公里（估算）");
  // Not searched (no train service turned on): no claim about trains at all.
  assert.equal(transferText(leg(drive(163, 186)), "public_transport", "zh", "train"), "车程约 2 小时 40 分钟 · 186 公里（估算）");
  assert.equal(transferText(leg(drive(2280, 2700)), "public_transport", "zh", "flight"),
    "你选了飞机，航班查询下一步接上；先给开车参考：车程约 38 小时 · 2700 公里（估算）");
  assert.equal(transferText(leg(drive(163, 186)), "self_drive", "zh", "drive"), "开车约 2 小时 40 分钟 · 186 公里（估算）");
  assert.equal(transferText(leg({ status: "origin_missing" }, { kind: "return", to: null }), null, "zh"), "出发地还没写，在上面的启程卡里填写后一起估算");
});

test("a train reads as one line, its cheapest seat priced; a reference train says nothing about seats (1.2108)", () => {
  const c378 = { code: "C378", from: "丽江", to: "大理", departs: "12:00", arrives: "14:22", arriveDayOffset: 0, durationMinutes: 142,
    seats: [{ name: "一等座", price: 127, left: "5" }, { name: "二等座", price: 80, left: "有" }] };
  assert.equal(trainLine(c378, false, "zh"), "C378 · 12:00 丽江 → 14:22 大理 · 2 小时 22 分 · 二等座 ¥80 有票");
  assert.equal(trainLine(c378, true, "zh"), "C378 · 12:00 丽江 → 14:22 大理 · 2 小时 22 分 · 二等座 ¥80");
  assert.equal(trainLine({ ...c378, arrives: "01:40", arriveDayOffset: 1 }, false, "en"), "C378 · 12:00 丽江 → 01:40 (+1d) 大理 · 2 h 22 min · 二等座 ¥80 available");
  const trains = { queriedDate: "2026-11-30", reference: true, checkedAt: "2026-11-17T13:30:00.000Z", options: [c378] };
  assert.match(trainSource(trains, "2026-12-21", "zh"), /^参考车次：12\/21周一还没开售，这是 11\/30周一 的时刻表，开售后再确认 · 来自 12306 · /u);
  assert.match(trainSource({ ...trains, reference: false }, null, "zh"), /^来自 12306 · 11\/17 21:30 查询$/u);
});
