import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import type { Locale } from "@/domain/locale/locale";
import type { PlanVersion } from "@/domain/plan/plan-run";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { createRateLimiter } from "@/platform/http/rate-limiter";
import { logger } from "@/platform/observability/logger";
import type { PlanRunRepository } from "@/platform/persistence/plan-run-repository";

import type { PlanPdfErrorCode, PlanPdfEvent, PlanPdfStage } from "./protocol";

type LoadJourney = (tripId: string, guestId: string) => Promise<{ tripState: TripState }>;
type PlanPdfReadError = "not_found" | "no_plan" | "incomplete";

export type PlanPdfSnapshot =
  | { readonly status: "ready"; readonly version: PlanVersion; readonly locale: Locale; readonly stale: boolean }
  | { readonly status: PlanPdfReadError };

type PlanPdfSnapshotDependencies = {
  readonly loadJourney: LoadJourney;
  readonly repository: Pick<PlanRunRepository, "findLatestVersion" | "findRun">;
};

function journeyMissing(error: unknown): boolean {
  return error instanceof TripNotFoundError || error instanceof TripStateNotFoundError;
}

/** Owner check and one authoritative plan read for the entire print document. */
export async function loadPlanPdfSnapshot(
  tripId: string,
  guestId: string | null,
  deps: PlanPdfSnapshotDependencies,
): Promise<PlanPdfSnapshot> {
  if (!guestId || !z.uuid().safeParse(tripId).success) return { status: "not_found" };

  let tripState: TripState;
  try {
    ({ tripState } = await deps.loadJourney(tripId, guestId));
  } catch (error) {
    if (journeyMissing(error)) return { status: "not_found" };
    throw error;
  }

  const version = await deps.repository.findLatestVersion(tripId);
  if (!version) return { status: "no_plan" };
  if (version.plan.draft.mode !== "full" || version.plan.draft.days.length === 0) return { status: "incomplete" };

  // A later run may be pending or failed. Use the run that actually produced this version.
  const run = await deps.repository.findRun(tripId, version.runId);
  if (!run) return { status: "not_found" }; // A journey may have been deleted since the version read.
  return { status: "ready", version, locale: run.handoff.locale, stale: !isDeepStrictEqual(version.tripState, tripState) };
}

export type RenderPlanPdf = (input: {
  readonly tripId: string;
  readonly guestId: string;
  readonly signal: AbortSignal;
  readonly reportStage: (stage: PlanPdfStage) => void;
}) => Promise<
  | { readonly type: "pdf"; readonly bytes: Buffer; readonly filename: string; readonly version: number; readonly stale: boolean }
  | { readonly type: "error"; readonly code: PlanPdfReadError }
>;

/** A canceled waiter gives back its queue slot. An active job releases after browser cleanup. */
class PdfQueue {
  private active = false;
  private readonly waiting = new Set<() => void>();

  isFull(limit: number): boolean {
    return this.active && this.waiting.size >= limit;
  }

  acquire(signal: AbortSignal, onQueued: () => void): Promise<() => void> {
    signal.throwIfAborted();
    if (!this.active) {
      this.active = true;
      return Promise.resolve(this.release);
    }

    onQueued();
    return new Promise((resolve, reject) => {
      const grant = () => {
        this.waiting.delete(grant);
        signal.removeEventListener("abort", canceled);
        resolve(this.release);
      };
      const canceled = () => {
        this.waiting.delete(grant);
        reject(signal.reason);
      };
      this.waiting.add(grant);
      signal.addEventListener("abort", canceled, { once: true });
    });
  }

  private readonly release = () => {
    const next = this.waiting.values().next();
    if (next.done) this.active = false;
    else next.value();
  };
}

type PlanPdfDependencies = {
  readonly loadJourney: LoadJourney;
  readonly render: RenderPlanPdf;
  readonly timeoutMs?: number;
  readonly queueLimit?: number;
  readonly guestLimit?: number;
};

const maxPdfBytes = 8 * 1024 * 1024;

function failure(code: PlanPdfErrorCode, status: number): Response {
  return Response.json({ error: { code } }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Keep one instance per process so all visitors share the queue. */
export function createPlanPdfHandler(deps: PlanPdfDependencies) {
  const queue = new PdfQueue();
  const limiter = createRateLimiter({ limit: deps.guestLimit ?? 10, windowMs: 60 * 60_000 });
  const timeoutMs = deps.timeoutMs ?? 60_000;

  return async function handlePlanPdf(
    tripId: string,
    guestId: string | null,
    requestSignal: AbortSignal,
  ): Promise<Response> {
    if (!guestId || !z.uuid().safeParse(tripId).success) return failure("not_found", 404);
    const owner = guestId;

    const startedAt = Date.now();
    try {
      await deps.loadJourney(tripId, guestId);
    } catch (error) {
      if (journeyMissing(error)) return failure("not_found", 404);
      logger.error({ event: "plan.pdf.failed", tripId, durationMs: Date.now() - startedAt, code: "failed" });
      return failure("failed", 500);
    }

    if (queue.isFull(deps.queueLimit ?? 4)) return failure("busy", 503);
    if (!limiter.allow(guestId)) return failure("limited", 429);

    const client = new AbortController();
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = AbortSignal.any([requestSignal, client.signal, deadline]);
    const disconnected = () => requestSignal.aborted || client.signal.aborted;
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        function send(event: PlanPdfEvent) {
          if (!disconnected()) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }

        const reportStage = (stage: PlanPdfStage) => send({ type: "stage", stage });

        async function run() {
          let release: (() => void) | undefined;
          logger.info({ event: "plan.pdf.started", tripId, durationMs: Date.now() - startedAt });
          try {
            release = await queue.acquire(signal, () => reportStage("queued"));
            signal.throwIfAborted();
            const result = await deps.render({ tripId, guestId: owner, signal, reportStage });
            signal.throwIfAborted();
            if (result.type === "error") {
              send(result);
              logger.info({ event: "plan.pdf.failed", tripId, durationMs: Date.now() - startedAt, code: result.code });
              return;
            }
            const { bytes, ...metadata } = result;
            if (!bytes.length || bytes.length > maxPdfBytes) throw new Error("PDF size is outside the export limit");
            send({ ...metadata, base64: bytes.toString("base64") });
            logger.info({ event: "plan.pdf.completed", tripId, durationMs: Date.now() - startedAt, bytes: bytes.length });
          } catch (error) {
            const code = deadline.aborted || (error instanceof Error && error.name === "TimeoutError") ? "timeout" : "failed";
            send({ type: "error", code });
            logger.error({ event: "plan.pdf.failed", tripId, durationMs: Date.now() - startedAt, code,
              errorType: error instanceof Error ? error.name : typeof error, disconnected: disconnected() });
          } finally {
            release?.();
            if (!client.signal.aborted) controller.close();
          }
        }

        void run();
      },
      cancel() {
        client.abort();
      },
    });

    return new Response(stream, { headers: {
      "Cache-Control": "no-store, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    } });
  };
}
