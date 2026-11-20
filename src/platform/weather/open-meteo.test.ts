import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createDailyBudget } from "@/platform/http/daily-budget";
import type { Gate } from "@/platform/http/request-pacer";

import { createOpenMeteoForecast, openMeteoCalls, parseOpenMeteo } from "./open-meteo";

// Recorded 2026-11-20 with one free call: 丽江古城 and 玉龙雪山, 2026-11-21 to 2026-11-27.
const recorded: unknown = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "open-meteo-lijiang-2026-11-21.json"), "utf8"));

const straightThrough: Gate = { run: (task) => task(), pause: () => {} };
const budget = (dailyUnits = 100) => createDailyBudget({ intervalMs: 0, dailyUnits, pauseMs: 60_000 },
  { file: null, gate: straightThrough, label: { provider: "Open-Meteo", units: (count) => `${count} calls` } });
const answer = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

test("the recorded answer reads as one forecast per point, corrected to each point's elevation", () => {
  const points = parseOpenMeteo(recorded, 2);
  assert.ok(points);
  const [town, mountain] = points;
  assert.equal(town.elevation, 2454);
  assert.equal(mountain.elevation, 5026);
  assert.equal(town.days.length, 7);
  assert.deepEqual(town.days[3], {
    date: "2026-11-24", code: 95, high: 12, low: 5, precipitationMm: 22.5, precipitationChance: 100, snowfallCm: 0, gustKmh: 28,
  });
  // The mountain is far colder than the town below it on the same day.
  assert.ok(mountain.days[0].high < town.days[0].low);
  assert.equal(mountain.days[1].gustKmh, 64);
});

test("one point answers an object; a different number of points or a broken shape is not used", () => {
  const [single] = recorded as unknown[];
  assert.equal(parseOpenMeteo(single, 1)?.length, 1);
  assert.equal(parseOpenMeteo(recorded, 3), null);
  assert.equal(parseOpenMeteo({ daily: { time: ["2026-11-21"] } }, 1), null);
  const uneven = structuredClone(single) as { daily: { weather_code: number[] } };
  uneven.daily.weather_code.pop();
  assert.equal(parseOpenMeteo(uneven, 1), null);
});

test("a day without its code or temperatures is left out; missing amounts read as none", () => {
  const [single] = structuredClone(recorded) as { daily: Record<string, (number | null)[]> }[];
  single.daily.weather_code[0] = null;
  single.daily.precipitation_sum[1] = null;
  const [point] = parseOpenMeteo(single, 1) ?? [];
  assert.equal(point.days.length, 6);
  assert.equal(point.days[0].date, "2026-11-22");
  assert.equal(point.days[0].precipitationMm, 0);
});

test("all of a city's points go in one request, in the shape agreed", async () => {
  const urls: string[] = [];
  const forecast = createOpenMeteoForecast({
    fetch: async (url) => { urls.push(String(url)); return answer(recorded)(); },
    budget: budget(),
  });
  const result = await forecast(
    [{ longitude: 100.2299, latitude: 26.8721 }, { longitude: 100.1836, latitude: 27.1006 }],
    { from: "2026-11-21", to: "2026-11-27" },
  );
  assert.equal(result.status, "ok");
  assert.equal(urls.length, 1);
  const query = new URL(urls[0]).searchParams;
  assert.equal(query.get("latitude"), "26.8721,27.1006");
  assert.equal(query.get("longitude"), "100.2299,100.1836");
  assert.equal(query.get("timezone"), "Asia/Shanghai");
  assert.equal(query.get("start_date"), "2026-11-21");
  assert.equal(query.get("end_date"), "2026-11-27");
});

test("calls are counted as Open-Meteo counts them: per point, double past two weeks", () => {
  assert.equal(openMeteoCalls(3, "2026-11-21", "2026-11-27"), 3);
  assert.equal(openMeteoCalls(3, "2026-11-21", "2026-12-06"), 6);
});

test("the daily cap refuses before sending, and a failure pauses weather with no retry", async () => {
  let sent = 0;
  const capped = createOpenMeteoForecast({ fetch: async () => { sent += 1; return answer(recorded)(); }, budget: budget(1) });
  const points = [{ longitude: 100, latitude: 26 }, { longitude: 100.1, latitude: 27 }];
  assert.deepEqual(await capped(points, { from: "2026-11-21", to: "2026-11-27" }), { status: "failure", reason: "daily_limit" });
  assert.equal(sent, 0);

  const shared = budget();
  const failing = createOpenMeteoForecast({ fetch: async () => { sent += 1; return answer({ error: true }, 429)(); }, budget: shared });
  assert.deepEqual(await failing([points[0]], { from: "2026-11-21", to: "2026-11-21" }), { status: "failure", reason: "http_error" });
  assert.deepEqual(await failing([points[0]], { from: "2026-11-21", to: "2026-11-21" }), { status: "failure", reason: "paused" });
  assert.equal(sent, 1);
});

test("a network error or an answer that is not the asked shape is a failure, never a throw", async () => {
  const offline = createOpenMeteoForecast({ fetch: async () => { throw new TypeError("fetch failed"); }, budget: budget() });
  assert.deepEqual(await offline([{ longitude: 100, latitude: 26 }], { from: "2026-11-21", to: "2026-11-21" }), { status: "failure", reason: "network" });
  const odd = createOpenMeteoForecast({ fetch: answer({ hello: "world" }), budget: budget() });
  assert.deepEqual(await odd([{ longitude: 100, latitude: 26 }], { from: "2026-11-21", to: "2026-11-21" }), { status: "failure", reason: "invalid_response" });
});

test("no points asks nothing", async () => {
  const forecast = createOpenMeteoForecast({ fetch: async () => { throw new Error("must not send"); }, budget: budget() });
  assert.deepEqual(await forecast([], { from: "2026-11-21", to: "2026-11-21" }), { status: "ok", points: [] });
});
