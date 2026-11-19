import { and, asc, count, desc, eq, gt, gte, max } from "drizzle-orm";
import { z } from "zod";

import { readyPlanSchema } from "@/domain/plan/plan-draft-response";
import { planHandoffSchema } from "@/domain/plan/plan-handoff";
import { planProgressEventSchema, planRunErrorCodes, type PlanProgressEnvelope } from "@/domain/plan/plan-progress";
import type { PlanRun, PlanRunFinish, PlanVersion } from "@/domain/plan/plan-run";
import { planPreferenceSchema } from "@/domain/plan/trip-preference";
import { validateTripState } from "@/domain/trip-state/trip-state";
import { planRunEvents, planRuns, planVersions } from "@/platform/persistence/database/schema/plan-runs";
import type { FilledPlanFacts, PlanRunRepository } from "@/platform/persistence/plan-run-repository";

type PlanRunDatabase = typeof import("@/platform/persistence/database/db").db;
type PlanRunRow = typeof planRuns.$inferSelect;
type PlanVersionRow = typeof planVersions.$inferSelect;

type PostgresPlanRunOperation =
  | "createRun" | "moveRun" | "finishRun" | "findRun" | "findLatestRun" | "countRunsStartedSince" | "appendEvent" | "listEvents"
  | "createVersion" | "findVersionByRun" | "findLatestVersion" | "fillPlanFacts";

export class PostgresPlanRunRepositoryError extends Error {
  readonly operation: PostgresPlanRunOperation;
  readonly subjectId: string;

  constructor(operation: PostgresPlanRunOperation, subjectId: string, cause: unknown) {
    super(`Failed to ${operation} for ${subjectId}.`, { cause });
    this.name = "PostgresPlanRunRepositoryError";
    this.operation = operation;
    this.subjectId = subjectId;
  }
}

const usageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  searches: z.number().int().nonnegative(),
  mapLookups: z.number().int().nonnegative(),
});

/** Postgres writes timestamptz as "2026-11-15 08:00:00.123+00"; the domain keeps ISO strings. */
function isoTime(value: string): string {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) throw new Error("PostgreSQL returned an invalid plan timestamp.");
  return time.toISOString();
}

function toRun(row: PlanRunRow): PlanRun {
  return {
    id: row.id,
    tripId: row.tripId,
    status: row.status,
    handoff: planHandoffSchema.parse(row.handoff),
    handoffKey: row.handoffKey,
    errorCode: row.errorCode === null ? null : z.enum(planRunErrorCodes).parse(row.errorCode),
    usage: row.usage === null ? null : usageSchema.parse(row.usage),
    startedAt: isoTime(row.startedAt),
    finishedAt: row.finishedAt === null ? null : isoTime(row.finishedAt),
    durationMs: row.durationMs,
  };
}

function toVersion(row: PlanVersionRow): PlanVersion {
  return {
    id: row.id,
    tripId: row.tripId,
    runId: row.runId,
    version: row.version,
    tripState: validateTripState(row.tripState),
    preferences: z.array(planPreferenceSchema).parse(row.preferences),
    plan: readyPlanSchema.parse(row.plan),
    createdAt: isoTime(row.createdAt),
  };
}

export class PostgresPlanRunRepository implements PlanRunRepository {
  constructor(private readonly database: PlanRunDatabase) {}

  async createRun(run: PlanRun): Promise<void> {
    try {
      await this.database.insert(planRuns).values(run);
    } catch (error) {
      throw new PostgresPlanRunRepositoryError("createRun", run.id, error);
    }
  }

  async moveRun(runId: string, from: "running" | "suspended", to: "running" | "suspended"): Promise<boolean> {
    try {
      const updated = await this.database.update(planRuns)
        .set({ status: to })
        .where(and(eq(planRuns.id, runId), eq(planRuns.status, from)))
        .returning({ id: planRuns.id });
      return updated.length > 0;
    } catch (error) {
      throw new PostgresPlanRunRepositoryError("moveRun", runId, error);
    }
  }

  async finishRun(runId: string, finish: PlanRunFinish): Promise<boolean> {
    try {
      const updated = await this.database.update(planRuns)
        .set(finish)
        .where(and(eq(planRuns.id, runId), eq(planRuns.status, "running")))
        .returning({ id: planRuns.id });
      return updated.length > 0;
    } catch (error) {
      throw new PostgresPlanRunRepositoryError("finishRun", runId, error);
    }
  }

  async findRun(tripId: string, runId: string): Promise<PlanRun | null> {
    try {
      const rows = await this.database.select().from(planRuns)
        .where(and(eq(planRuns.id, runId), eq(planRuns.tripId, tripId)))
        .limit(1);
      return rows[0] ? toRun(rows[0]) : null;
    } catch (error) {
      throw new PostgresPlanRunRepositoryError("findRun", runId, error);
    }
  }

  async findLatestRun(tripId: string): Promise<PlanRun | null> {
    try {
      const rows = await this.database.select().from(planRuns)
        .where(eq(planRuns.tripId, tripId))
        .orderBy(desc(planRuns.startedAt))
        .limit(1);
      return rows[0] ? toRun(rows[0]) : null;
    } catch (error) {
      throw new PostgresPlanRunRepositoryError("findLatestRun", tripId, error);
    }
  }

  async countRunsStartedSince(since: string): Promise<number> {
    try {
      const rows = await this.database.select({ runs: count() }).from(planRuns).where(gte(planRuns.startedAt, since));
      return rows[0]?.runs ?? 0;
    } catch (error) {
      throw new PostgresPlanRunRepositoryError("countRunsStartedSince", since, error);
    }
  }

  async appendEvent({ runId, seq, at, event }: PlanProgressEnvelope): Promise<void> {
    try {
      await this.database.insert(planRunEvents).values({ runId, seq, type: event.type, payload: event, at: new Date(at) });
    } catch (error) {
      throw new PostgresPlanRunRepositoryError("appendEvent", runId, error);
    }
  }

  async listEvents(runId: string, afterSeq: number): Promise<PlanProgressEnvelope[]> {
    try {
      const rows = await this.database.select().from(planRunEvents)
        .where(and(eq(planRunEvents.runId, runId), gt(planRunEvents.seq, afterSeq)))
        .orderBy(asc(planRunEvents.seq));
      return rows.map((row) => ({
        runId: row.runId, seq: row.seq, at: row.at.getTime(), event: planProgressEventSchema.parse(row.payload),
      }));
    } catch (error) {
      throw new PostgresPlanRunRepositoryError("listEvents", runId, error);
    }
  }

  async createVersion(version: Omit<PlanVersion, "version">): Promise<PlanVersion> {
    try {
      // One run at a time per trip, and the unique (trip_id, version) refuses a race.
      const [latest] = await this.database.select({ version: max(planVersions.version) }).from(planVersions)
        .where(eq(planVersions.tripId, version.tripId));
      const saved = { ...version, version: (latest?.version ?? 0) + 1 };
      await this.database.insert(planVersions).values(saved);
      return saved;
    } catch (error) {
      throw new PostgresPlanRunRepositoryError("createVersion", version.tripId, error);
    }
  }

  async findVersionByRun(runId: string): Promise<PlanVersion | null> {
    try {
      const rows = await this.database.select().from(planVersions).where(eq(planVersions.runId, runId)).limit(1);
      return rows[0] ? toVersion(rows[0]) : null;
    } catch (error) {
      throw new PostgresPlanRunRepositoryError("findVersionByRun", runId, error);
    }
  }

  async findLatestVersion(tripId: string): Promise<PlanVersion | null> {
    try {
      const rows = await this.database.select().from(planVersions)
        .where(eq(planVersions.tripId, tripId))
        .orderBy(desc(planVersions.version))
        .limit(1);
      return rows[0] ? toVersion(rows[0]) : null;
    } catch (error) {
      throw new PostgresPlanRunRepositoryError("findLatestVersion", tripId, error);
    }
  }

  async fillPlanFacts(filled: FilledPlanFacts): Promise<boolean> {
    try {
      // Not one transaction (the Neon HTTP driver has none here): the version first, so a run
      // whose handoff moved on always has a version to match; sending the same facts again
      // finishes a half-done fill.
      const versions = await this.database.update(planVersions)
        .set({ tripState: filled.tripState, plan: filled.plan })
        .where(eq(planVersions.id, filled.versionId))
        .returning({ id: planVersions.id });
      if (versions.length === 0) return false;
      const runs = await this.database.update(planRuns)
        .set({ handoff: filled.handoff, handoffKey: filled.handoffKey })
        .where(eq(planRuns.id, filled.runId))
        .returning({ id: planRuns.id });
      return runs.length > 0;
    } catch (error) {
      throw new PostgresPlanRunRepositoryError("fillPlanFacts", filled.versionId, error);
    }
  }
}
