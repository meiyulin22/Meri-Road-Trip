import assert from "node:assert/strict";
import test from "node:test";

import type { TransferLeg } from "@/domain/plan/transfer-legs";

import {
  flightCaption, flightChangeWarning, flightCharges, flightChecked, flightSeat, otherWay,
  changeCaption, changeSeats, changeTrains, changeWarning, driveDuration, driveSummary, legDayLabel, trainChecked, trainClock, trainLine, trainReferenceNote, trainSeat, trainSource,
  transferEnds, transferLabel, transferNote, transferText,
} from "./plan-transfer-text";

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
    "你选了飞机，航班暂时查不到；先给开车参考：车程约 38 小时 · 2700 公里（估算）");
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

test("a ticket's pieces: the clock, the cheapest seat, the drive headline and one note (1.2109)", () => {
  const z162 = { code: "Z162", from: "上海南", to: "丽江", departs: "17:38", arrives: "22:10", arriveDayOffset: 2, durationMinutes: 1712,
    seats: [{ name: "硬卧", price: 568, left: "有" }, { name: "软卧", price: 880, left: "无" }] };
  assert.deepEqual(trainClock(z162, "zh"), { departs: "17:38", arrives: "22:10", nextDay: "+2天", duration: "28 小时 32 分" });
  assert.equal(trainClock({ ...z162, arriveDayOffset: 1 }, "zh").nextDay, "次日");
  assert.equal(trainClock(z162, "en").nextDay, "+2d");
  assert.equal(trainSeat(z162, false, "zh"), "硬卧 ¥568 · 有票");
  assert.equal(trainSeat(z162, true, "zh"), "硬卧 ¥568");
  assert.equal(trainSeat({ ...z162, seats: [{ name: "无座", price: null, left: "有" }] }, false, "zh"), null);
  assert.deepEqual(driveSummary(leg(drive(163, 186)), null, "zh"), { headline: "车程约 2 小时 40 分钟", detail: "186 公里 · 估算" });
  assert.deepEqual(driveSummary(leg(drive(163, 186)), "self_drive", "en"), { headline: "About 2 h 40 min by car", detail: "186 km · estimate" });
  assert.equal(driveSummary(leg({ status: "not_looked_up" }), null, "zh"), null);
  assert.equal(transferNote(leg(drive(2280, 2700)), null, "zh"), "路程较远，可以考虑火车或飞机");
  assert.equal(transferNote({ ...leg(drive(2280, 2700)), trainsMissing: "none" }, "train", "zh"), "这段没查到合适的直达车次，可能要中转");
  assert.equal(transferNote(leg(drive(163, 186)), "flight", "zh"), "你选了飞机，航班暂时查不到");
  assert.equal(transferNote({ ...leg(drive(163, 186)), flightsMissing: "none" }, "flight", "zh"), "这段没查到航班");
  assert.equal(transferNote(leg(drive(163, 186)), null, "zh"), null);
  const trains = { queriedDate: "2026-11-30", reference: true, checkedAt: "2026-11-17T13:30:00.000Z", options: [z162] };
  assert.equal(trainChecked(trains, "zh"), "12306 · 11/17 21:30 查询");
  assert.equal(trainReferenceNote(trains, "2026-12-21", "zh"), "12/21周一还没开售，这是 11/30周一 的时刻表，开售后再确认");
  assert.equal(trainReferenceNote({ ...trains, reference: false }, "2026-12-21", "zh"), null);
  assert.equal(legDayLabel("2026-12-21", "zh"), "12/21周一");
});

test("a journey with a change names the city, both trains, the wait, each seat, and a change across town (1.2110)", () => {
  const part = (code: string, from: string, to: string, price: number, left: string) =>
    ({ code, from, to, departs: "07:05", arrives: "18:28", arriveDayOffset: 0, durationMinutes: 683, seats: [{ name: "二等座", price, left }] });
  const journey = { code: "G1373/D8761", from: "上海虹桥", to: "丽江", departs: "07:05", arrives: "23:28", arriveDayOffset: 0, durationMinutes: 983,
    seats: [], change: { city: "昆明", waitMinutes: 102, sameStation: false, first: part("G1373", "上海虹桥", "昆明南", 1168, "有"), second: part("D8761", "昆明", "丽江", 210, "12") } };
  assert.equal(changeCaption(journey, "zh"), "在昆明换乘 · 共 16 小时 23 分");
  assert.equal(changeTrains(journey, "zh"), "G1373 → D8761 · 等 1 小时 42 分");
  assert.equal(changeSeats(journey, false, "zh"), "G1373 二等座 ¥1168 · 有票 · D8761 二等座 ¥210 · 剩 12 张");
  assert.equal(changeWarning(journey, "zh"), "要在昆明从昆明南站换到昆明站，市内交通另算，换乘时间共 1 小时 42 分");
  assert.equal(changeWarning({ ...journey, change: { ...journey.change, sameStation: true } }, "zh"), null);
  const direct = { ...journey, change: undefined };
  assert.equal(changeCaption(direct, "zh"), null);
  assert.equal(changeSeats(direct, false, "zh"), null);
});

test("a flight reads as its number and time, the cheapest cabin, charges apart, and the other way to compare (1.2111)", () => {
  const nineC = { flightNo: "9C6733", fromAirport: "上海浦东", toAirport: "丽江三义", departs: "09:30", arrives: "13:45", arriveDayOffset: 0,
    durationMinutes: 255, cabin: "经济舱", price: 460, seatsLeft: 9, charges: 190, stopCity: null, codeshare: false };
  assert.deepEqual(flightCaption(nineC, "zh"), { caption: "9C6733 · 4 小时 15 分", note: null });
  assert.deepEqual(flightCaption({ ...nineC, stopCity: "昆明", codeshare: true }, "zh"), { caption: "9C6733 · 4 小时 15 分", note: "经停昆明 · 代码共享" });
  assert.equal(flightSeat(nineC, "zh"), "经济舱 ¥460 · 剩 9 张");
  assert.equal(flightSeat({ ...nineC, seatsLeft: null }, "en"), "经济舱 ¥460");
  assert.equal(flightCharges(nineC, "zh"), "另付机建燃油约 ¥190");
  assert.equal(flightCharges({ ...nineC, charges: null }, "zh"), null);
  const flights = { queriedDate: "2026-12-21", checkedAt: "2026-11-18T06:30:00.000Z", options: [nineC] };
  assert.equal(flightChecked(flights, "zh"), "飞常准 · 11/18 14:30 查询");
  const z162 = { code: "Z162", from: "上海南", to: "丽江", departs: "17:38", arrives: "22:10", arriveDayOffset: 2, durationMinutes: 1712, seats: [] };
  const both = { ...leg(drive(2280, 2700)), flights, trains: { queriedDate: "2026-12-21", reference: false, checkedAt: "2026-11-18T06:30:00.000Z", options: [z162] } };
  assert.equal(otherWay(both, "train", "zh"), "也有航班：最快 4 小时 15 分，¥460 起");
  assert.equal(otherWay(both, "flight", "zh"), "火车参考：最快 28 小时 32 分");
  assert.equal(otherWay(leg(drive(163, 186)), "flight", "zh"), null);
});

test("a change of plane reads like a change of train, its fare as two tickets, another airport said plainly (1.2113)", () => {
  const part = { fromAirport: "上海虹桥", toAirport: "成都天府", departs: "12:30", arrives: "15:40", arriveDayOffset: 0,
    cabin: "经济舱", seatsLeft: 9, charges: 100, stopCity: null, codeshare: false };
  const first = { ...part, flightNo: "MU9181", durationMinutes: 190, price: 980 };
  const second = { ...part, flightNo: "MU5780", fromAirport: "成都天府", toAirport: "迪庆香格里拉", departs: "17:30", arrives: "19:00", durationMinutes: 90, price: 650, seatsLeft: 4 };
  const journey = { ...first, flightNo: "MU9181/MU5780", toAirport: "迪庆香格里拉", arrives: "19:00", durationMinutes: 390, price: 1630, seatsLeft: 4, charges: 200,
    change: { city: "成都", waitMinutes: 110, sameAirport: true, first, second } };
  assert.deepEqual(flightCaption(journey, "zh"), { caption: "在成都转机 · 共 6 小时 30 分", note: "MU9181 → MU5780 · 等 1 小时 50 分" });
  assert.deepEqual(flightCaption(journey, "en"), { caption: "Change planes at 成都 · 6 h 30 min in all", note: "MU9181 → MU5780 · 1 h 50 min wait" });
  assert.equal(flightSeat(journey, "zh"), "两段分开买 ¥1630 · 剩 4 张");
  assert.equal(flightChangeWarning(journey, "zh"), null);
  const across = { ...journey, change: { ...journey.change, sameAirport: false, waitMinutes: 220, second: { ...second, fromAirport: "成都双流" } } };
  assert.equal(flightChangeWarning(across, "zh"), "成都天府落地，成都双流起飞，要换机场，市内交通另算，换乘时间共 3 小时 40 分");
});

test("a search switched off on this server is said plainly, not as a passing failure (1.2113 step 1)", () => {
  const off = leg({ status: "estimated", distanceKm: 2400, durationMinutes: 1500, path: [[121, 31], [100, 26]] }, { trainsMissing: "off" });
  assert.match(transferText(off, null, "zh"), /^没有开启火车查询；先给开车参考：/u);
  assert.equal(transferNote({ ...off, trainsMissing: undefined, flightsMissing: "off" }, "flight", "en"), "Flight search isn't switched on");
});
