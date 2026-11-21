import { logger } from "@/platform/observability/logger";

import type { WeatherForecast } from "./weather-forecast";

/**
 * Asks `primary`, and `fallback` only when the primary gives no forecast (2026-11-21: Open-Meteo
 * lost about one connection in eight from this Mac, and one lost city left every day without an
 * outfit). Every failure counts, a pause or the day's cap included, since the fallback has its own.
 * When both fail, the primary's reason is kept, as it is the provider normally asked.
 */
export function withFallbackForecast(
  primary: WeatherForecast,
  fallback: WeatherForecast,
  names: { readonly primary: string; readonly fallback: string },
): WeatherForecast {
  return async (points, range) => {
    const first = await primary(points, range);
    if (first.status === "ok") return first;
    logger.warn({ provider: names.primary, reason: first.reason, fallback: names.fallback, points: points.length },
      `${names.primary} gave no forecast; asking ${names.fallback}`);
    const second = await fallback(points, range);
    if (second.status === "ok") return second;
    logger.warn({ provider: names.fallback, reason: second.reason }, `${names.fallback} gave no forecast either`);
    return first;
  };
}
