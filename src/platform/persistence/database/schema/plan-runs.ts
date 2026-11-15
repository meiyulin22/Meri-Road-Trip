import { index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { planRunStatuses, type PlanRunUsage } from "@/domain/plan/plan-run";

import { trips } from "./trips";

export const planRunStatusEnum = pgEnum("plan_run_status", planRunStatuses);

/** One Generate plan run: the handoff it was given, how it ended and what it spent. */
export const planRuns = pgTable("plan_runs", {
  id: uuid("id").primaryKey(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  status: planRunStatusEnum("status").notNull(),
  /** Validated as a PlanHandoff when read. */
  handoff: jsonb("handoff").$type<unknown>().notNull(),
  handoffKey: text("handoff_key").notNull(),
  errorCode: text("error_code"),
  usage: jsonb("usage").$type<PlanRunUsage>(),
  startedAt: timestamp("started_at", { mode: "string", withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { mode: "string", withTimezone: true }),
  durationMs: integer("duration_ms"),
}, (table) => [index("plan_runs_trip_started_idx").on(table.tripId, table.startedAt)]);

/** The progress events of a run in order, so a page that reconnects catches up. */
export const planRunEvents = pgTable("plan_run_events", {
  runId: uuid("run_id")
    .notNull()
    .references(() => planRuns.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  type: text("type").notNull(),
  /** Validated as a PlanProgressEvent when read. */
  payload: jsonb("payload").$type<unknown>().notNull(),
  at: timestamp("at", { mode: "date", withTimezone: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.runId, table.seq] })]);

/** A saved plan with the TripState and preferences it was built from, numbered per trip. */
export const planVersions = pgTable("plan_versions", {
  id: uuid("id").primaryKey(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  runId: uuid("run_id")
    .notNull()
    .unique()
    .references(() => planRuns.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  /** Validated when read, like every other stored TripState. */
  tripState: jsonb("trip_state").$type<unknown>().notNull(),
  preferences: jsonb("preferences").$type<unknown>().notNull(),
  plan: jsonb("plan").$type<unknown>().notNull(),
  createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
}, (table) => [unique("plan_versions_trip_version_unique").on(table.tripId, table.version)]);
