import assert from "node:assert/strict";
import test from "node:test";

import { legModeOffer, switchLegMode } from "./leg-mode";
import type { FlightOption, TrainOption, TransferLeg } from "./transfer-legs";

const train = (code: string, minutes: number): TrainOption => ({
  code, from: "上海南", to: "丽江", departs: "17:38", arrives: "22:10", arriveDayOffset: 1, durationMinutes: minutes,
  seats: [{ name: "硬卧", price: 580, left: "有" }],
});
const flight = (flightNo: string, minutes: number): FlightOption => ({
  flightNo, fromAirport: "上海浦东", toAirport: "丽江三义", departs: "07:55", arrives: "11:50", arriveDayOffset: 0,
  durationMinutes: minutes, cabin: "经济舱", price: 670, seatsLeft: 9, charges: 190, stopCity: null, codeshare: false,
});
const leg = (trainMinutes: number): TransferLeg => ({
  kind: "outbound", day: 1, from: "上海", to: "丽江市",
  estimate: { status: "estimated", distanceKm: 2700, durationMinutes: 2280, path: [[121, 31], [100, 26]] },
  trains: { queriedDate: "2026-11-20", reference: false, checkedAt: "2026-11-18T08:00:00.000Z", options: [train("Z162", trainMinutes), train("K79", trainMinutes + 300)] },
  flights: { queriedDate: "2026-11-20", checkedAt: "2026-11-18T08:00:00.000Z", options: [flight("9C6733", 255), flight("CA8559", 235)] },
  recommendation: { mode: "train", trainCode: "Z162", flightNo: null, reason: "坚持坐火车", by: "code" },
});

test("only a train over 12 hours beside a found flight can be switched, both ways (1.2115)", () => {
  assert.equal(legModeOffer(leg(1712)), "flight");
  assert.equal(legModeOffer(leg(600)), null);
  assert.equal(legModeOffer({ ...leg(1712), flights: undefined }), null);
  assert.equal(legModeOffer({ ...leg(1712), kind: "between" }), null);
  const flown = switchLegMode(leg(1712), "flight", "zh");
  assert.deepEqual(flown?.recommendation, { mode: "flight", trainCode: null, flightNo: "CA8559", by: "traveller", reason: "你在计划页改坐飞机，这是用时最短的一班" });
  // The picked flight leads the card's list; the trains stay for the switch back.
  assert.equal(flown?.flights?.options[0].flightNo, "CA8559");
  assert.equal(flown && legModeOffer(flown), "train");
  assert.equal(flown && switchLegMode(flown, "train", "en")?.recommendation?.trainCode, "Z162");
  // A switch that is not on offer changes nothing.
  assert.equal(switchLegMode(leg(1712), "train", "zh"), null);
});
