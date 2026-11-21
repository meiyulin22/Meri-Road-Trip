import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { outdoorRating, poorReasons } from "@/domain/plan/weather";
import { createDailyBudget } from "@/platform/http/daily-budget";
import type { Gate } from "@/platform/http/request-pacer";

import { codeOfSymbol, createMetNorwayForecast, gustFactor, metNorwayUserAgent, parseMetNorway } from "./met-norway";

// Recorded 2026-11-21 with two free calls: 大理古城 (25.6939, 100.1615) and 玉龙雪山 (27.095, 100.178).
const [town, mountain] = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "met-norway-dali-2026-11-21.json"), "utf8")) as unknown[];

const straightThrough: Gate = { run: (task) => task(), pause: () => {} };
const budget = (dailyUnits = 100) => createDailyBudget({ intervalMs: 0, dailyUnits, pauseMs: 60_000 },
  { file: null, gate: straightThrough, label: { provider: "MET Norway", units: (count) => `${count} calls` } });
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A small answer: hourly steps through one Beijing day, from 00:00 to 23:00 (16:00 UTC the day before). */
function hourly(date: string, step: (hour: number) => { temp: number; wind: number; mm: number; symbol: string; gust?: number }) {
  const start = Date.parse(`${date}T00:00:00+08:00`);
  return {
    geometry: { coordinates: [100, 25, 2000] },
    properties: {
      timeseries: Array.from({ length: 24 }, (_, hour) => {
        const value = step(hour);
        return {
          time: new Date(start + hour * 3_600_000).toISOString(),
          data: {
            instant: { details: { air_temperature: value.temp, wind_speed: value.wind, ...(value.gust === undefined ? {} : { wind_speed_of_gust: value.gust }) } },
            next_1_hours: { summary: { symbol_code: value.symbol }, details: { precipitation_amount: value.mm } },
          },
        };
      }),
    },
  };
}

test("the recorded answers read as Beijing days, each point at its own terrain height", () => {
  const townDays = parseMetNorway(town, "2026-11-21", "2026-12-05");
  const mountainDays = parseMetNorway(mountain, "2026-11-21", "2026-12-05");
  assert.ok(townDays && mountainDays);
  assert.equal(townDays.elevation, 2041);
  assert.equal(mountainDays.elevation, 4838);
  // The first day starts at 21:00 and the last is one reading: both too thin to stand.
  assert.equal(townDays.days[0].date, "2026-11-22");
  assert.equal(townDays.days.at(-1)?.date, "2026-11-30");
  assert.deepEqual(townDays.days[0], {
    date: "2026-11-22", code: 63, high: 18, low: 11, precipitationMm: 2.3, precipitationChance: null,
    snowfallCm: 0, gustKmh: 21, wetHours: 7, estimated: true,
  });
  // The same day on the mountain is far colder than the town below it.
  assert.ok(mountainDays.days[0].high < townDays.days[0].low);
});

test("heavy snow on the mountain reads as a poor day with snowfall worked out from its water", () => {
  const day = parseMetNorway(mountain, "2026-11-24", "2026-11-24")?.days[0];
  assert.ok(day);
  assert.equal(day.code, 75);
  assert.equal(day.snowfallCm, day.precipitationMm);
  assert.ok(day.snowfallCm >= 5);
  assert.equal(outdoorRating(day), "poor");
  assert.deepEqual(poorReasons(day), ["heavy_snow"]);
});

test("only the dates asked for come back", () => {
  const days = parseMetNorway(town, "2026-11-23", "2026-11-24")?.days ?? [];
  assert.deepEqual(days.map(({ date }) => date), ["2026-11-23", "2026-11-24"]);
});

test("gusts come from the mean wind times the gust factor, or from MET's own gusts where it has them", () => {
  const windy = parseMetNorway(hourly("2026-11-22", () => ({ temp: 10, wind: 12, mm: 0, symbol: "cloudy" })), "2026-11-22", "2026-11-22");
  assert.equal(windy?.days[0].gustKmh, Math.round(12 * gustFactor * 3.6));
  assert.equal(outdoorRating(windy!.days[0]), "poor");
  const measured = parseMetNorway(hourly("2026-11-22", () => ({ temp: 10, wind: 12, gust: 15, mm: 0, symbol: "cloudy" })), "2026-11-22", "2026-11-22");
  assert.equal(measured?.days[0].gustKmh, 54);
});

test("rain hours stand in for a chance of rain; thunder anywhere makes the day a thunderstorm", () => {
  const showers = parseMetNorway(hourly("2026-11-22", (hour) => ({
    temp: 15, wind: 2, mm: hour >= 12 && hour < 16 ? 0.3 : 0, symbol: hour === 14 ? "rainshowersandthunder_day" : "partlycloudy_day",
  })), "2026-11-22", "2026-11-22")?.days[0];
  assert.ok(showers);
  assert.equal(showers.wetHours, 4);
  assert.equal(showers.precipitationMm, 1.2);
  assert.equal(showers.code, 95);
  assert.equal(outdoorRating(showers), "poor");
  const drizzly = { ...showers, code: 61 };
  assert.equal(outdoorRating(drizzly), "fair");
});

test("precipitation at or below freezing counts as snow even under a rain symbol", () => {
  const day = parseMetNorway(hourly("2026-11-22", () => ({ temp: -2, wind: 1, mm: 0.5, symbol: "lightrain" })), "2026-11-22", "2026-11-22")?.days[0];
  assert.equal(day?.snowfallCm, 12);
});

test("MET symbols map to the WMO codes the rest of Meri reads", () => {
  assert.equal(codeOfSymbol("clearsky_day"), 0);
  assert.equal(codeOfSymbol("partlycloudy_polartwilight"), 2);
  assert.equal(codeOfSymbol("heavyrainshowers_night"), 82);
  assert.equal(codeOfSymbol("heavysnow"), 75);
  assert.equal(codeOfSymbol("lightssnowshowersandthunder_day"), 95);
  assert.equal(codeOfSymbol("something_new"), 3);
});

test("a broken shape is not used", () => {
  assert.equal(parseMetNorway({ properties: {} }, "2026-11-22", "2026-11-22"), null);
});

test("one request a point, four decimals, with the User-Agent; the answer is marked MET Norway", async () => {
  const calls: { url: string; agent: string | null }[] = [];
  const forecast = createMetNorwayForecast({
    fetch: async (url, init) => {
      calls.push({ url: String(url), agent: new Headers(init?.headers).get("User-Agent") });
      return answer(calls.length === 1 ? town : mountain);
    },
    budget: budget(),
    userAgent: "Meri-test",
  });
  const result = await forecast(
    [{ latitude: 25.693912, longitude: 100.161549 }, { latitude: 27.095, longitude: 100.178 }],
    { from: "2026-11-22", to: "2026-11-24" },
  );
  assert.equal(result.status, "ok");
  assert.ok(result.status === "ok");
  assert.equal(result.provider, "met-norway");
  assert.deepEqual(result.points.map(({ elevation }) => elevation), [2041, 4838]);
  assert.equal(result.points[0].days.length, 3);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /lat=25\.6939&lon=100\.1615$/u);
  assert.equal(calls[0].agent, "Meri-test");
});

test("any point failing fails the city; an error answer pauses MET Norway, a lost line does not", async () => {
  const refusing = budget();
  const refused = createMetNorwayForecast({ fetch: async () => answer({}, 403), budget: refusing, userAgent: "x" });
  assert.deepEqual(await refused([{ latitude: 25, longitude: 100 }], { from: "2026-11-22", to: "2026-11-22" }),
    { status: "failure", reason: "http_error" });
  assert.deepEqual(await refused([{ latitude: 25, longitude: 100 }], { from: "2026-11-22", to: "2026-11-22" }),
    { status: "failure", reason: "paused" });

  let asked = 0;
  const lost = createMetNorwayForecast({
    fetch: async () => {
      asked += 1;
      if (asked === 2) throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
      return answer(town);
    },
    budget: budget(),
    userAgent: "x",
  });
  const points = [{ latitude: 25, longitude: 100 }, { latitude: 26, longitude: 100 }, { latitude: 27, longitude: 100 }];
  assert.deepEqual(await lost(points, { from: "2026-11-22", to: "2026-11-22" }), { status: "failure", reason: "network" });
  assert.equal(asked, 2);
  asked = 10;
  assert.equal((await lost(points, { from: "2026-11-22", to: "2026-11-22" })).status, "ok");
});

test("the User-Agent can be set, and otherwise names Meri without any personal contact", () => {
  assert.equal(metNorwayUserAgent({ MET_NORWAY_USER_AGENT: " Meri/2 site.example " } as unknown as NodeJS.ProcessEnv), "Meri/2 site.example");
  assert.match(metNorwayUserAgent({} as unknown as NodeJS.ProcessEnv), /^Meri\//u);
});
