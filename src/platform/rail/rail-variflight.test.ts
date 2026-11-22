import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createDailyBudget } from "@/platform/http/daily-budget";
import type { Gate } from "@/platform/http/request-pacer";

import { railProvider } from "./rail-mcp";
import { createVariflightRail, readVariflightTrains, stationOfCity } from "./rail-variflight";

// Recorded 2026-11-18 from Tripmatch searchTrainTickets: 丽江 → 大理 on 11-20, and a day past presale.
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "..", "flight", "fixtures", name), "utf8");
const dali = fixture("variflight-train-ljg-dali-2026-11-20.txt");
const beyond = fixture("variflight-train-ljg-dali-2026-12-21.txt");
const search = { fromCity: "丽江", toCity: "大理", date: "2026-11-20", earliestHour: 0, latestHour: 24 };
const now = new Date("2026-11-18T06:00:00.000Z");
const straightThrough: Gate = { run: (task) => task(), pause: () => {} };
const budget = () => createDailyBudget({ intervalMs: 0, dailyUnits: 2_000, pauseMs: 60_000 },
  { file: null, gate: straightThrough, label: { provider: "VariFlight", units: (fen) => `${fen} fen` } });

test("only trains between the two cities' own stations are kept, once each, in departure order", () => {
  const answer = readVariflightTrains(dali, search, { date: "2026-11-20", reference: false }, now);
  assert.equal(answer.status, "found");
  assert.ok(answer.status === "found");
  const { options } = answer.trains;
  assert.ok(options.length > 0);
  // Tripmatch lists stops in all of 大理州 (鹤庆, 祥云, 漾濞); none of them is the city traveller goes to.
  assert.ok(options.every(({ from, to }) => from.startsWith("丽江") && to.startsWith("大理")));
  assert.deepEqual(options.map(({ departs }) => departs), [...options.map(({ departs }) => departs)].sort());
  assert.equal(new Set(options.map(({ code, to }) => `${code}>${to}`)).size, options.length);
  const c378 = options.find(({ code }) => code === "C378");
  assert.deepEqual(c378 && [c378.departs, c378.arrives, c378.durationMinutes, c378.arriveDayOffset], ["12:00", "14:22", 142, 0]);
  assert.ok(c378?.seats.some(({ name, price }) => name === "二等座" && price === 80));
});

test("the leg's departure window is applied by code, since Tripmatch has none", () => {
  const morning = readVariflightTrains(dali, { ...search, earliestHour: 0, latestHour: 11 }, { date: "2026-11-20", reference: false }, now);
  assert.ok(morning.status !== "found" || morning.trains.options.every(({ departs }) => departs < "11:00"));
  assert.equal(readVariflightTrains(dali, { ...search, earliestHour: 23, latestHour: 24 }, { date: "2026-11-20", reference: false }, now).status, "none");
});

test("暂无数据 past presale reads as none, with the reference flag kept", () => {
  assert.deepEqual(readVariflightTrains(beyond, search, { date: "2026-12-21", reference: true }, now),
    { status: "none", queriedDate: "2026-12-21", reference: true });
});

test("a station is the city's own when named after it", () => {
  assert.equal(stationOfCity("上海虹桥", "上海"), true);
  assert.equal(stationOfCity("大理", "大理"), true);
  assert.equal(stationOfCity("祥云", "大理"), false);
});

test("one paid call a search, ¥0.25 from VariFlight's money budget; a failure pauses with no retry", async () => {
  const calls: Record<string, unknown>[] = [];
  const spend = budget();
  const rail = createVariflightRail({
    enabled: () => true, budget: spend, now: () => now,
    tools: async () => async (name, input) => { calls.push({ name, ...input }); return dali; },
  });
  assert.equal((await rail(search)).status, "found");
  assert.deepEqual(calls, [{ name: "searchTrainTickets", from_city: "丽江", to_city: "大理", date: "2026-11-20" }]);

  const failing = createVariflightRail({
    enabled: () => true, budget: budget(), now: () => now,
    tools: async () => async () => { throw new Error("socket hang up"); },
  });
  assert.deepEqual(await failing(search), { status: "unavailable", reason: "failed" });
  assert.deepEqual(await failing(search), { status: "unavailable", reason: "paused" });
  assert.deepEqual(await createVariflightRail({ enabled: () => false, budget: budget(), now: () => now, tools: async () => async () => dali })(search),
    { status: "unavailable", reason: "disabled" });
});

test("trains come from VariFlight by default, 12306 only when asked, none when off or without a key", () => {
  const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;
  assert.equal(railProvider(env({ VARIFLIGHT_API_KEY: "k" })), "variflight");
  assert.equal(railProvider(env({ VARIFLIGHT_API_KEY: "k", RAIL_PROVIDER: "variflight" })), "variflight");
  assert.equal(railProvider(env({ VARIFLIGHT_API_KEY: "k", RAIL_PROVIDER: "12306" })), "12306");
  assert.equal(railProvider(env({ VARIFLIGHT_API_KEY: "k", RAIL_PROVIDER: "off" })), null);
  assert.equal(railProvider(env({})), null);
  assert.equal(railProvider(env({ VARIFLIGHT_API_KEY: "k", PAID_CALLS_ENABLED: "false" })), null);
});
