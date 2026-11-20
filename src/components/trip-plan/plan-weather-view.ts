import type { PlanDay } from "@/domain/plan/plan-draft";
import type { SpotCard } from "@/domain/plan/spot-card";
import {
  cityForecast, type DayForecast, forecastOn, type OutdoorRating, outdoorRating, poorReasons, skyOf, type WeatherSky,
} from "@/domain/plan/weather";

/** One forecast day as the page draws it. */
export type WeatherLine = {
  readonly sky: WeatherSky;
  readonly low: number;
  readonly high: number;
  readonly rainMm: number;
  readonly outdoor: OutdoorRating;
  readonly reasons: readonly ReturnType<typeof poorReasons>[number][];
};

/** A day's weather on its card (1.2117): a forecast, a date past the forecast's reach, or nothing. */
export type DayWeatherView =
  | { readonly kind: "forecast"; readonly line: WeatherLine }
  | { readonly kind: "beyond" }
  | null;

export function weatherLine(day: DayForecast): WeatherLine {
  return { sky: skyOf(day.code), low: day.low, high: day.high, rainMm: day.precipitationMm, outdoor: outdoorRating(day), reasons: poorReasons(day) };
}

/** The day's city weather from the cards of that city the plan kept, the forecast most of them share. */
export function dayWeather(day: PlanDay, cards: readonly SpotCard[]): DayWeatherView {
  if (day.date === null) return null;
  const cityCards = cards.filter((card) => card.city === day.city);
  const forecast = cityForecast(cityCards.map(({ weather }) => weather));
  const onDay = forecast ? forecastOn(forecast, day.date) : null;
  if (onDay) return { kind: "forecast", line: weatherLine(onDay) };
  const beyond = cityCards.some(({ weather }) => weather?.status === "beyond_range"
    || (weather?.status === "forecast" && weather.beyond.includes(day.date as string)));
  return beyond ? { kind: "beyond" } : null;
}

/** Elevations further apart than this read as different weather, worth a line of their own. */
const differentElevationM = 300;

/**
 * An outdoor stop's own forecast, shown under it when it matters (1.2117): its day is poor for
 * outdoors, or it sits well above or below the town whose weather heads the day (玉龙雪山 above
 * 丽江古城). Null otherwise, and for anything the research model did not judge outdoors.
 */
export function stopWeather(card: SpotCard, date: string | null, cityCards: readonly SpotCard[]): WeatherLine | null {
  if (card.outdoor !== true) return null;
  const own = forecastOn(card.weather, date);
  if (!own || card.weather?.status !== "forecast") return null;
  const line = weatherLine(own);
  if (line.outdoor === "poor") return line;
  const city = cityForecast(cityCards.map(({ weather }) => weather));
  const apart = card.weather.elevation !== null && city?.elevation !== null && city !== null
    && Math.abs(card.weather.elevation - (city.elevation ?? 0)) >= differentElevationM;
  return apart ? line : null;
}

/** Whether any card carries a forecast, so the page owes Open-Meteo its credit. */
export function hasForecast(cards: readonly SpotCard[]): boolean {
  return cards.some(({ weather }) => weather?.status === "forecast" || weather?.status === "beyond_range");
}
