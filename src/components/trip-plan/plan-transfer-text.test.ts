import assert from "node:assert/strict";
import test from "node:test";

import type { TransferLeg } from "@/domain/plan/transfer-legs";

import { driveDuration, transferEnds, transferLabel, transferText } from "./plan-transfer-text";

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

test("a train or flight chosen on the plan page is said first, with the drive as a reference (1.2107)", () => {
  assert.equal(transferText(leg(drive(163, 186)), "public_transport", "zh", "train"),
    "你选了高铁，车次查询下一步接上；先给开车参考：车程约 2 小时 40 分钟 · 186 公里（估算）");
  assert.equal(transferText(leg(drive(2280, 2700)), "public_transport", "zh", "flight"),
    "你选了飞机，航班查询下一步接上；先给开车参考：车程约 38 小时 · 2700 公里（估算）");
  assert.equal(transferText(leg(drive(163, 186)), "self_drive", "zh", "drive"), "开车约 2 小时 40 分钟 · 186 公里（估算）");
  assert.equal(transferText(leg({ status: "origin_missing" }, { kind: "return", to: null }), null, "zh"), "出发地还没写，在上面的启程卡里填写后一起估算");
});
