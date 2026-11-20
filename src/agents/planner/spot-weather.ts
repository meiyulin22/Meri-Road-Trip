import type { CityResearch, SpotCard } from "@/domain/plan/spot-card";
import { forecastWindow, type GeoPoint, type SpotWeather, weatherPoints } from "@/domain/plan/weather";
import { logger } from "@/platform/observability/logger";
import type { CityPoint, CityPointAnswer } from "@/platform/tianditu/tianditu-city-point";
import type { WeatherForecast } from "@/platform/weather/weather-forecast";

import type { MapCheckStop } from "./map-check";

export type SpotWeatherDependencies = {
  readonly forecast: WeatherForecast;
  /** The city's centre, for spots the map did not locate; null when it cannot be had. */
  readonly cityCentre: (city: string) => Promise<GeoPoint | null>;
};

/** Hears the one weather request a city makes, for the plan page's live line. */
export type SpotWeatherProgress = (progress: { city: string; points: number }) => void;

/**
 * A city's centre from memory, or one Tianditu search under the run's stop (1.2117): the same
 * cache the transfers use, so the search is not wasted, and the same rule as every Tianditu
 * lookup in a run, the first failure stops the rest with no retry.
 */
export function cityCentreLookup(
  deps: {
    readonly cityPoint: (name: string) => Promise<CityPointAnswer>;
    readonly cityMemory: { get(name: string): CityPoint | null; set(name: string, city: CityPoint): void };
  },
  stop: MapCheckStop,
): (city: string) => Promise<GeoPoint | null> {
  return async (city) => {
    const remembered = deps.cityMemory.get(city);
    if (remembered) return remembered.point;
    if (stop.stopped) return null;
    const answer = await deps.cityPoint(city);
    if (answer.status === "failure") {
      stop.stopped = true;
      logger.warn({ city, reason: answer.reason }, "Tianditu stopped at a failed city centre search for weather");
      return null;
    }
    if (answer.status === "not_found") return null;
    deps.cityMemory.set(city, answer.city);
    return answer.city.point;
  };
}

const pointOf = (card: SpotCard): GeoPoint | null =>
  card.mapCheck.status === "located" ? card.mapCheck.point : null;

/**
 * The weather at each of a city's spots on the trip's dates (1.2117), a fixed code step after the
 * map check: located spots are forecast at their own point (altitude matters: 玉龙雪山 is colder
 * than 丽江古城 below it), spots within 2 km share one point, and unlocated spots use the city's
 * centre. One request for the whole city. Dates past the forecast's reach are marked, a trip
 * without dates gets no weather, and a failed request leaves the city's weather unavailable while
 * the plan goes on.
 */
export async function addCityWeather(
  city: CityResearch,
  dates: readonly (string | null)[],
  today: string,
  deps: SpotWeatherDependencies,
  onProgress: SpotWeatherProgress = () => {},
): Promise<{ city: CityResearch; calls: number }> {
  const known = dates.filter((date): date is string => date !== null);
  if (city.status === "deferred" || city.spots.length === 0 || known.length === 0) return { city, calls: 0 };
  const { inside, beyond } = forecastWindow(known, today);
  const withWeather = (weatherOf: (card: SpotCard) => SpotWeather) =>
    ({ ...city, spots: city.spots.map((card) => ({ ...card, weather: weatherOf(card) })) });
  if (inside.length === 0) {
    return { city: withWeather(() => (beyond.length > 0 ? { status: "beyond_range" } : { status: "unavailable" })), calls: 0 };
  }

  const needsCentre = city.spots.some((card) => pointOf(card) === null);
  const centre = needsCentre ? await deps.cityCentre(city.city) : null;
  const { points, assigned } = weatherPoints(city.spots.map((card) => ({ id: card.id, point: pointOf(card) })), centre);
  if (points.length === 0) return { city: withWeather(() => ({ status: "unavailable" })), calls: 0 };

  onProgress({ city: city.city, points: points.length });
  const answer = await deps.forecast(points, { from: inside[0], to: inside[inside.length - 1] });
  if (answer.status === "failure") {
    logger.warn({ city: city.city, reason: answer.reason }, "Weather unavailable for a city; the plan goes on without it");
    return { city: withWeather(() => ({ status: "unavailable" })), calls: answer.reason === "daily_limit" || answer.reason === "paused" ? 0 : points.length };
  }
  const tripDates = new Set(inside);
  return {
    city: withWeather((card) => {
      const at = assigned.get(card.id);
      const forecast = at ? answer.points[at.index] : undefined;
      if (!at || !forecast) return { status: "unavailable" };
      return {
        status: "forecast", source: at.source, elevation: forecast.elevation,
        days: forecast.days.filter(({ date }) => tripDates.has(date)), beyond,
      };
    }),
    calls: points.length,
  };
}
