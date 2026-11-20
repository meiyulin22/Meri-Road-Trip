import type { DayFrame, PlanDay } from "./plan-draft";
import type { SpotCard } from "./spot-card";
import { forecastOn, outdoorRating, poorReasons } from "./weather";

/** How many stops a day can hold: a transfer day one fewer, as reviewProposal counts it. */
const dayLimit = (frame: DayFrame, maxStops: number) => (frame.arrivingFrom === null ? maxStops : Math.max(1, maxStops - 1));

/** Whether a spot's own forecast on a date is poor for outdoors; false without a forecast. */
export function poorAt(card: SpotCard, date: string | null): boolean {
  const day = forecastOn(card.weather, date);
  return day !== null && outdoorRating(day) === "poor";
}

/** The days of the city, by number, on which this spot's own forecast is poor (1.2117). */
export function poorDaysOf(card: SpotCard, frames: readonly DayFrame[]): number[] {
  return frames.filter(({ date }) => poorAt(card, date)).map(({ day }) => day);
}

export type WeatherIssue = {
  readonly day: number;
  readonly spotId: string;
  /** A day of the same city where the spot's weather is not poor and there is room. */
  readonly betterDay: number;
  /** A stop on that day which is fine on this one, to swap with; null when there is none. */
  readonly swapWith: string | null;
};

/**
 * Outdoor stops on a day when their own forecast is poor while another day in the same city is
 * not poor for them and has room, or holds a stop that would be fine on the poor day to swap with
 * (1.2117). The Plan Agent is sent back once with these; what
 * remains is kept and the page shows the forecast beside the stop. A spot the research model did
 * not judge outdoors, or without a forecast, is never an issue.
 */
export function weatherIssues(
  days: readonly PlanDay[],
  cards: ReadonlyMap<string, SpotCard>,
  maxStops: number,
): WeatherIssue[] {
  const issues: WeatherIssue[] = [];
  for (const day of days) {
    for (const stop of day.stops) {
      const card = cards.get(stop.spotId);
      if (!card || card.outdoor !== true || !poorAt(card, day.date)) continue;
      const fineThere = (other: PlanDay) => forecastOn(card.weather, other.date) !== null && !poorAt(card, other.date);
      // A stop on the other day that would be fine on this one: an indoor spot, or one whose own forecast here is not poor.
      const swappable = (other: PlanDay) => other.stops.find(({ spotId }) => {
        const there = cards.get(spotId);
        return there !== undefined && (there.outdoor !== true || !poorAt(there, day.date));
      })?.spotId ?? null;
      const sameCity = days.filter((other) => other.day !== day.day && other.city === day.city && fineThere(other));
      const better = sameCity.find((other) => other.stops.length < dayLimit(other, maxStops))
        ?? sameCity.find((other) => swappable(other) !== null);
      if (better) issues.push({ day: day.day, spotId: stop.spotId, betterDay: better.day, swapWith: swappable(better) });
    }
  }
  return issues;
}

/** An issue as the Plan Agent reads it on its second attempt. */
export function weatherIssueText(issue: WeatherIssue, card: SpotCard, date: string | null, swapName: string | null = null): string {
  const day = forecastOn(card.weather, date);
  const why = day ? poorReasons(day).join(", ") : "poor weather";
  const fix = swapName
    ? `Swap it with ${swapName} from day ${issue.betterDay}, which is fine on day ${issue.day}, or move it to day ${issue.betterDay}.`
    : `Move it to day ${issue.betterDay}, or choose an indoor candidate for day ${issue.day}.`;
  return `Day ${issue.day}: ${card.name} is outdoors and its forecast that day is poor (${why}); `
    + `day ${issue.betterDay} has better weather there. ${fix}`;
}
