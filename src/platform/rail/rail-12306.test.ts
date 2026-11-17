import assert from "node:assert/strict";
import test from "node:test";

import type { RailBudget } from "./rail-budget";
import { create12306Rail, trainOf } from "./rail-12306";

// Shaped like the probe's answer for 丽江 → 大理 on 2026-11-20 (12306-mcp 0.3.10, format json).
const row = (code: string, from: string, start: string, lishi: string) => ({
  train_no: "x", start_train_code: code, start_date: "2026-11-20", arrive_date: "2026-11-20", start_time: start, arrive_time: "00:00",
  lishi, from_station: from, to_station: "大理", from_station_telecode: "LHM", to_station_telecode: "DKM",
  prices: [{ seat_name: "二等座", short: "ze", seat_type_code: "O", num: "有", price: 80, discount: null },
    { seat_name: "一等座", short: "zy", seat_type_code: "M", num: "5", price: 127, discount: null }],
  dw_flag: ["复兴号"],
});

function setup(answer: (name: string, input: Record<string, unknown>) => string | Promise<string>) {
  const calls: { name: string; input: Record<string, unknown> }[] = [];
  let counted = 0;
  let paused = false;
  const budget: RailBudget = {
    run: async (requests, task) => { counted += requests; return { ok: true, value: await task() }; },
    pause: () => { paused = true; },
  };
  const search = create12306Rail({
    enabled: () => true,
    tools: async () => async (name, input) => { calls.push({ name, input }); return answer(name, input); },
    budget,
    now: () => new Date("2026-11-17T08:00:00Z"),
  });
  return { search, calls, counted: () => counted, paused: () => paused };
}

const codes = JSON.stringify({ 丽江: { station_code: "LHM", station_name: "丽江" }, 大理: { station_code: "DKM", station_name: "大理" } });
const standard = (tickets: unknown) => (name: string) => name === "get-station-code-of-citys" ? codes
  : name === "get-stations-code-in-city" ? "[]" : JSON.stringify(tickets);

test("trains between the two cities' own stations, with arrival computed from departure plus duration (1.2108)", async () => {
  const { search, calls, counted } = setup(standard([row("C378", "丽江", "12:00", "02:22"), row("K9999", "宁蒗", "23:10", "02:00")]));
  const answer = await search({ fromCity: "丽江", toCity: "大理", date: "2026-11-20", earliestHour: 6, latestHour: 13 });
  assert.equal(answer.status, "found");
  if (answer.status !== "found") return;
  // 宁蒗 is not 丽江's station: dropped.
  assert.deepEqual(answer.trains.options.map(({ code, arrives, arriveDayOffset, durationMinutes }) => [code, arrives, arriveDayOffset, durationMinutes]),
    [["C378", "14:22", 0, 142]]);
  assert.equal(answer.trains.reference, false);
  // Startup and one ticket search counted; the station table is the server's own.
  assert.equal(counted(), 3 + 2);
  assert.deepEqual(calls.find(({ name }) => name === "get-tickets")?.input,
    { date: "2026-11-20", fromStation: "丽江", toStation: "大理", format: "json", earliestStartTime: 6, latestStartTime: 13 });
});

test("across midnight the arrival is the next day, whatever the row says", () => {
  const train = trainOf(row("Z1", "丽江", "23:10", "02:30"), new Set(["丽江"]), new Set(["大理"]));
  assert.deepEqual(train && [train.arrives, train.arriveDayOffset], ["01:40", 1]);
});

test("beyond the presale window the same weekday inside it is asked, as a reference", async () => {
  const { search, calls } = setup(standard([row("C378", "丽江", "12:00", "02:22")]));
  const answer = await search({ fromCity: "丽江", toCity: "大理", date: "2026-12-21", earliestHour: 0, latestHour: 24 });
  assert.equal(answer.status === "found" && answer.trains.reference, true);
  // 2026-12-21 is a Monday; the last Monday within 14 days of 2026-11-17 is 2026-11-30.
  assert.equal(calls.find(({ name }) => name === "get-tickets")?.input.date, "2026-11-30");
});

test("an unknown city, an answer without data, and a real failure are told apart", async () => {
  const unknown = setup((name) => name === "get-station-code-of-citys" ? JSON.stringify({ 丽江: { station_code: "LHM", station_name: "丽江" }, 迪庆: { error: "未检索到城市。" } }) : "[]");
  assert.deepEqual(await unknown.search({ fromCity: "丽江", toCity: "迪庆", date: "2026-11-20", earliestHour: 0, latestHour: 24 }), { status: "no_station", place: "迪庆" });

  const empty = setup((name) => {
    if (name === "get-tickets") throw new Error("Cannot read properties of undefined (reading 'result')");
    return standard([])(name);
  });
  assert.equal((await empty.search({ fromCity: "丽江", toCity: "大理", date: "2026-11-20", earliestHour: 0, latestHour: 24 })).status, "none");
  assert.equal(empty.paused(), false);

  const refused = setup((name) => name === "get-tickets" ? "Error: get tickets data failed. " : standard([])(name));
  assert.deepEqual(await refused.search({ fromCity: "丽江", toCity: "大理", date: "2026-11-20", earliestHour: 0, latestHour: 24 }),
    { status: "unavailable", reason: "failed" });
  assert.equal(refused.paused(), true);
});

test("turned off unless RAIL_PROVIDER is 12306, and a past day is not asked", async () => {
  let started = false;
  const search = create12306Rail({
    enabled: () => false, tools: async () => { started = true; return async () => ""; },
    budget: { run: async (_requests, task) => ({ ok: true, value: await task() }), pause: () => {} }, now: () => new Date("2026-11-17T08:00:00Z"),
  });
  assert.deepEqual(await search({ fromCity: "丽江", toCity: "大理", date: "2026-11-20", earliestHour: 0, latestHour: 24 }), { status: "unavailable", reason: "disabled" });
  assert.equal(started, false);
  const { search: on } = setup(standard([]));
  assert.deepEqual(await on({ fromCity: "丽江", toCity: "大理", date: "2026-11-10", earliestHour: 0, latestHour: 24 }), { status: "unavailable", reason: "past_date" });
});
