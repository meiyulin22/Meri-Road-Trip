import assert from "node:assert/strict";
import test from "node:test";

import { joinAirRail, minAirRailChangeMinutes } from "./air-rail";
import type { FlightOption, TrainOption } from "./transfer-legs";

const flight = (flightNo: string, departs: string, minutes: number, price = 600): FlightOption => {
  const end = Number(departs.slice(0, 2)) * 60 + Number(departs.slice(3, 5)) + minutes;
  return {
    flightNo, fromAirport: "北京首都", toAirport: "景德镇罗家", departs,
    arrives: `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
    arriveDayOffset: Math.floor(end / 1440), durationMinutes: minutes, cabin: "经济舱", price, seatsLeft: 9, charges: 100, stopCity: null, codeshare: false,
  };
};
const train = (code: string, departs: string, minutes: number, price: number | null = 38): TrainOption => ({
  code, from: "景德镇北", to: "婺源", departs, arrives: "00:00", arriveDayOffset: 0, durationMinutes: minutes,
  seats: [{ name: "二等座", price, left: "有" }],
});

test("a flight joins the earliest train two hours after landing, the fare two tickets (1.2114)", () => {
  // Lands 10:20. 11:30 is too soon; 12:40 joins; 14:00 arrives later.
  const [journey] = joinAirRail([flight("MU5122", "08:00", 140)], [train("G1", "11:30", 30), train("G2", "12:40", 30), train("G3", "14:00", 30)], 0, "景德镇");
  assert.equal(minAirRailChangeMinutes, 120);
  assert.deepEqual([journey.code, journey.city, journey.departs, journey.arrives, journey.waitMinutes, journey.durationMinutes, journey.price],
    ["MU5122/G2", "景德镇", "08:00", "13:10", 140, 310, 638]);
});

test("a wait over six hours is no journey; a train with no fare leaves the price unknown; the quickest come first", () => {
  assert.deepEqual(joinAirRail([flight("MU1", "08:00", 120)], [train("G9", "17:00", 30)], 0, "景德镇"), []);
  const [unpriced] = joinAirRail([flight("MU1", "08:00", 120)], [train("G2", "12:00", 30, null)], 0, "景德镇");
  assert.equal(unpriced.price, null);
  const ranked = joinAirRail([flight("MU1", "08:00", 120), flight("MU2", "06:00", 120)], [train("G2", "12:00", 30), train("G3", "10:30", 30)], 0, "景德镇");
  // MU1 lands 10:00 and takes G2 (4 h 30 min in all); MU2 lands 08:00 and takes G3 (5 h).
  assert.deepEqual(ranked.map(({ code, durationMinutes }) => [code, durationMinutes]), [["MU1/G2", 270], ["MU2/G3", 300]]);
  // A late landing (23:20) joins the next morning's 05:00 train; 07:00 would be a wait over six hours.
  assert.deepEqual(joinAirRail([flight("MU3", "21:00", 140)], [train("G6", "07:00", 30)], 1, "景德镇"), []);
  const [night] = joinAirRail([flight("MU3", "21:00", 140)], [train("G5", "05:00", 30)], 1, "景德镇");
  assert.deepEqual(night && [night.arrives, night.arriveDayOffset, night.waitMinutes], ["05:30", 1, 340]);
});
