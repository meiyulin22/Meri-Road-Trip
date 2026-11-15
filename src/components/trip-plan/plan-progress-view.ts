import type { PlaceImage } from "@/domain/location/place-image";
import type { PlanDay, PlanRoute } from "@/domain/plan/plan-draft";
import {
  planStages,
  type PlanActivity,
  type PlanProgressEnvelope,
  type PlanProgressEvent,
  type PlanQuestion,
  type PlanStage,
} from "@/domain/plan/plan-progress";
import type { SpotCard } from "@/domain/plan/spot-card";

export type StageView = {
  readonly stage: PlanStage;
  readonly status: "pending" | "running" | "done";
  /** Server time the stage started, for the running timer. */
  readonly startedAt: number | null;
  readonly ms: number | null;
  readonly summary: Readonly<Record<string, number>>;
  /** What the stage is doing now, one line per city while cities run in parallel. */
  readonly activities: readonly PlanActivity[];
};

export type ResearchedCity = Extract<PlanProgressEvent, { type: "city.researched" }>;
export type ScopeView = Extract<PlanProgressEvent, { type: "scope.ready" }>;
export type MapView = Extract<PlanProgressEvent, { type: "map.checked" }>;
export type RunEnding = Extract<PlanProgressEvent, { type: "run.finished" }>;

/** Everything the page knows about a run, built only from the events it has received. */
export type ProgressView = {
  readonly lastSeq: number;
  readonly startedAt: number | null;
  readonly stages: readonly StageView[];
  readonly scope: ScopeView | null;
  readonly cities: readonly ResearchedCity[];
  readonly map: MapView | null;
  readonly route: PlanRoute | null;
  readonly days: readonly PlanDay[];
  readonly spots: Readonly<Record<string, SpotCard>>;
  readonly photos: Readonly<Record<number, PlaceImage>>;
  readonly finished: RunEnding | null;
  /** The question the run is waiting on, until it is answered. */
  readonly question: PlanQuestion | null;
  /** Server time the run began waiting; the clock stops there. */
  readonly waitingSince: number | null;
  /** Time spent waiting for answers, left out of the run's clock. */
  readonly waitedMs: number;
  readonly answers: readonly { readonly question: string; readonly choice: string | null }[];
};

export const emptyProgress: ProgressView = {
  lastSeq: 0,
  startedAt: null,
  stages: planStages.map((stage) => ({ stage, status: "pending", startedAt: null, ms: null, summary: {}, activities: [] })),
  scope: null,
  cities: [],
  map: null,
  route: null,
  days: [],
  spots: {},
  photos: {},
  finished: null,
  question: null,
  waitingSince: null,
  waitedMs: 0,
  answers: [],
};

/**
 * Research runs cities in parallel, so it keeps a line per city; every other stage does
 * one thing at a time, so its newest activity replaces the last one.
 */
function activityKey(stage: PlanStage, activity: PlanActivity): string {
  return stage === "research" && "city" in activity ? activity.city : stage;
}

function updateStage(view: ProgressView, stage: PlanStage, change: (current: StageView) => StageView): ProgressView {
  return { ...view, stages: view.stages.map((item) => item.stage === stage ? change(item) : item) };
}

/**
 * Applies one event. Events at or before the last one seen are ignored, so a reconnect
 * that replays a little too much changes nothing.
 */
export function applyProgress(view: ProgressView, { seq, at, event }: PlanProgressEnvelope): ProgressView {
  if (seq <= view.lastSeq) return view;
  const next: ProgressView = { ...view, lastSeq: seq, startedAt: view.startedAt ?? at };
  switch (event.type) {
    case "stage.started":
      return updateStage(next, event.stage, (stage) => ({ ...stage, status: "running", startedAt: at }));
    case "stage.activity":
      // Each city keeps its line where it is, so parallel cities do not swap places.
      return updateStage(next, event.stage, (stage) => {
        const key = activityKey(event.stage, event.activity);
        const known = stage.activities.some((item) => activityKey(event.stage, item) === key);
        return {
          ...stage,
          activities: known
            ? stage.activities.map((item) => activityKey(event.stage, item) === key ? event.activity : item)
            : [...stage.activities, event.activity],
        };
      });
    case "stage.finished":
      return updateStage(next, event.stage, (stage) => ({
        ...stage, status: "done", ms: event.ms, summary: event.summary, activities: [],
      }));
    case "scope.ready":
      return { ...next, scope: event };
    case "city.researched":
      return updateStage({ ...next, cities: [...next.cities, event] }, "research", (stage) => ({
        ...stage, activities: stage.activities.filter((item) => activityKey("research", item) !== event.city),
      }));
    case "map.checked":
      return { ...next, map: event };
    case "route.ready":
      return { ...next, route: event.route };
    case "day.ready":
      return {
        ...next,
        days: [...next.days.filter(({ day }) => day !== event.day.day), event.day].sort((left, right) => left.day - right.day),
        spots: { ...next.spots, ...Object.fromEntries(event.spots.map((card) => [card.id, card])) },
      };
    case "day.photo":
      return { ...next, photos: { ...next.photos, [event.day]: event.image } };
    case "run.waiting":
      return { ...next, question: event.question, waitingSince: at };
    case "question.answered":
      return {
        ...next,
        question: null,
        waitingSince: null,
        waitedMs: next.waitedMs + (next.waitingSince === null ? 0 : Math.max(0, at - next.waitingSince)),
        answers: [...next.answers, { question: next.question?.text ?? "", choice: event.choice }],
      };
    case "run.finished":
      return {
        ...next,
        finished: event,
        stages: next.stages.map((stage) => stage.status === "running" ? { ...stage, activities: [] } : stage),
      };
  }
}

/** The days the route promised that have not arrived yet, for placeholder cards. */
export function pendingDays(view: ProgressView): number[] {
  const total = view.route ? view.route.cities.reduce((sum, { days }) => sum + days, 0) : 0;
  const ready = new Set(view.days.map(({ day }) => day));
  return Array.from({ length: total }, (_, index) => index + 1).filter((day) => !ready.has(day));
}
