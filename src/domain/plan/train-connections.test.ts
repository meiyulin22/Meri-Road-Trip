import assert from "node:assert/strict";
import test from "node:test";

import { joinConnections } from "./train-connections";
import type { TrainOption } from "./transfer-legs";

const train = (code: string, from: string, to: string, departs: string, minutes: number): TrainOption => ({
  code, from, to, departs, arrives: "00:00", arriveDayOffset: 0, durationMinutes: minutes, seats: [{ name: "二等座", price: 100, left: "有" }],
});

test("two direct trains join into one journey with the change and its wait (1.2110)", () => {
  // Z162 leaves 17:38 and reaches 昆明 the next day at 22:10; D8761 leaves 昆明 that night at 23:40.
  const first = train("Z162", "上海南", "昆明", "17:38", 1712);
  const second = train("D8761", "昆明", "丽江", "23:40", 200);
  const [journey] = joinConnections([first], [second], 1, "昆明");
  assert.equal(journey.code, "Z162/D8761");
  assert.deepEqual([journey.departs, journey.arrives, journey.arriveDayOffset], ["17:38", "03:00", 2]);
  assert.equal(journey.change?.waitMinutes, 90);
  assert.equal(journey.change?.sameStation, true);
  assert.equal(journey.durationMinutes, 2 * 24 * 60 + 3 * 60 - (17 * 60 + 38));
  // A night in the change city is not a connection: 06:30 the next morning waits too long.
  assert.equal(joinConnections([first], [train("D1", "昆明", "丽江", "06:30", 200)], 2, "昆明").length, 0);
});

test("too short a change, a change across the city, and too long a wait are judged by code", () => {
  const first = train("G1", "上海虹桥", "昆明南", "07:00", 600); // arrives 17:00
  const sameDay = (departs: string, from = "昆明南") => train("D2", from, "丽江", departs, 180);
  assert.equal(joinConnections([first], [sameDay("17:30")], 0, "昆明").length, 0);
  assert.equal(joinConnections([first], [sameDay("17:45")], 0, "昆明")[0]?.change?.waitMinutes, 45);
  // From 昆明 station instead of 昆明南: 90 minutes at least, and said.
  assert.equal(joinConnections([first], [sameDay("18:00", "昆明")], 0, "昆明").length, 0);
  assert.equal(joinConnections([first], [sameDay("18:40", "昆明")], 0, "昆明")[0]?.change?.sameStation, false);
  assert.equal(joinConnections([first], [sameDay("23:30")], 0, "昆明").length, 0);
});

test("each first train keeps its quickest second, and the quickest journeys come first", () => {
  const firsts = [train("A", "上海", "昆明", "08:00", 600), train("B", "上海", "昆明", "06:00", 660)];
  const seconds = [train("X", "昆明", "丽江", "19:00", 200), train("Y", "昆明", "丽江", "20:00", 120)];
  assert.deepEqual(joinConnections(firsts, seconds, 0, "昆明").map(({ code, durationMinutes }) => [code, durationMinutes]),
    [["A/Y", 840], ["B/Y", 960]]);
});
