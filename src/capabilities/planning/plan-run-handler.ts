import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import { planScope } from "@/domain/plan/plan-draft";
import { planHandoffSchema } from "@/domain/plan/plan-handoff";
import type { LatestPlanResponse, PlanRunStartResponse } from "@/domain/plan/plan-run";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { logger } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";

import { canonicalJson, type PlanRunService } from "./plan-run-service";

export type PlanRunDependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly service: Pick<PlanRunService, "start" | "latest" | "findRun" | "follow">;
};

/** A comment line every 15 s keeps proxies from closing a quiet stream. */
const heartbeatMs = 15_000;

function noStore(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function failure(status: number, code: string, message: string): Response {
  return noStore({ error: { code, message } }, status);
}

const notFound = () => failure(404, "journey_not_found", "Journey not found.");

function isNotFound(error: unknown): boolean {
  return error instanceof TripNotFoundError || error instanceof TripStateNotFoundError;
}

/**
 * Starts Generate plan for the handoff the plan page holds, or answers with the plan or
 * run it already has. The saved TripState stays authoritative: a handoff that no longer
 * matches it is refused, and a trip without a city is answered before any run starts.
 */
export async function handlePlanRunPost(
  tripId: string,
  ownerGuestId: string | null,
  body: unknown,
  deps: PlanRunDependencies,
): Promise<Response> {
  if (!ownerGuestId) return notFound();
  const parsed = planHandoffSchema.safeParse(body);
  if (!parsed.success) return failure(400, "invalid_handoff", "The plan handoff is invalid.");
  const handoff = parsed.data;
  try {
    const { tripState } = await deps.loadJourney(tripId, ownerGuestId);
    if (canonicalJson(tripState) !== canonicalJson(handoff.tripState)) {
      return failure(409, "journey_changed", "The journey changed after this plan was opened.");
    }
    const scope = planScope(handoff.tripState);
    if (scope.status === "unsupported") {
      return noStore({ status: "unsupported", reason: scope.reason } satisfies PlanRunStartResponse);
    }
    const started = await deps.service.start(tripId, handoff);
    if (started.status === "ready") {
      return noStore({
        status: "ready", runId: started.runId, versionId: started.version.id, plan: started.version.plan,
      } satisfies PlanRunStartResponse);
    }
    return noStore({ status: "running", runId: started.runId } satisfies PlanRunStartResponse, 202);
  } catch (error) {
    if (isNotFound(error)) return notFound();
    logger.error({ tripId, error: serializeError(error) }, "Plan run could not start");
    return failure(500, "internal_error", "Failed to start the plan.");
  }
}

/** The newest saved plan of the trip, whether the trip changed since, and the newest run. */
export async function handlePlanGet(tripId: string, ownerGuestId: string | null, deps: PlanRunDependencies): Promise<Response> {
  if (!ownerGuestId) return notFound();
  try {
    const { tripState } = await deps.loadJourney(tripId, ownerGuestId);
    const { version, run } = await deps.service.latest(tripId);
    return noStore({
      version: version && {
        id: version.id, version: version.version, runId: version.runId, createdAt: version.createdAt,
        stale: canonicalJson(version.tripState) !== canonicalJson(tripState), plan: version.plan,
      },
      run: run && { id: run.id, status: run.status, errorCode: run.errorCode, startedAt: run.startedAt, finishedAt: run.finishedAt },
    } satisfies LatestPlanResponse);
  } catch (error) {
    if (isNotFound(error)) return notFound();
    logger.error({ tripId, error: serializeError(error) }, "Plan could not be read");
    return failure(500, "internal_error", "Failed to read the plan.");
  }
}

/**
 * A run's progress as Server-Sent Events: each event's id is its sequence number, so a
 * browser that reconnects sends Last-Event-ID and gets only what it missed. The stream
 * ends after the run's last event, or when the page goes away; the run goes on either way.
 */
export async function handlePlanRunEvents(
  tripId: string,
  ownerGuestId: string | null,
  runId: string,
  lastEventId: string | null,
  signal: AbortSignal,
  deps: PlanRunDependencies,
): Promise<Response> {
  if (!ownerGuestId) return notFound();
  let run;
  try {
    await deps.loadJourney(tripId, ownerGuestId);
    run = await deps.service.findRun(tripId, runId);
  } catch (error) {
    if (isNotFound(error)) return notFound();
    logger.error({ tripId, runId, error: serializeError(error) }, "Plan run could not be read");
    return failure(500, "internal_error", "Failed to read the plan run.");
  }
  if (!run) return failure(404, "run_not_found", "Plan run not found.");
  const afterSeq = Math.max(0, Number.parseInt(lastEventId ?? "0", 10) || 0);
  const followed = run;

  const encoder = new TextEncoder();
  const stop = new AbortController();
  signal.addEventListener("abort", () => stop.abort(), { once: true });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        if (!stop.signal.aborted) controller.enqueue(encoder.encode(text));
      };
      const heartbeat = setInterval(() => send(": keep-alive\n\n"), heartbeatMs);
      // Without an error the browser reconnects after this many ms with Last-Event-ID.
      send("retry: 2000\n\n");
      try {
        for await (const envelope of deps.service.follow(followed, afterSeq, stop.signal)) {
          send(`id: ${envelope.seq}\ndata: ${JSON.stringify(envelope)}\n\n`);
        }
      } catch (error) {
        logger.warn({ tripId, runId, error: serializeError(error) }, "Plan run events stopped");
      } finally {
        clearInterval(heartbeat);
        if (!stop.signal.aborted) controller.close();
      }
    },
    cancel() {
      stop.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
