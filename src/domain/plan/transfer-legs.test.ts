import assert from "node:assert/strict";
import test from "node:test";

import type { LocationField } from "@/domain/trip-state/trip-state";

import type { DayFrame } from "./plan-draft";
import { planDraftSchema } from "./plan-draft-response";
import { originPoint, railQueryDate, transferLegs, type TravelChoice, travelChoiceOf, transportPreferenceFor } from "./transfer-legs";

const frame = (day: number, city: string, arrivingFrom: string | null = null): DayFrame =>
  ({ day, date: null, province: "云南省", city, arrivingFrom, focus: null, theme: null });
const trip = [frame(1, "丽江市"), frame(2, "丽江市"), frame(3, "大理白族自治州", "丽江市"), frame(4, "大理白族自治州")];
const shanghai: LocationField = { state: "known", value: "上海", source: "user" };
const shape = (legs: ReturnType<typeof transferLegs>) => legs.map(({ kind, day, from, to, estimate }) => [kind, day, from, to, estimate.status]);

test("code lists setting off, every change of city and the way back, from the route and the origin (1.2106)", () => {
  assert.deepEqual(shape(transferLegs(trip, shanghai, "full")), [
    ["outbound", 1, "上海", "丽江市", "not_looked_up"],
    ["between", 3, "丽江市", "大理白族自治州", "not_looked_up"],
    ["return", 4, "大理白族自治州", "上海", "not_looked_up"],
  ]);
  // One city: no change of city, still a way there and back.
  assert.deepEqual(shape(transferLegs(trip.slice(0, 2), shanghai, "full")).map(([kind]) => kind), ["outbound", "return"]);
});

test("without a usable origin the setting-off and return legs say why, and only the cities are looked up", () => {
  assert.deepEqual(shape(transferLegs(trip, { state: "missing" }, "full")), [
    ["outbound", 1, null, "丽江市", "origin_missing"],
    ["between", 3, "丽江市", "大理白族自治州", "not_looked_up"],
    ["return", 4, "大理白族自治州", null, "origin_missing"],
  ]);
  const rough = transferLegs(trip, { state: "approximate", value: "江浙一带", source: "user" }, "full");
  assert.deepEqual(shape(rough)[0], ["outbound", 1, "江浙一带", "丽江市", "origin_uncertain"]);
  assert.deepEqual(shape(rough)[2], ["return", 4, "大理白族自治州", "江浙一带", "origin_uncertain"]);
});

test("a preview plan shows only its first day, so it has no way back yet", () => {
  assert.deepEqual(shape(transferLegs([frame(1, "丽江市")], shanghai, "preview")), [["outbound", 1, "上海", "丽江市", "not_looked_up"]]);
  assert.deepEqual(transferLegs([], shanghai, "full"), []);
});

test("a saved plan's transfers are checked when read; plans from before 1.2106 have none and still read", () => {
  const draft = { mode: "full", totalDays: 4, route: { source: "agent", cities: [], omitted: [] }, days: [], conflicts: [], unverified: [] };
  assert.ok(planDraftSchema.safeParse(draft).success);
  const transfers = [
    { kind: "between", day: 3, from: "丽江市", to: "大理白族自治州", estimate: { status: "estimated", distanceKm: 186, durationMinutes: 163, path: [[100.2, 26.9], [100.2, 25.6]] } },
    { kind: "outbound", day: 1, from: null, to: "丽江市", estimate: { status: "origin_missing" } },
  ];
  assert.ok(planDraftSchema.safeParse({ ...draft, transfers }).success);
  assert.ok(!planDraftSchema.safeParse({ ...draft, transfers: [{ ...transfers[1], estimate: { status: "by_train" } }] }).success);
});

test("a saved change of plane reads back, with both flights and the change (1.2113)", () => {
  const draft = { mode: "full", totalDays: 4, route: { source: "agent", cities: [], omitted: [] }, days: [], conflicts: [], unverified: [] };
  const part = { fromAirport: "上海虹桥", toAirport: "成都天府", departs: "12:30", arrives: "15:40", arriveDayOffset: 0, durationMinutes: 190,
    cabin: "经济舱", price: 980, seatsLeft: 9, charges: 100, stopCity: null, codeshare: false };
  const first = { ...part, flightNo: "MU9181" };
  const second = { ...part, flightNo: "MU5780", fromAirport: "成都天府", toAirport: "迪庆香格里拉", departs: "17:30", arrives: "19:00", durationMinutes: 90, price: 650 };
  const journey = { ...first, flightNo: "MU9181/MU5780", toAirport: "迪庆香格里拉", arrives: "19:00", durationMinutes: 390, price: 1630, charges: 200,
    change: { city: "成都", waitMinutes: 110, sameAirport: true, first, second } };
  const leg = { kind: "outbound", day: 1, from: "上海", to: "迪庆藏族自治州", estimate: { status: "not_looked_up" },
    flights: { queriedDate: "2026-12-21", checkedAt: "2026-11-19T06:30:00.000Z", options: [journey] },
    recommendation: { mode: "flight", trainCode: null, flightNo: "MU9181/MU5780", reason: "经成都转机", by: "agent" } };
  assert.ok(planDraftSchema.safeParse({ ...draft, transfers: [leg] }).success);
});

test("a saved flight-then-train journey reads back (1.2114)", () => {
  const draft = { mode: "full", totalDays: 4, route: { source: "agent", cities: [], omitted: [] }, days: [], conflicts: [], unverified: [] };
  const flight = { flightNo: "MU5122", fromAirport: "北京首都", toAirport: "景德镇罗家", departs: "08:00", arrives: "10:20", arriveDayOffset: 0,
    durationMinutes: 140, cabin: "经济舱", price: 600, seatsLeft: 9, charges: 100, stopCity: null, codeshare: false };
  const train = { code: "G1234", from: "景德镇北", to: "婺源", departs: "12:40", arrives: "13:10", arriveDayOffset: 0, durationMinutes: 30,
    seats: [{ name: "二等座", price: 38, left: "有" }] };
  const leg = { kind: "outbound", day: 1, from: "北京", to: "婺源", estimate: { status: "not_looked_up" },
    airRail: { checkedAt: "2026-11-19T06:30:00.000Z", options: [{ code: "MU5122/G1234", city: "景德镇", flight, train, waitMinutes: 140,
      departs: "08:00", arrives: "13:10", arriveDayOffset: 0, durationMinutes: 310, price: 638 }] },
    recommendation: { mode: "air_rail", trainCode: null, flightNo: null, airRailCode: "MU5122/G1234", reason: "飞到景德镇换高铁", by: "agent" } };
  assert.ok(planDraftSchema.safeParse({ ...draft, transfers: [leg] }).success);
});

test("a choice stands for a transport preference, and only a picked Tianditu origin has a point (1.2107)", () => {
  assert.deepEqual(["drive", "train", "flight", "auto"].map((choice) => transportPreferenceFor(choice as TravelChoice)),
    ["self_drive", "public_transport", "public_transport", "flexible"]);
  assert.equal(originPoint(shanghai), null);
  assert.deepEqual(originPoint({ ...shanghai, selection: { provider: "tianditu", coordinates: { longitude: 121.32, latitude: 31.19, coordinateSystem: "CGCS2000" } } }),
    { longitude: 121.32, latitude: 31.19 });
  assert.equal(originPoint({ ...shanghai, selection: { provider: "amap", coordinates: { longitude: 121.32, latitude: 31.19, coordinateSystem: "GCJ-02" } } }), null);
  assert.equal(originPoint({ state: "missing" }), null);
});

test("12306 is asked for the leg's own day inside its presale window, and a same-weekday reference beyond it (1.2108)", () => {
  assert.deepEqual(railQueryDate("2026-11-20", "2026-11-17"), { date: "2026-11-20", reference: false });
  assert.deepEqual(railQueryDate("2026-12-01", "2026-11-17"), { date: "2026-12-01", reference: false });
  // A Monday five weeks out: the last Monday within the window.
  assert.deepEqual(railQueryDate("2026-12-21", "2026-11-17"), { date: "2026-11-30", reference: true });
  assert.equal(railQueryDate("2026-11-10", "2026-11-17"), null);
});

test("a trip's transport preference stands for a choice; none means only the drive", () => {
  assert.equal(travelChoiceOf({ state: "known", value: "self_drive", source: "user" }), "drive");
  assert.equal(travelChoiceOf({ state: "known", value: "public_transport", source: "user" }), "train");
  assert.equal(travelChoiceOf({ state: "known", value: "flexible", source: "user" }), "auto");
  assert.equal(travelChoiceOf({ state: "known", value: "no_self_drive", source: "user" }), "auto");
  assert.equal(travelChoiceOf({ state: "missing" }), null);
});
