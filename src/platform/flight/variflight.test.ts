import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { DailyBudget } from "@/platform/http/daily-budget";

import { createVariflightHubs, createVariflightSearch, type FlightSearch } from "./variflight";

const recorded = readFileSync(join(import.meta.dirname, "fixtures", "variflight-sha-ljg-2026-12-21.txt"), "utf8");
const shanghaiLijiang: FlightSearch = { fromCode: "SHA", toCode: "LJG", fromCity: "上海", toCity: "丽江", date: "2026-12-21" };

function setup(answer: (name: string, input: Record<string, unknown>) => string | Promise<string>, enabled = true) {
  const calls: { name: string; input: Record<string, unknown> }[] = [];
  let pausedFor: number | undefined | null = null;
  let counted = 0;
  const budget: DailyBudget = {
    run: async (requests, task) => { counted += requests; return { ok: true, value: await task() }; },
    pause: (ms) => { pausedFor = ms; },
  };
  const deps = {
    enabled: () => enabled,
    tools: async () => async (name: string, input: Record<string, unknown>) => { calls.push({ name, input }); return answer(name, input); },
    budget,
    now: () => new Date("2026-11-18T06:30:00Z"),
  };
  return { search: createVariflightSearch(deps), hubs: createVariflightHubs(deps), calls, counted: () => counted, pausedFor: () => pausedFor };
}

test("the recorded answer becomes flights in Beijing time, the cheapest cabin, charges apart (1.2111)", async () => {
  const { search, calls, counted } = setup(() => recorded);
  const answer = await search(shanghaiLijiang);
  assert.equal(answer.status, "found");
  if (answer.status !== "found") return;
  assert.deepEqual(calls, [{ name: "getFlightPriceByCities", input: { dep_city: "SHA", arr_city: "LJG", dep_date: "2026-12-21" } }]);
  // Counted in fen since 1.2113: ¥0.25.
  assert.equal(counted(), 25);
  assert.deepEqual(answer.flights.options.map(({ flightNo, departs, arrives, arriveDayOffset }) => [flightNo, departs, arrives, arriveDayOffset]), [
    ["CA8559", "07:55", "11:50", 0], ["9C6733", "09:30", "13:45", 0], ["9C7115", "13:40", "17:45", 0], ["9C6617", "15:10", "19:30", 0], ["JD5666", "20:25", "00:15", 1],
  ]);
  const jd = answer.flights.options.find(({ flightNo }) => flightNo === "JD5666");
  assert.deepEqual(jd && [jd.fromAirport, jd.toAirport, jd.cabin, jd.price, jd.seatsLeft, jd.charges, jd.durationMinutes, jd.stopCity, jd.codeshare],
    ["上海浦东", "丽江三义", "经济舱", 570, 10, 190, 230, null, false]);
});

test("codes that name other cities are refused by the answer's own airport cities", async () => {
  const { search } = setup(() => recorded);
  assert.deepEqual(await search({ ...shanghaiLijiang, toCity: "大理" }), { status: "city_mismatch", got: { from: "上海", to: "丽江" } });
  assert.deepEqual(await search({ ...shanghaiLijiang, fromCode: "sha" }), { status: "bad_code" });
  assert.deepEqual(await search({ ...shanghaiLijiang, toCode: "SHA" }), { status: "bad_code" });
});

test("no flights, a failure, an empty balance and the switch are told apart", async () => {
  const empty = setup(() => "Flight prices: {'code': 200, 'message': 'Success', 'data': []}");
  assert.deepEqual(await empty.search(shanghaiLijiang), { status: "none" });
  assert.equal(empty.pausedFor(), null);

  const failing = setup(() => { throw new Error("upstream timeout"); });
  assert.deepEqual(await failing.search(shanghaiLijiang), { status: "unavailable", reason: "failed" });
  assert.equal(failing.pausedFor(), undefined);

  const broke = setup(() => { throw new Error("Streamable HTTP error: 403 insufficient balance"); });
  assert.deepEqual(await broke.search(shanghaiLijiang), { status: "unavailable", reason: "balance" });
  assert.equal(broke.pausedFor(), 12 * 60 * 60 * 1_000);

  const off = setup(() => recorded, false);
  assert.deepEqual(await off.search(shanghaiLijiang), { status: "unavailable", reason: "disabled" });
  assert.equal(off.calls.length, 0);
});

const transfers = readFileSync(join(import.meta.dirname, "fixtures", "variflight-flight-transfer-sha-dig-2026-12-21.txt"), "utf8");
const shanghaiDiqing: FlightSearch = { fromCode: "SHA", toCode: "DIG", fromCity: "上海", toCity: "迪庆", date: "2026-12-21" };

test("VariFlight's recorded connections give the change city of the day asked, and nothing else (1.2113)", async () => {
  const { hubs, calls, counted } = setup(() => transfers);
  assert.deepEqual(await hubs(shanghaiDiqing), { status: "found", hubs: [{ code: "CTU", city: "成都" }] });
  assert.deepEqual(calls, [{ name: "getFlightTransferInfo", input: { depcity: "SHA", arrcity: "DIG", depdate: "2026-12-21" } }]);
  assert.equal(counted(), 25);
  // The same pair repeated for later days does not count for another day, nor for other cities.
  assert.deepEqual(await setup(() => transfers).hubs({ ...shanghaiDiqing, date: "2026-12-24" }), { status: "none" });
  assert.deepEqual(await setup(() => transfers).hubs({ ...shanghaiDiqing, toCity: "丽江" }), { status: "none" });
  assert.deepEqual(await setup(() => transfers).hubs({ ...shanghaiDiqing, toCode: "SHA" }), { status: "bad_code" });
});
