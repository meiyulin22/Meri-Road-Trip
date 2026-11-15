import { createHash, randomUUID } from "node:crypto";

import { plannerUnavailable, stageSummary, stepStages, type PlanGenerationWorkflow } from "@/agents/workflows/plan-generation";
import { initialPlanState } from "@/agents/workflows/plan-generation";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import {
  planProgressEventSchema,
  type PlanProgressEnvelope,
  type PlanProgressEvent,
  type PlanRunErrorCode,
  type PlanStage,
} from "@/domain/plan/plan-progress";
import type { PlanRun, PlanRunUsage, PlanVersion } from "@/domain/plan/plan-run";
import { logger } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";
import type { PlanRunRepository } from "@/platform/persistence/plan-run-repository";

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
  | { readonly status: "running"; readonly runId: string };

type WorkflowChunk = { type: string; payload?: unknown };

export type PlanRunServiceDependencies = {
  readonly repository: PlanRunRepository;
  /** Boxed: a workflow has a `then` method of its own, so a promise would try to resolve it. */
  readonly workflow: () => Promise<{ readonly workflow: PlanGenerationWorkflow }>;
  readonly now?: () => Date;
  readonly newId?: () => string;
  readonly timeLimitMs?: number;
};

/** Key order is not kept by jsonb, so compare and digest objects with their keys sorted. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
    : item);
}

function handoffKey(handoff: PlanHandoff): string {
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
    this.timeLimitMs = deps.timeLimitMs ?? runTimeLimitMs;
  }

  /**
   * The plan for this handoff: its saved version when a run already made one, the run
   * in progress when one is, or a new run. A run left running by a restarted server is
   * marked interrupted first, and a failed run is tried again.
   */
  start(tripId: string, handoff: PlanHandoff): Promise<PlanRunStart> {
    const key = handoffKey(handoff);
    const startKey = tripId + ":" + key;
    // React's development double effect and two tabs ask at once; both get one run.
    const pending = startingRuns.get(startKey);
    if (pending) return pending;
    const starting = this.startOnce(tripId, handoff, key).finally(() => startingRuns.delete(startKey));
    startingRuns.set(startKey, starting);
    return starting;
  }

  private async startOnce(tripId: string, handoff: PlanHandoff, key: string): Promise<PlanRunStart> {
    const latest = await this.deps.repository.findLatestRun(tripId);
    if (latest?.handoffKey === key) {
      if (latest.status === "running" && activeRuns.has(latest.id)) return { status: "running", runId: latest.id };
      if (latest.status === "running") await this.interrupt(latest);
      if (latest.status === "succeeded") {
        const version = await this.deps.repository.findVersionByRun(latest.id);
        if (version) return { status: "ready", runId: latest.id, version };
      }
    }

    const run: PlanRun = {
      id: this.newId(), tripId, status: "running", handoff, handoffKey: key,
      errorCode: null, usage: null, startedAt: this.now().toISOString(), finishedAt: null, durationMs: null,
    };
    await this.deps.repository.createRun(run);
    activeRuns.set(run.id, { events: [], listeners: new Set() });
    void this.execute(run).catch((error: unknown) => {
      logger.error({ runId: run.id, error: serializeError(error) }, "Plan run could not finish");
      activeRuns.delete(run.id);
    });
    return { status: "running", runId: run.id };
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

  private async execute(run: PlanRun): Promise<void> {
    const startedAt = performance.now();
    let seq = 0;
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
      const stream = workflowRun.stream({ inputData: input, initialState: initialPlanState(input) });
      const stepStarts = new Map<string, number>();
      for await (const chunk of stream.fullStream as AsyncIterable<WorkflowChunk>) {
        if (chunk.type === "workflow-step-start") {
          const step = stageOf(chunk.payload);
          if (step && !stepStarts.has(step.id)) {
            stepStarts.set(step.id, performance.now());
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
              ms: Math.round(performance.now() - (stepStarts.get(step.id) ?? performance.now())), summary: summary.summary });
          }
        }
      }
      const result = await stream.result;
      if (result.status === "success") {
        output = result.result;
      } else {
        // Mastra hands back the step's error serialized, as { name, message }.
        const error = result.status === "failed" ? result.error as { name?: unknown; message?: unknown } | undefined : undefined;
        errorCode = timedOut ? "time_limit" : error?.message === plannerUnavailable ? "planner_unavailable" : "internal_error";
        // The error name only: a provider's message can carry request details.
        logger.warn({ runId: run.id, status: result.status, errorCode, errorName: error?.name ?? null }, "Plan run did not succeed");
      }
    } catch (error) {
      errorCode = "internal_error";
      logger.error({ runId: run.id, error: serializeError(error) }, "Plan run failed");
    } finally {
      if (timer) clearTimeout(timer);
    }

    const durationMs = Math.round(performance.now() - startedAt);
    const status = output ? "succeeded" : "failed";
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
