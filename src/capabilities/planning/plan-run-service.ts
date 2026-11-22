import { createHash, randomUUID } from "node:crypto";

import {
  plannerUnavailable,
  routeStepId,
  stageSummary,
  stepStages,
  type PlanGenerationWorkflow,
  type RouteResume,
} from "@/agents/workflows/plan-generation";
import { initialPlanState } from "@/agents/workflows/plan-generation";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import {
  planProgressEventSchema,
  type PlanProgressEnvelope,
  type PlanProgressEvent,
  type PlanRunErrorCode,
  type PlanStage,
  type QuestionStep,
} from "@/domain/plan/plan-progress";
import type { LabelledAnswer } from "@/capabilities/planning/extract-plan-preferences";
import { type PlanAnswer, type PlanFactField, planFactFields, type PlanRun, type PlanRunUsage, type PlanVersion } from "@/domain/plan/plan-run";
import type { TripState } from "@/domain/trip-state/trip-state";
import { maxActivePreferences, maxPreferenceQuoteLength, paceFor, type PlanPreference } from "@/domain/plan/trip-preference";
import { logger } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";
import type { PlanRunRepository } from "@/platform/persistence/plan-run-repository";
import type { TripPreferenceRepository } from "@/platform/persistence/trip-preference-repository";
import { modelDeadlineMs } from "@/platform/llm/moonshot-chat-model";

/**
 * A backstop for the whole run. Each part has its own deadline (70 s a city, two cities at
 * a time; 30 s for the route; 60 s for each city's days), so ten cities can need about
 * seven minutes; this only ends a run that has stopped making progress.
 */
const runTimeLimitMs = 8 * 60_000;

type Listener = { onEvent(envelope: PlanProgressEnvelope): void; onClose(): void };

/**
 * Runs this process is executing: every event so far, in order, and who is listening.
 * Listeners get each event the moment it happens; Postgres keeps the same events for a
 * page that comes back after the run. Kept on globalThis so Next's development reloads,
 * which re-evaluate modules, still see the runs in flight. One process owns its runs:
 * the deployment is a single `next start` on one VPS.
 */
type ActiveRun = { readonly events: PlanProgressEnvelope[]; readonly listeners: Set<Listener> };
type PlanRunBus = Map<string, ActiveRun>;
const busKey = Symbol.for("meri.planRuns.v2");
const startsKey = Symbol.for("meri.planRunStarts");
const globals = globalThis as unknown as Record<symbol, unknown>;
const activeRuns = (globals[busKey] ??= new Map()) as PlanRunBus;
const startingRuns = (globals[startsKey] ??= new Map()) as Map<string, Promise<PlanRunStart>>;

export type PlanRunStart =
  | { readonly status: "ready"; readonly runId: string; readonly version: PlanVersion }
  | { readonly status: "running"; readonly runId: string }
  /**
   * No run was started (step 2): today's runs are used up, Kimi's money is spent, or paid calls are off.
   * `previous` is the trip's last saved plan, shown instead of nothing (merlin, 2026-11-21).
   */
  | { readonly status: "limited"; readonly reason: PlanRunLimit; readonly previous: PlanVersion | null };

export type PlanRunLimit = "daily_runs" | "daily_quota" | "paid_calls_paused"
  // Step 3: this visitor's runs today, or this address's in the last 24 hours, are used up.
  | "guest_runs" | "address_runs";

/** Who asks for a run (step 3): the visitor's cookie and the address a trusted proxy reported. */
export type PlanVisitor = { readonly guestId: string | null; readonly address: string | null };

/**
 * The site's limits a new run must pass (step 2): runs a Beijing day, counted in the database, and
 * whether Kimi would refuse right now. Absent (as in the tests), no limit applies.
 */
export type PlanRunLimits = {
  readonly runsPerDay: number;
  readonly kimiRefusal: () => "daily_quota" | "paid_calls_paused" | null;
  /** Step 3: runs one visitor may start a Beijing day, counted without the runs that failed on Meri's side. */
  readonly runsPerGuest?: number;
  readonly guestRuns?: (guestId: string, since: string) => Promise<number>;
  /** Step 3: runs one address may start in 24 hours, counted in memory. */
  readonly runsPerAddress?: number;
};

const day = 24 * 60 * 60 * 1_000;
const addressKey = Symbol.for("meri.plan-run-addresses");
// Each address's recent runs, kept across hot reloads; a run that fails on Meri's side is taken off.
const addressRuns = ((globalThis as Record<symbol, unknown>)[addressKey] ??= new Map()) as Map<string, { runId: string; at: number }[]>;

/** Midnight in Beijing on the day of `now`, as an instant. */
export function beijingDayStart(now: Date): string {
  const day = new Date(now.getTime() + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00+08:00`).toISOString();
}

type WorkflowChunk = { type: string; payload?: unknown };

/** A run starts once and resumes once for each answer, numbering its events on from the last. */
type RunSegment =
  | { readonly kind: "start" }
  | {
    readonly kind: "resume";
    /** The step that asked: the route, or the transport question (1.2112). */
    readonly step: QuestionStep;
    readonly resume: RouteResume;
    readonly lastSeq: number;
    readonly activeMs: number;
  };

export type PlanAnswerOutcome = "resumed" | "not_found" | "not_waiting" | "wrong_question";

export type PlanRunServiceDependencies = {
  readonly repository: PlanRunRepository;
  /** Where an answer to the run's question is saved as a preference. */
  readonly preferences: Pick<TripPreferenceRepository, "listByTripId" | "create">;
  /** Labels an answer the traveller wrote themselves and finds a city it says to skip (1.2018). */
  readonly labelAnswer: (text: string, question: string, cities: readonly string[]) => Promise<LabelledAnswer>;
  /** Boxed: a workflow has a `then` method of its own, so a promise would try to resolve it. */
  readonly workflow: () => Promise<{ readonly workflow: PlanGenerationWorkflow }>;
  readonly now?: () => Date;
  readonly newId?: () => string;
  readonly timeLimitMs?: number;
  readonly limits?: PlanRunLimits;
};

/**
 * The time a run worked up to its latest question, without the waits for earlier answers: a run
 * may now wait twice, for the route and for the transport question (1.2112).
 */
export function workingMs(events: readonly PlanProgressEnvelope[], startedAt: number): number {
  let waitingSince: number | null = null;
  let lastWaiting = startedAt;
  let waited = 0;
  for (const { at, event } of events) {
    if (event.type === "run.waiting") {
      waitingSince = at;
      lastWaiting = at;
    } else if (event.type === "question.answered" && waitingSince !== null) {
      waited += at - waitingSince;
      waitingSince = null;
    }
  }
  return Math.max(0, lastWaiting - startedAt - waited);
}

/** The trip's selected cities, as a written answer may name one to leave out. */
function tripCities(handoff: PlanHandoff): string[] {
  const destination = handoff.tripState.destination;
  return destination.state === "known" ? destination.areas.flatMap(({ places }) => places.map(({ name }) => name)) : [];
}

/** Key order is not kept by jsonb, so compare and digest objects with their keys sorted. */
/**
 * Which of the facts a saved plan was made from differ from the handoff now: a TripState field, or the
 * preferences (by id). The page says so when it shows an older plan; nothing here changes either.
 */
export function changedPlanFacts(
  made: { readonly tripState: TripState; readonly preferences: readonly PlanPreference[] },
  now: { readonly tripState: TripState; readonly preferences: readonly PlanPreference[] },
): PlanFactField[] {
  return planFactFields.filter((field) => {
    if (field === "preferences") {
      const ids = (list: readonly PlanPreference[]) => list.map(({ id }) => id).sort().join(",");
      return ids(made.preferences) !== ids(now.preferences);
    }
    return canonicalJson(made.tripState[field]) !== canonicalJson(now.tripState[field]);
  });
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
    : item);
}

/** The digest a run is found by: the same handoff always gives the same key. */
export function handoffKey(handoff: PlanHandoff): string {
  return createHash("sha256").update(canonicalJson(handoff)).digest("hex");
}

function stageOf(payload: unknown): { id: string; stage: PlanStage } | null {
  const id = (payload as { id?: unknown } | undefined)?.id;
  if (typeof id !== "string" || !(id in stepStages)) return null;
  return { id, stage: stepStages[id as keyof typeof stepStages] };
}

/**
 * Starts plan runs in the background, saves each run's progress events, and lets any
 * number of pages follow a run: first what was saved, then what happens next.
 */
export class PlanRunService {
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly timeLimitMs: number;

  constructor(private readonly deps: PlanRunServiceDependencies) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? randomUUID;
    this.timeLimitMs = deps.timeLimitMs ?? modelDeadlineMs(runTimeLimitMs);
  }

  /**
   * The plan for this handoff: its saved version when a run already made one, the run
   * in progress when one is, or a new run. A run left running by a restarted server is
   * marked interrupted first, and a failed run is tried again.
   */
  start(tripId: string, handoff: PlanHandoff, visitor: PlanVisitor = { guestId: null, address: null }): Promise<PlanRunStart> {
    const key = handoffKey(handoff);
    const startKey = tripId + ":" + key;
    // React's development double effect and two tabs ask at once; both get one run.
    const pending = startingRuns.get(startKey);
    if (pending) return pending;
    const starting = this.startOnce(tripId, handoff, key, visitor).finally(() => startingRuns.delete(startKey));
    startingRuns.set(startKey, starting);
    return starting;
  }

  private async startOnce(tripId: string, handoff: PlanHandoff, key: string, visitor: PlanVisitor): Promise<PlanRunStart> {
    const latest = await this.deps.repository.findLatestRun(tripId);
    if (latest?.handoffKey === key) {
      if (latest.status === "running" && activeRuns.has(latest.id)) return { status: "running", runId: latest.id };
      // Waiting for an answer: the page follows it and shows the question again.
      if (latest.status === "suspended") return { status: "running", runId: latest.id };
      if (latest.status === "running") await this.interrupt(latest);
      if (latest.status === "succeeded") {
        const version = await this.deps.repository.findVersionByRun(latest.id);
        if (version) return { status: "ready", runId: latest.id, version };
      }
    }

    // Only a new run counts: a saved plan, a run in progress or one waiting for an answer never does.
    const limited = await this.limitFor(visitor);
    if (limited) {
      logger.info({ tripId, reason: limited }, "Plan run not started: a site limit is reached");
      return { status: "limited", reason: limited, previous: await this.deps.repository.findLatestVersion(tripId) };
    }

    const run: PlanRun = {
      id: this.newId(), tripId, status: "running", handoff, handoffKey: key,
      errorCode: null, usage: null, startedAt: this.now().toISOString(), finishedAt: null, durationMs: null,
    };
    await this.deps.repository.createRun(run);
    if (visitor.address && this.deps.limits?.runsPerAddress) {
      addressRuns.set(visitor.address, [...this.recentRuns(visitor.address), { runId: run.id, at: this.now().getTime() }]);
    }
    activeRuns.set(run.id, { events: [], listeners: new Set() });
    void this.execute(run).catch((error: unknown) => {
      logger.error({ runId: run.id, error: serializeError(error) }, "Plan run could not finish");
      activeRuns.delete(run.id);
    });
    return { status: "running", runId: run.id };
  }

  private async limitFor(visitor: PlanVisitor): Promise<PlanRunLimit | null> {
    const limits = this.deps.limits;
    if (!limits) return null;
    const refusal = limits.kimiRefusal();
    if (refusal) return refusal;
    const since = beijingDayStart(this.now());
    const started = await this.deps.repository.countRunsStartedSince(since);
    if (started >= limits.runsPerDay) return "daily_runs";
    if (visitor.guestId && limits.runsPerGuest && limits.guestRuns
      && await limits.guestRuns(visitor.guestId, since) >= limits.runsPerGuest) return "guest_runs";
    if (visitor.address && limits.runsPerAddress && this.recentRuns(visitor.address).length >= limits.runsPerAddress) return "address_runs";
    return null;
  }

  /** An address's runs in the last 24 hours. */
  private recentRuns(address: string): { runId: string; at: number }[] {
    const after = this.now().getTime() - day;
    return (addressRuns.get(address) ?? []).filter(({ at }) => at > after);
  }

  /** The newest saved plan and the newest run of a trip. */
  async latest(tripId: string): Promise<{ version: PlanVersion | null; run: PlanRun | null }> {
    const [version, run] = await Promise.all([
      this.deps.repository.findLatestVersion(tripId),
      this.deps.repository.findLatestRun(tripId),
    ]);
    return { version, run };
  }

  findRun(tripId: string, runId: string): Promise<PlanRun | null> {
    return this.deps.repository.findRun(tripId, runId);
  }

  /**
   * A run's events after `afterSeq`, then live ones until the run finishes or the signal
   * aborts. A run this process is executing is read from memory, so nothing waits on a
   * database write; any other run from Postgres. A run marked running that this process
   * does not own was cut off by a restart: it is marked interrupted, its last event.
   */
  async *follow(run: PlanRun, afterSeq: number, signal: AbortSignal): AsyncGenerator<PlanProgressEnvelope> {
    const queue: PlanProgressEnvelope[] = [];
    let closed = false;
    let wake: (() => void) | null = null;
    const notify = () => {
      wake?.();
      wake = null;
    };
    const listener: Listener = {
      onEvent(envelope) {
        queue.push(envelope);
        notify();
      },
      onClose() {
        closed = true;
        notify();
      },
    };
    // Listen and take the events so far in one step, so nothing falls between the two.
    const active = activeRuns.get(run.id);
    active?.listeners.add(listener);
    const earlier = active ? active.events.filter(({ seq }) => seq > afterSeq) : null;
    signal.addEventListener("abort", notify, { once: true });
    try {
      let last = afterSeq;
      for (const envelope of earlier ?? await this.deps.repository.listEvents(run.id, afterSeq)) {
        yield envelope;
        last = envelope.seq;
        if (envelope.event.type === "run.finished") return;
      }
      if (!active) {
        const latest = await this.deps.repository.findRun(run.tripId, run.id);
        if (latest?.status === "running") {
          const ending = await this.interrupt(latest);
          if (ending && ending.seq > afterSeq) yield ending;
        }
        return;
      }
      while (!signal.aborted) {
        while (queue.length > 0) {
          const envelope = queue.shift() as PlanProgressEnvelope;
          if (envelope.seq <= last) continue;
          yield envelope;
          last = envelope.seq;
          if (envelope.event.type === "run.finished") return;
        }
        if (closed) return;
        await new Promise<void>((resolve) => { wake = resolve; });
      }
    } finally {
      active?.listeners.delete(listener);
      signal.removeEventListener("abort", notify);
    }
  }

  /**
   * Resumes a run waiting for this question with the traveller's choice: the answer is
   * saved as a preference and the workflow goes on from the route, from its snapshot in
   * Postgres, also after a restart. Only one answer resumes a run.
   */
  async answer(tripId: string, runId: string, answer: PlanAnswer): Promise<PlanAnswerOutcome> {
    const run = await this.deps.repository.findRun(tripId, runId);
    if (!run) return "not_found";
    if (run.status !== "suspended") return "not_waiting";
    const events = await this.deps.repository.listEvents(runId, 0);
    const waiting = events.findLast(({ event }) => event.type === "run.waiting");
    const question = waiting?.event.type === "run.waiting" ? waiting.event.question : null;
    if (!waiting || !question || question.id !== answer.questionId) return "wrong_question";
    const choice = "choice" in answer ? answer.choice : null;
    const option = choice === null ? null : question.options.find(({ label }) => label === choice) ?? null;
    if (choice !== null && !option) return "wrong_question";
    // The transport question offers options only: the train, the flight, or Meri's choice (1.2112).
    const step: QuestionStep = question.step ?? routeStepId;
    if ("text" in answer && step !== routeStepId) return "wrong_question";
    // Claimed in the database, so a second answer or a second tab cannot resume it twice.
    if (!await this.deps.repository.moveRun(runId, "suspended", "running")) return "not_waiting";

    const answeredAt = this.now();
    let preference: PlanPreference | null = option && {
      id: this.newId(), label: option.label, kind: option.kind, pace: paceFor(option.kind, option.pace),
      quote: `${question.text} ${option.label}`.slice(0, maxPreferenceQuoteLength),
      source: "question", messageId: null, createdAt: answeredAt.toISOString(),
    };
    let leaveOut: string | null = null;
    if ("text" in answer) {
      // The traveller's own words: the model labels them once, code keeps a city only if it is the trip's.
      const labelled = await this.deps.labelAnswer(answer.text, question.text, tripCities(run.handoff));
      leaveOut = labelled.leaveOut;
      preference = {
        id: this.newId(), label: labelled.label, kind: labelled.kind, pace: labelled.pace, quote: answer.text,
        source: "question", messageId: null, createdAt: answeredAt.toISOString(),
      };
    }
    if (preference) await this.savePreference(tripId, preference);
    activeRuns.set(runId, { events: [...events], listeners: new Set() });
    void this.execute(run, {
      kind: "resume",
      step,
      resume: { choice: option?.label ?? ("text" in answer ? answer.text : null), preference, leaveOut },
      lastSeq: events.at(-1)?.seq ?? 0,
      // The time already spent working, without the wait for the answer.
      activeMs: workingMs(events, Date.parse(run.startedAt)),
    }).catch((error: unknown) => {
      logger.error({ runId, error: serializeError(error) }, "Plan run could not finish");
      activeRuns.delete(runId);
    });
    return "resumed";
  }

  /** The answer joins the trip's preferences, like one added on the plan page, while there is room. */
  private async savePreference(tripId: string, preference: PlanPreference): Promise<void> {
    try {
      const existing = await this.deps.preferences.listByTripId(tripId);
      if (existing.filter(({ status }) => status === "active").length >= maxActivePreferences) return;
      await this.deps.preferences.create({ ...preference, tripId, status: "active" });
    } catch (error) {
      // The run still uses the answer; only the plan page's list would miss it.
      logger.warn({ tripId, error: serializeError(error) }, "Plan answer not saved as a preference");
    }
  }

  /** Marks a run cut off by a restart as interrupted and records its last event. */
  private async interrupt(run: PlanRun): Promise<PlanProgressEnvelope | null> {
    const finishedAt = this.now();
    const ended = await this.deps.repository.finishRun(run.id, {
      status: "interrupted", errorCode: "interrupted", usage: null, finishedAt: finishedAt.toISOString(),
      durationMs: Math.max(0, finishedAt.getTime() - Date.parse(run.startedAt)),
    });
    if (!ended) return null;
    const events = await this.deps.repository.listEvents(run.id, 0);
    const envelope: PlanProgressEnvelope = {
      runId: run.id, seq: (events.at(-1)?.seq ?? 0) + 1, at: finishedAt.getTime(),
      event: { type: "run.finished", status: "interrupted", versionId: null, errorCode: "interrupted",
        ms: Math.max(0, finishedAt.getTime() - Date.parse(run.startedAt)) },
    };
    await this.deps.repository.appendEvent(envelope);
    logger.warn({ runId: run.id }, "Plan run interrupted by a restart");
    return envelope;
  }

  private async execute(run: PlanRun, segment: RunSegment = { kind: "start" }): Promise<void> {
    const startedAt = performance.now();
    let seq = segment.kind === "resume" ? segment.lastSeq : 0;
    let saving = Promise.resolve();
    const active = activeRuns.get(run.id);
    // Sent at once, in order; saved one at a time behind it. Each Neon write takes a
    // round trip, so waiting for it first put the page seconds behind the run.
    const publish = (event: PlanProgressEvent) => {
      seq += 1;
      const envelope: PlanProgressEnvelope = { runId: run.id, seq, at: this.now().getTime(), event };
      active?.events.push(envelope);
      for (const listener of active?.listeners ?? []) listener.onEvent(envelope);
      saving = saving.then(async () => {
        try {
          await this.deps.repository.appendEvent(envelope);
        } catch (error) {
          // Live pages have it; only a page that comes back after the run would miss it.
          logger.warn({ runId: run.id, seq, error: serializeError(error) }, "Plan run event not saved");
        }
      });
    };

    let errorCode: PlanRunErrorCode | null = null;
    let output: { versionId: string; usage: PlanRunUsage } | null = null;
    let suspended = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | null = null;
    try {
      const { workflow } = await this.deps.workflow();
      const workflowRun = await workflow.createRun({ runId: run.id });
      timer = setTimeout(() => {
        timedOut = true;
        void workflowRun.cancel();
      }, this.timeLimitMs);
      const input = { runId: run.id, tripId: run.tripId, handoff: run.handoff };
      // A resumed run starts again at the step that asked; Mastra reads every earlier step from its snapshot.
      const stream = segment.kind === "start"
        ? workflowRun.stream({ inputData: input, initialState: initialPlanState(input) })
        : workflowRun.resumeStream({ step: segment.step, resumeData: segment.resume });
      // Keyed by stage: the validation stage is two steps and a loop, but one line on the page.
      const stageStarts = new Map<PlanStage, number>();
      for await (const chunk of stream.fullStream as AsyncIterable<WorkflowChunk>) {
        if (chunk.type === "workflow-step-start") {
          const step = stageOf(chunk.payload);
          if (step && !stageStarts.has(step.stage)) {
            stageStarts.set(step.stage, performance.now());
            publish({ type: "stage.started", stage: step.stage });
          }
        } else if (chunk.type === "workflow-step-output") {
          // What a step wrote: only events in the shared format reach the page.
          const parsed = planProgressEventSchema.safeParse((chunk.payload as { output?: unknown } | undefined)?.output);
          if (parsed.success) publish(parsed.data);
          else logger.warn({ runId: run.id, issues: parsed.error.issues.length }, "Plan run wrote an unknown event");
        } else if (chunk.type === "workflow-step-result") {
          const payload = chunk.payload as { id?: string; status?: string; output?: unknown };
          const step = stageOf(payload);
          const summary = step && payload.status === "success" ? stageSummary(step.id, payload.output) : null;
          if (step && summary) {
            publish({ type: "stage.finished", stage: summary.stage,
              ms: Math.round(performance.now() - (stageStarts.get(step.stage) ?? performance.now())), summary: summary.summary });
          }
        }
      }
      const result = await stream.result;
      if (result.status === "success") {
        output = result.result;
      } else if (result.status === "suspended") {
        suspended = true;
      } else {
        // Mastra hands back the step's error serialized, as { name, message }.
        const error = result.status === "failed" ? result.error as { name?: unknown; message?: unknown } | undefined : undefined;
        errorCode = timedOut ? "time_limit" : error?.message === plannerUnavailable ? "planner_unavailable" : "internal_error";
        // A model that stopped answering because Meri refused the call says why (step 2).
        if (!timedOut) errorCode = this.deps.limits?.kimiRefusal() ?? errorCode;
        // The error name only: a provider's message can carry request details.
        logger.warn({ runId: run.id, status: result.status, errorCode, errorName: error?.name ?? null }, "Plan run did not succeed");
      }
    } catch (error) {
      errorCode = "internal_error";
      logger.error({ runId: run.id, error: serializeError(error) }, "Plan run failed");
    } finally {
      if (timer) clearTimeout(timer);
    }

    const durationMs = Math.round(performance.now() - startedAt) + (segment.kind === "resume" ? segment.activeMs : 0);
    if (suspended) {
      // The step already sent run.waiting; the run waits in Postgres, not in this process.
      try {
        await this.deps.repository.moveRun(run.id, "running", "suspended");
      } catch (error) {
        logger.error({ runId: run.id, error: serializeError(error) }, "Plan run not marked as waiting");
      }
      await saving;
      logger.info({ runId: run.id, tripId: run.tripId, durationMs }, "Plan run waiting for an answer");
      for (const listener of active?.listeners ?? []) listener.onClose();
      activeRuns.delete(run.id);
      return;
    }
    const status = output ? "succeeded" : "failed";
    // A run that failed on Meri's side gives the address its turn back (step 3), as it does the visitor.
    if (status === "failed") {
      for (const [address, runs] of addressRuns) addressRuns.set(address, runs.filter(({ runId }) => runId !== run.id));
    }
    try {
      await this.deps.repository.finishRun(run.id, {
        status, errorCode, usage: output?.usage ?? null, finishedAt: this.now().toISOString(), durationMs,
      });
    } catch (error) {
      logger.error({ runId: run.id, error: serializeError(error) }, "Plan run record not finished");
    }
    publish({ type: "run.finished", status, versionId: output?.versionId ?? null, errorCode, ms: durationMs });
    // The run leaves memory only once Postgres has every event, so a late page finds them all.
    await saving;
    logger.info({ runId: run.id, tripId: run.tripId, status, errorCode, durationMs, usage: output?.usage ?? null },
      "Plan run finished");
    for (const listener of active?.listeners ?? []) listener.onClose();
    activeRuns.delete(run.id);
  }
}
