/**
 * Weather for a plan (1.2117): what a day's forecast says, whether it suits an outdoor visit, and
 * which points a city's spots are forecast at. Pure: the forecast itself comes from
 * src/platform/weather, and nothing here knows which provider answered.
 */

/** One day's forecast at one point, in the place's own time zone. */
export type DayForecast = {
  readonly date: string;
  /** WMO weather code, as the forecast gives it. */
  readonly code: number;
  readonly high: number;
  readonly low: number;
  readonly precipitationMm: number;
  /** Highest chance of precipitation in the day, 0–100; null when the forecast does not give it. */
  readonly precipitationChance: number | null;
  readonly snowfallCm: number;
  /** Strongest gust of the day, km/h. */
  readonly gustKmh: number;
};

export const weatherSkies = ["clear", "cloudy", "overcast", "fog", "drizzle", "rain", "snow", "thunderstorm"] as const;
export type WeatherSky = (typeof weatherSkies)[number];

/** How a day suits an outdoor visit: poor moves an outdoor stop when it can; fair is only shown. */
export type OutdoorRating = "good" | "fair" | "poor";

/**
 * A spot's weather on the trip's dates (1.2117). A forecast covers the dates inside the
 * forecast's reach; `beyond` lists the trip's dates past it, shown as "look again before you go".
 * `source` says whether the spot's own point was used or, for a spot the map did not locate, the
 * city's centre. Absent on a card when the trip has no dates, or on plans made before 1.2117.
 */
export type SpotWeather =
  | {
    readonly status: "forecast";
    readonly source: "spot" | "city";
    /** Metres; the forecast is corrected to it, so a mountain top reads colder than the old town. */
    readonly elevation: number | null;
    readonly days: readonly DayForecast[];
    readonly beyond: readonly string[];
  }
  | { readonly status: "beyond_range" }
  | { readonly status: "unavailable" };

/** Agreed thresholds (2026-11-20). 25 mm a day is 大雨; 62 km/h is the bottom of Beaufort 8, when cable cars often stop. */
export const weatherThresholds = {
  heavyRainMm: 25,
  heavySnowCm: 5,
  galeGustKmh: 62,
  wetMm: 5,
  wetChance: 60,
} as const;

/** The forecast reaches today and fifteen days after it, sixteen days in all. */
export const forecastDays = 16;
/** Spots closer than this share one forecast point; a mountain and the town below it never do. */
export const sharedPointKm = 2;

const thunderstormCodes = new Set([95, 96, 99]);
// Heavy rain (65), heavy freezing rain (67), heavy snow (75), violent showers (82), heavy snow showers (86).
const heavyCodes = new Set([65, 67, 75, 82, 86]);

/** The sky a WMO code describes, in the few kinds the page draws. */
export function skyOf(code: number): WeatherSky {
  if (code <= 1) return "clear";
  if (code === 2) return "cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (thunderstormCodes.has(code)) return "thunderstorm";
  return "overcast";
}

/** Whether a day suits an outdoor visit, by the agreed thresholds. */
export function outdoorRating(day: DayForecast): OutdoorRating {
  if (
    day.precipitationMm >= weatherThresholds.heavyRainMm
    || thunderstormCodes.has(day.code)
    || heavyCodes.has(day.code)
    || day.snowfallCm >= weatherThresholds.heavySnowCm
    || day.gustKmh >= weatherThresholds.galeGustKmh
  ) return "poor";
  if (day.precipitationMm >= weatherThresholds.wetMm || (day.precipitationChance ?? 0) >= weatherThresholds.wetChance) return "fair";
  return "good";
}

/** Why a poor day is poor, most serious first, for the page and the planner. */
export function poorReasons(day: DayForecast): ("thunderstorm" | "heavy_rain" | "heavy_snow" | "gale")[] {
  const reasons: ("thunderstorm" | "heavy_rain" | "heavy_snow" | "gale")[] = [];
  if (thunderstormCodes.has(day.code)) reasons.push("thunderstorm");
  if (day.precipitationMm >= weatherThresholds.heavyRainMm || day.code === 65 || day.code === 82 || day.code === 67) reasons.push("heavy_rain");
  if (day.snowfallCm >= weatherThresholds.heavySnowCm || day.code === 75 || day.code === 86) reasons.push("heavy_snow");
  if (day.gustKmh >= weatherThresholds.galeGustKmh) reasons.push("gale");
  return reasons;
}

const dayMs = 24 * 60 * 60 * 1000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The trip's dates split by the forecast's reach from `today` (a Beijing date): the dates to ask
 * for, from first to last, and the dates past the reach. A date already gone is neither.
 */
export function forecastWindow(dates: readonly string[], today: string): { inside: string[]; beyond: string[] } {
  const start = Date.parse(today + "T00:00:00Z");
  const last = isoDay(start + (forecastDays - 1) * dayMs);
  const unique = [...new Set(dates)].sort();
  return {
    inside: unique.filter((date) => date >= today && date <= last),
    beyond: unique.filter((date) => date > last),
  };
}

export type GeoPoint = { readonly longitude: number; readonly latitude: number };

/** Great-circle distance in km. */
export function kmBetween(from: GeoPoint, to: GeoPoint): number {
  const radians = Math.PI / 180;
  const dLat = (to.latitude - from.latitude) * radians;
  const dLon = (to.longitude - from.longitude) * radians;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371 * Math.asin(Math.sqrt(a));
}

/**
 * Which points a city's spots are forecast at: each located spot joins the first point within
 * `sharedPointKm` of it, or starts its own. A spot the map did not locate shares the point most
 * located spots share, which is the town where the sights are; only when nothing in the city was
 * located does it use the city's centre. Measured 2026-11-20: Tianditu's centre for 大理白族自治州
 * sits in the mountains at 3,304 m, so 大理 read 0–9° while the town is near 2,000 m. Spots with
 * neither get no point and no weather.
 */
export function weatherPoints(
  spots: readonly { readonly id: string; readonly point: GeoPoint | null }[],
  cityCentre: GeoPoint | null,
): { points: GeoPoint[]; assigned: Map<string, { readonly index: number; readonly source: "spot" | "city" }> } {
  const points: GeoPoint[] = [];
  const assigned = new Map<string, { index: number; source: "spot" | "city" }>();
  const located = spots.filter((spot): spot is { id: string; point: GeoPoint } => spot.point !== null);
  for (const spot of located) {
    let index = points.findIndex((point) => kmBetween(point, spot.point) < sharedPointKm);
    if (index === -1) {
      points.push(spot.point);
      index = points.length - 1;
    }
    assigned.set(spot.id, { index, source: "spot" });
  }
  const unlocated = spots.filter(({ point }) => point === null);
  if (unlocated.length === 0) return { points, assigned };
  if (points.length > 0) {
    const members = points.map((_, index) => [...assigned.values()].filter((at) => at.index === index).length);
    const town = members.indexOf(Math.max(...members));
    for (const spot of unlocated) assigned.set(spot.id, { index: town, source: "city" });
    return { points, assigned };
  }
  if (cityCentre) {
    points.push(cityCentre);
    for (const spot of unlocated) assigned.set(spot.id, { index: points.length - 1, source: "city" });
  }
  return { points, assigned };
}

/** A spot's forecast on one date, or null when it has none for that date. */
export function forecastOn(weather: SpotWeather | undefined, date: string | null): DayForecast | null {
  if (!weather || weather.status !== "forecast" || date === null) return null;
  return weather.days.find((day) => day.date === date) ?? null;
}

/**
 * A city's own weather, for routing and the day card's header: the forecast most of its spots
 * share, which is the town where most sights are rather than one mountain top. Null when none of
 * its spots has a forecast.
 */
export function cityForecast(
  weathers: readonly (SpotWeather | undefined)[],
): Extract<SpotWeather, { status: "forecast" }> | null {
  const counts = new Map<string, { weather: Extract<SpotWeather, { status: "forecast" }>; count: number }>();
  for (const weather of weathers) {
    if (weather?.status !== "forecast") continue;
    const key = JSON.stringify([weather.elevation, weather.days]);
    const known = counts.get(key);
    counts.set(key, { weather, count: (known?.count ?? 0) + 1 });
  }
  let best: { weather: Extract<SpotWeather, { status: "forecast" }>; count: number } | null = null;
  for (const entry of counts.values()) {
    // Ties go to a spot's own point over the city centre's.
    if (!best || entry.count > best.count || (entry.count === best.count && best.weather.source === "city" && entry.weather.source === "spot")) best = entry;
  }
  return best?.weather ?? null;
}

/** A day's forecast as the planner reads it: the sky, how it suits outdoors, rain and temperatures. */
export function forecastSummary(day: DayForecast) {
  return { date: day.date, sky: skyOf(day.code), outdoor: outdoorRating(day), rainMm: day.precipitationMm, low: day.low, high: day.high };
}
