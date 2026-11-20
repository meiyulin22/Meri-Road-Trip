import type { DayForecast, GeoPoint } from "@/domain/plan/weather";

/** One point's forecast: the elevation it was corrected to and its days, in order. */
export type PointForecast = { readonly elevation: number | null; readonly days: readonly DayForecast[] };

export type WeatherFailure = "daily_limit" | "paused" | "http_error" | "timeout" | "network" | "invalid_response";

export type ForecastAnswer =
  | { readonly status: "ok"; readonly points: readonly PointForecast[] }
  | { readonly status: "failure"; readonly reason: WeatherFailure };

/**
 * Meri's weather port (1.2117): daily forecasts for some points over a range of dates, one answer
 * per point in the order asked. Open-Meteo answers it today; QWeather could replace it behind the
 * same shape. The plan workflow calls it from code, and Jev may later call it as a tool. It never
 * throws and never retries.
 */
export type WeatherForecast = (
  points: readonly GeoPoint[],
  range: { readonly from: string; readonly to: string },
) => Promise<ForecastAnswer>;
