import assert from "node:assert/strict";
import test from "node:test";

import { joinFlights, minFlightChangeMinutes } from "./flight-connections";
import type { FlightOption } from "./transfer-legs";

const flight = (flightNo: string, from: string, to: string, departs: string, minutes: number, price: number, seatsLeft: number | null = 9): FlightOption => {
  const end = Number(departs.slice(0, 2)) * 60 + Number(departs.slice(3, 5)) + minutes;
  return {
    flightNo, fromAirport: from, toAirport: to, departs,
    arrives: `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
    arriveDayOffset: Math.floor(end / 1440), durationMinutes: minutes,
    cabin: "经济舱", price, seatsLeft, charges: 100, stopCity: null, codeshare: false,
  };
};

// The recorded VariFlight connection 上海 → 迪庆 on 12-21 (1.2113 fixture): MU9181 then MU5780 in 成都天府.
const mu9181 = flight("MU9181", "上海虹桥", "成都天府", "12:30", 190, 980);
const mu5780 = flight("MU5780", "成都天府", "迪庆香格里拉", "17:30", 90, 650, 4);

test("two flights through one airport join with the fares added as two tickets (1.2113)", () => {
  const [journey] = joinFlights([mu9181], [mu5780], 0, "成都");
  assert.deepEqual(
    [journey.flightNo, journey.fromAirport, journey.toAirport, journey.departs, journey.arrives, journey.durationMinutes, journey.price, journey.charges, journey.seatsLeft],
    ["MU9181/MU5780", "上海虹桥", "迪庆香格里拉", "12:30", "19:00", 390, 1630, 200, 4],
  );
  assert.deepEqual(journey.change && [journey.change.city, journey.change.waitMinutes, journey.change.sameAirport], ["成都", 110, true]);
});

test("a change needs an hour and a half in one airport and three and a half across the city", () => {
  assert.equal(minFlightChangeMinutes.sameAirport, 90);
  // 15:40 landing: 17:00 is 80 minutes, too soon; of the rest, the earliest arrival wins.
  const soon = flight("MU5700", "成都天府", "迪庆香格里拉", "17:00", 90, 600);
  const later = flight("MU5782", "成都天府", "迪庆香格里拉", "18:00", 90, 600);
  assert.deepEqual(joinFlights([mu9181], [soon, later, mu5780], 0, "成都").map(({ flightNo }) => flightNo), ["MU9181/MU5780"]);
  // From 双流 the same 18:00 is too soon; 19:20 is 3 h 40 min and joins, flagged as another airport.
  const shuangliu = (departs: string) => flight("3U8000", "成都双流", "迪庆香格里拉", departs, 90, 500);
  assert.deepEqual(joinFlights([mu9181], [shuangliu("18:00")], 0, "成都"), []);
  const [across] = joinFlights([mu9181], [shuangliu("19:20")], 0, "成都");
  assert.equal(across.change?.sameAirport, false);
});

test("a wait over six hours is no connection; a night landing joins the next morning's flight", () => {
  assert.deepEqual(joinFlights([mu9181], [flight("MU1", "成都天府", "迪庆香格里拉", "23:00", 90, 500)], 0, "成都"), []);
  const late = flight("MU2", "上海虹桥", "成都天府", "21:30", 190, 700);
  // Lands 00:40; 06:30 the next day is a 5 h 50 min wait.
  const morning = flight("MU3", "成都天府", "迪庆香格里拉", "06:30", 90, 500);
  const [journey] = joinFlights([late], [morning], 1, "成都");
  assert.deepEqual(journey && [journey.arrives, journey.arriveDayOffset, journey.durationMinutes], ["08:00", 1, 630]);
});
