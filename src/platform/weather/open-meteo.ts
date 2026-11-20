import { join } from "node:path";

import { z } from "zod";

import type { DayForecast } from "@/domain/plan/weather";
import { createDailyBudget, type DailyBudget } from "@/platform/http/daily-budget";
import { logger } from "@/platform/observability/logger";
import { providerLimits } from "@/platform/provider-limits";

import type { ForecastAnswer, PointForecast, WeatherForecast } from "./weather-forecast";

/**
 * Open-Meteo (agreed 2026-11-20): free, no key, no account and no bill, for non-commercial use.
 * Its free tier allows 10,000 calls a day per address; Meri stops itself far below that at
 * OPEN_METEO_MAX_CALLS_PER_DAY (2000 by default), counted across restarts. A failure pauses
 * weather for ten minutes, with no retry; the plan goes on without it.
 */
export const openMeteoLimits = { intervalMs: 200, dailyUnits: providerLimits.openMeteoCallsPerDay, pauseMs: 10 * 60 * 1_000 } as const;
const endpoint = "https://api.open-meteo.com/v1/forecast";
// Measured 2026-11-20 from this Mac without the proxy: about 7 s and often past 10 s to Open-Meteo's
// servers abroad; through the proxy about 1.3 s. merlin chose no proxy and a generous wait: a slower
// Generate plan is fine (2026-11-20). The China VPS will meet the same route.
const timeoutMs = 30_000;
const dailyVariables = [
  "weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_sum",
  "precipitation_probability_max", "snowfall_sum", "wind_gusts_10m_max",
] as const;

export const sharedOpenMeteoBudget = createDailyBudget(openMeteoLimits, {
  file: join(process.cwd(), ".cache", "open-meteo-calls.json"),
  label: { provider: "Open-Meteo", units: (count) => `${count} calls` },
});

/**
 * What Open-Meteo counts as calls: one per point, and more for a range past two weeks. Its limits
 * count the same way, so the cap matches what it sees.
 */
export function openMeteoCalls(points: number, from: string, to: string): number {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  return points * Math.max(1, Math.ceil(days / 14));
}

const numberOrNull = z.number().nullable();
const locationSchema = z.object({
  elevation: z.number().nullable().optional(),
  daily: z.object({
    time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)),
    weather_code: z.array(numberOrNull),
    temperature_2m_max: z.array(numberOrNull),
    temperature_2m_min: z.array(numberOrNull),
    precipitation_sum: z.array(numberOrNull),
    precipitation_probability_max: z.array(numberOrNull),
    snowfall_sum: z.array(numberOrNull),
    wind_gusts_10m_max: z.array(numberOrNull),
  }),
});

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Open-Meteo's answer read as one forecast per point, or null when its shape is not what was
 * asked for. One point answers an object, several an array. A day missing its code or
 * temperatures is left out rather than guessed; missing amounts read as none.
 */
export function parseOpenMeteo(body: unknown, expectedPoints: number): PointForecast[] | null {
  const list = Array.isArray(body) ? body : [body];
  if (list.length !== expectedPoints) return null;
  const points: PointForecast[] = [];
  for (const item of list) {
    const parsed = locationSchema.safeParse(item);
    if (!parsed.success) return null;
    const daily = parsed.data.daily;
    const length = daily.time.length;
    if (dailyVariables.some((name) => daily[name].length !== length)) return null;
    const days: DayForecast[] = [];
    for (let index = 0; index < length; index += 1) {
      const code = daily.weather_code[index];
      const high = daily.temperature_2m_max[index];
      const low = daily.temperature_2m_min[index];
      if (code === null || high === null || low === null) continue;
      days.push({
        date: daily.time[index],
        code,
        high: Math.round(high),
        low: Math.round(low),
        precipitationMm: round1(daily.precipitation_sum[index] ?? 0),
        precipitationChance: daily.precipitation_probability_max[index],
        snowfallCm: round1(daily.snowfall_sum[index] ?? 0),
        gustKmh: Math.round(daily.wind_gusts_10m_max[index] ?? 0),
      });
    }
    points.push({ elevation: parsed.data.elevation ?? null, days });
  }
  return points;
}

export type OpenMeteoDependencies = {
  readonly fetch: typeof fetch;
  readonly budget: DailyBudget;
};

/** The weather port on Open-Meteo: all of a city's points in one request. */
export function createOpenMeteoForecast(
  deps: OpenMeteoDependencies = { fetch: globalThis.fetch, budget: sharedOpenMeteoBudget },
): WeatherForecast {
  return async (points, { from, to }) => {
    if (points.length === 0) return { status: "ok", points: [] };
    const query = new URLSearchParams({
      latitude: points.map(({ latitude }) => latitude.toFixed(4)).join(","),
      longitude: points.map(({ longitude }) => longitude.toFixed(4)).join(","),
      daily: dailyVariables.join(","),
      timezone: "Asia/Shanghai",
      start_date: from,
      end_date: to,
    });
    const outcome = await deps.budget.run(openMeteoCalls(points.length, from, to), async (): Promise<ForecastAnswer> => {
      let response: Response;
      try {
        response = await deps.fetch(`${endpoint}?${query}`, { signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network";
        return { status: "failure", reason };
      }
      if (!response.ok) {
        logger.warn({ provider: "Open-Meteo", httpStatus: response.status }, "Open-Meteo answered with an error");
        return { status: "failure", reason: "http_error" };
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { status: "failure", reason: "invalid_response" };
      }
      const parsed = parseOpenMeteo(body, points.length);
      return parsed ? { status: "ok", points: parsed } : { status: "failure", reason: "invalid_response" };
    });
    if (!outcome.ok) return { status: "failure", reason: outcome.reason };
    if (outcome.value.status === "failure") deps.budget.pause();
    return outcome.value;
  };
}
