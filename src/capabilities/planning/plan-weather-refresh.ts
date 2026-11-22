import { dressDays } from "@/agents/planner/day-outfits";
import { addCityWeather } from "@/agents/planner/spot-weather";
import type { PlanModelDependencies } from "@/agents/planner/plan-route";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { CityResearch, SpotCard } from "@/domain/plan/spot-card";
import type { GeoPoint } from "@/domain/plan/weather";
import type { TripState } from "@/domain/trip-state/trip-state";
import { logger } from "@/platform/observability/logger";
import type { PlanRunRepository } from "@/platform/persistence/plan-run-repository";
import type { WeatherForecast } from "@/platform/weather/weather-forecast";

import { canonicalJson, handoffKey } from "./plan-run-service";

export type WeatherRefreshDependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly repository: Pick<PlanRunRepository, "findLatestRun" | "findLatestVersion" | "fillPlanFacts">;
  readonly forecast: WeatherForecast;
  /** A city's centre for spots the map never located; only what is already remembered, no new map lookup. */
  readonly cityCentre: (city: string) => Promise<GeoPoint | null>;
  readonly planModel: PlanModelDependencies;
  readonly now: () => Date;
};

export type WeatherRefreshOutcome =
  | { readonly status: "refreshed"; readonly plan: ReadyPlan }
  | { readonly status: "no_plan" }
  | { readonly status: "plan_stale" }
  /** The plan has no dates, so there is no forecast to ask for. */
  | { readonly status: "no_dates" }
  /** Asked again, and still no forecast for any city: nothing was saved. */
  | { readonly status: "no_weather" };

const beijingDate = (now: Date) => new Date(now.getTime() + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);

/**
 * 「重新查天气」 (2026-11-22): asks the weather again for the newest plan's spots and dresses its days,
 * when a plan came back without weather. Not a run and not counted against the day's runs: the route
 * and the days stay as they are; only each spot's forecast and the outfits change, saved into the
 * same version like the other plan-page fill-ins. One Kimi call for the outfit additions (~¥0.01).
 */
export async function refreshPlanWeather(
  tripId: string,
  ownerGuestId: string,
  deps: WeatherRefreshDependencies,
): Promise<WeatherRefreshOutcome> {
  const [version, run] = await Promise.all([deps.repository.findLatestVersion(tripId), deps.repository.findLatestRun(tripId)]);
  if (!version || !run || run.id !== version.runId || run.status !== "succeeded") return { status: "no_plan" };
  // Loading the journey also checks the trip is this visitor's.
  const { tripState } = await deps.loadJourney(tripId, ownerGuestId);
  if (canonicalJson(tripState) !== canonicalJson(version.tripState)) return { status: "plan_stale" };
  const plan = version.plan;
  const dates = plan.draft.days.map(({ date }) => date);
  if (dates.every((date) => date === null)) return { status: "no_dates" };

  // The saved cards, city by city, as research left them; each city's weather asked once.
  const byCity = new Map<string, SpotCard[]>();
  for (const card of plan.spots) byCity.set(card.city, [...(byCity.get(card.city) ?? []), card]);
  const today = beijingDate(deps.now());
  const refreshed = new Map<string, SpotCard>();
  for (const [city, spots] of byCity) {
    const research: CityResearch = { province: spots[0].province, city, status: "ready", searchCalls: 0, spots };
    const answer = await addCityWeather(research, dates, today, { forecast: deps.forecast, cityCentre: deps.cityCentre });
    for (const card of answer.city.spots) refreshed.set(card.id, card);
  }
  const spots = plan.spots.map((card) => refreshed.get(card.id) ?? card);
  if (!spots.some(({ weather }) => weather?.status === "forecast")) {
    logger.warn({ tripId, versionId: version.id }, "Weather refresh found no forecast; the plan is unchanged");
    return { status: "no_weather" };
  }

  const dressed = await dressDays(run.handoff, plan.draft.days, new Map(spots.map((card) => [card.id, card])), deps.planModel);
  const next: ReadyPlan = {
    ...plan,
    spots,
    draft: { ...plan.draft, ...(dressed.outfits.length > 0 ? { outfits: [...dressed.outfits] } : {}) },
  };
  const saved = await deps.repository.fillPlanFacts({
    versionId: version.id, runId: run.id, tripState: version.tripState, plan: next, handoff: run.handoff, handoffKey: handoffKey(run.handoff),
  });
  logger.info({ tripId, versionId: version.id, outfits: dressed.outfits.length, status: dressed.status }, "Plan weather refreshed");
  return saved ? { status: "refreshed", plan: next } : { status: "no_plan" };
}

/** The HTTP answer for the plan page: the plan with its forecasts and outfits, or why not. */
export async function handleWeatherRefreshPost(
  tripId: string,
  ownerGuestId: string | null,
  deps: WeatherRefreshDependencies,
  onError: (error: unknown) => boolean,
): Promise<Response> {
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  const failure = (status: number, code: string, message: string) => json({ error: { code, message } }, status);
  if (!ownerGuestId) return failure(404, "journey_not_found", "Journey not found.");
  try {
    const outcome = await refreshPlanWeather(tripId, ownerGuestId, deps);
    switch (outcome.status) {
      case "refreshed": return json({ plan: outcome.plan });
      case "no_plan": return failure(409, "no_plan", "There is no finished plan to change.");
      case "plan_stale": return failure(409, "plan_stale", "The journey changed after this plan was made.");
      case "no_dates": return failure(409, "no_dates", "The plan has no travel dates.");
      case "no_weather": return failure(503, "no_weather", "The weather could not be fetched. Try again later.");
    }
  } catch (error) {
    return onError(error) ? failure(404, "journey_not_found", "Journey not found.") : failure(500, "internal_error", "Failed to refresh the weather.");
  }
}
