import { join } from "node:path";

import { z } from "zod";

import type { DayForecast, GeoPoint } from "@/domain/plan/weather";
import { createDailyBudget, type DailyBudget } from "@/platform/http/daily-budget";
import { logger } from "@/platform/observability/logger";
import { providerLimits } from "@/platform/provider-limits";

import { causeCode } from "./open-meteo";
import type { ForecastAnswer, PointForecast, WeatherForecast } from "./weather-forecast";

type Failure = Extract<ForecastAnswer, { status: "failure" }>;

/**
 * MET Norway's Locationforecast (2026-11-21): the stand-in when Open-Meteo cannot be reached. Free,
 * no key and no account, open data under CC BY 4.0 that may be used commercially; its terms ask for
 * a User-Agent naming the app and for credit wherever the data is shown. Measured from this Mac on
 * 2026-11-21 over three minutes: 30 of 30 answered, while Open-Meteo lost 4 of 30 connections.
 *
 * Over China it lacks three things Open-Meteo gives, so Meri works them out and marks the day
 * `estimated`: gusts from the mean wind, snowfall from the precipitation on snowy or freezing hours,
 * and, instead of a chance of rain, the hours with rain (`wetHours`). Its forecast reaches about ten
 * days, not sixteen; later dates simply come back without a day.
 */
const endpoint = "https://api.met.no/weatherapi/locationforecast/2.0/complete";
const timeoutMs = 30_000;
export const metNorwayLimits = { intervalMs: 200, dailyUnits: providerLimits.metNorwayCallsPerDay, pauseMs: 10 * 60 * 1_000 } as const;

export const sharedMetNorwayBudget = createDailyBudget(metNorwayLimits, {
  file: join(process.cwd(), ".cache", "met-norway-calls.json"),
  label: { provider: "MET Norway", units: (count) => `${count} calls` },
});

/** MET Norway refuses requests without an identifying User-Agent; no personal contact is sent. */
export function metNorwayUserAgent(env: NodeJS.ProcessEnv = process.env): string {
  return env.MET_NORWAY_USER_AGENT?.trim() || "Meri/1.2117 personal non-commercial travel planner";
}

/** Beijing time: the trip's dates are Chinese calendar days. */
const beijingOffsetMs = 8 * 60 * 60 * 1_000;
/** Over open land a gust runs about 1.4–1.6 times the mean wind (WMO guidance); 1.5 sits between. */
export const gustFactor = 1.5;
/** A millimetre of water falls as about a centimetre of snow (the usual 10:1). */
const snowCmPerMm = 1;
/** An hour wetter than this counts as an hour with rain or snow. */
const wetHourMm = 0.1;
/**
 * A day needs this many hours of steps to stand: the answer starts at the current hour and ends on
 * one reading, so its first and last days are slivers whose high and low say little.
 */
const minCoveredHours = 12;

const details = z.record(z.string(), z.number()).optional();
const period = z.object({ summary: z.object({ symbol_code: z.string() }), details }).optional();
const answerSchema = z.object({
  geometry: z.object({ coordinates: z.array(z.number()).min(2) }),
  properties: z.object({
    timeseries: z.array(z.object({
      time: z.string(),
      data: z.object({
        instant: z.object({ details: z.record(z.string(), z.number()) }),
        next_1_hours: period,
        next_6_hours: period,
      }),
    })),
  }),
});

// MET symbols mapped to the WMO codes the rest of Meri reads; "_day", "_night" and "_polartwilight" dropped.
const symbolCodes: Record<string, number> = {
  clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
  lightrain: 61, rain: 63, heavyrain: 65, lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
  lightsleet: 61, sleet: 63, heavysleet: 65, lightsleetshowers: 80, sleetshowers: 81, heavysleetshowers: 82,
  lightsnow: 71, snow: 73, heavysnow: 75, lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86,
};

/** The WMO code for a MET symbol: anything with thunder is a thunderstorm; an unknown symbol, overcast. */
export function codeOfSymbol(symbol: string): number {
  const base = symbol.replace(/_(day|night|polartwilight)$/u, "");
  if (base.includes("thunder")) return 95;
  return symbolCodes[base] ?? 3;
}

/** How bad a code is, to keep the worst of a day as its code, as Open-Meteo's daily code does. */
function severity(code: number): number {
  if (code >= 95) return 8;
  if ([65, 67, 75, 82, 86].includes(code)) return 7;
  if ((code >= 71 && code <= 77) || code === 85) return 6;
  if ((code >= 61 && code <= 64) || code === 80 || code === 81) return 5;
  if (code >= 51 && code <= 57) return 4;
  if (code === 45 || code === 48) return 3;
  return code === 3 ? 2 : code === 2 ? 1 : 0;
}

type DayTotals = {
  code: number; high: number; low: number; mm: number; snowCm: number; gustKmh: number;
  wetHours: number; coveredHours: number;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * One MET Norway answer read as Meri's daily forecast between `from` and `to` (Beijing dates), or
 * null when its shape is not what was asked for. Each step covers the time until the next one: an
 * hour in the first two or three days, six hours after. A step's rain, symbol and wet hours count on
 * the Beijing day it starts; temperatures and wind count on the day of the moment they are for.
 */
export function parseMetNorway(body: unknown, from: string, to: string): PointForecast | null {
  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) return null;
  const steps = parsed.data.properties.timeseries;
  const days = new Map<string, DayTotals>();
  const dayOf = (ms: number) => new Date(ms + beijingOffsetMs).toISOString().slice(0, 10);
  const totals = (date: string) => {
    let day = days.get(date);
    if (!day) {
      day = { code: 0, high: -Infinity, low: Infinity, mm: 0, snowCm: 0, gustKmh: 0, wetHours: 0, coveredHours: 0 };
      days.set(date, day);
    }
    return day;
  };

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const at = Date.parse(step.time);
    if (Number.isNaN(at)) return null;
    const instant = step.data.instant.details;
    const day = totals(dayOf(at));
    const temp = instant.air_temperature;
    if (temp !== undefined) {
      day.high = Math.max(day.high, temp);
      day.low = Math.min(day.low, temp);
    }
    const gust = instant.wind_speed_of_gust;
    const wind = instant.wind_speed;
    // Gusts are forecast near Norway only; elsewhere the mean wind stands in, times the gust factor.
    if (gust !== undefined) day.gustKmh = Math.max(day.gustKmh, gust * 3.6);
    else if (wind !== undefined) day.gustKmh = Math.max(day.gustKmh, wind * gustFactor * 3.6);

    // The period this step speaks for: up to the next step, an hour or six.
    const next = steps[index + 1] ? Date.parse(steps[index + 1].time) : null;
    const hours = next === null ? (step.data.next_1_hours ? 1 : 6) : Math.round((next - at) / 3_600_000);
    const block = hours <= 1 ? step.data.next_1_hours ?? step.data.next_6_hours : step.data.next_6_hours ?? step.data.next_1_hours;
    if (!block) continue;
    day.coveredHours += hours;
    const blockHours = block === step.data.next_1_hours ? 1 : 6;
    const share = Math.min(1, hours / blockHours);
    const mm = (block.details?.precipitation_amount ?? 0) * share;
    const min = block.details?.air_temperature_min;
    const max = block.details?.air_temperature_max;
    if (min !== undefined) day.low = Math.min(day.low, min);
    if (max !== undefined) day.high = Math.max(day.high, max);
    const symbol = block.summary.symbol_code;
    const code = codeOfSymbol(symbol);
    if (severity(code) > severity(day.code)) day.code = code;
    day.mm += mm;
    if (mm >= wetHourMm) day.wetHours += Math.min(hours, Math.max(1, Math.round(mm / wetHourMm)));
    // Snow: a snowy symbol, half of it for sleet, or any precipitation at or below freezing.
    const snowy = symbol.includes("snow");
    const sleety = symbol.includes("sleet");
    const freezing = (min ?? temp ?? 99) <= 0;
    if (snowy || freezing) day.snowCm += mm * snowCmPerMm;
    else if (sleety) day.snowCm += mm * snowCmPerMm * 0.5;
  }

  const forecastDays: DayForecast[] = [];
  for (const [date, day] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (date < from || date > to || day.coveredHours < minCoveredHours || !Number.isFinite(day.high) || !Number.isFinite(day.low)) continue;
    forecastDays.push({
      date,
      code: day.code,
      high: Math.round(day.high),
      low: Math.round(day.low),
      precipitationMm: round1(day.mm),
      precipitationChance: null,
      snowfallCm: round1(day.snowCm),
      gustKmh: Math.round(day.gustKmh),
      wetHours: Math.min(24, day.wetHours),
      estimated: true,
    });
  }
  const elevation = parsed.data.geometry.coordinates[2];
  return { elevation: elevation ?? null, days: forecastDays };
}

export type MetNorwayDependencies = {
  readonly fetch: typeof fetch;
  readonly budget: DailyBudget;
  readonly userAgent?: string;
};

/**
 * The weather port on MET Norway: one request a point, one after another, no retry. Any point
 * failing fails the city, as one Open-Meteo request would. Coordinates are cut to four decimals,
 * as its terms require; no altitude is sent, so it corrects to its own terrain height, which it returns.
 */
export function createMetNorwayForecast(
  deps: MetNorwayDependencies = { fetch: globalThis.fetch, budget: sharedMetNorwayBudget },
): WeatherForecast {
  const userAgent = deps.userAgent ?? metNorwayUserAgent();
  async function one(point: GeoPoint, from: string, to: string): Promise<PointForecast | Failure> {
    const query = new URLSearchParams({ lat: point.latitude.toFixed(4), lon: point.longitude.toFixed(4) });
    const outcome = await deps.budget.run(1, async (): Promise<PointForecast | Failure> => {
      let response: Response;
      try {
        response = await deps.fetch(`${endpoint}?${query}`, {
          headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network";
        logger.warn({ provider: "MET Norway", reason, cause: causeCode(error) }, "MET Norway request lost");
        return { status: "failure", reason };
      }
      if (!response.ok) {
        logger.warn({ provider: "MET Norway", httpStatus: response.status }, "MET Norway answered with an error");
        return { status: "failure", reason: "http_error" };
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { status: "failure", reason: "invalid_response" };
      }
      return parseMetNorway(body, from, to) ?? { status: "failure", reason: "invalid_response" };
    });
    if (!outcome.ok) return { status: "failure", reason: outcome.reason };
    const value = outcome.value;
    // Refused or garbled by MET itself (403 for a missing User-Agent, 429 when throttled): stop for a while.
    if ("status" in value && (value.reason === "http_error" || value.reason === "invalid_response")) {
      deps.budget.pause();
    }
    return value;
  }

  return async (points, { from, to }) => {
    const forecasts: PointForecast[] = [];
    for (const point of points) {
      const answer = await one(point, from, to);
      if ("status" in answer) return answer;
      forecasts.push(answer);
    }
    return { status: "ok", provider: "met-norway", points: forecasts };
  };
}
