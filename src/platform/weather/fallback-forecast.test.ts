import assert from "node:assert/strict";
import test from "node:test";

import { withFallbackForecast } from "./fallback-forecast";
import type { ForecastAnswer, WeatherForecast } from "./weather-forecast";

const names = { primary: "Open-Meteo", fallback: "MET Norway" };
const range = { from: "2026-11-22", to: "2026-11-24" };
const point = [{ latitude: 25.69, longitude: 100.16 }];
const ok = (provider: "open-meteo" | "met-norway"): ForecastAnswer => ({ status: "ok", provider, points: [{ elevation: 2000, days: [] }] });

function recording(result: ForecastAnswer): WeatherForecast & { calls: number } {
  const forecast = Object.assign(async () => { forecast.calls += 1; return result; }, { calls: 0 });
  return forecast;
}

test("the primary's forecast is used and the fallback never asked", async () => {
  const fallback = recording(ok("met-norway"));
  const answer = await withFallbackForecast(recording(ok("open-meteo")), fallback, names)(point, range);
  assert.equal(answer.status === "ok" && answer.provider, "open-meteo");
  assert.equal(fallback.calls, 0);
});

test("a lost connection, a pause or the day's cap on the primary asks the fallback", async () => {
  for (const reason of ["network", "timeout", "paused", "daily_limit", "http_error", "invalid_response"] as const) {
    const fallback = recording(ok("met-norway"));
    const answer = await withFallbackForecast(recording({ status: "failure", reason }), fallback, names)(point, range);
    assert.equal(answer.status === "ok" && answer.provider, "met-norway", reason);
    assert.equal(fallback.calls, 1);
  }
});

test("both failing keeps the primary's reason", async () => {
  const answer = await withFallbackForecast(recording({ status: "failure", reason: "network" }),
    recording({ status: "failure", reason: "http_error" }), names)(point, range);
  assert.deepEqual(answer, { status: "failure", reason: "network" });
});
