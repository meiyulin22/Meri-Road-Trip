import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import type { TripState } from "@/domain/trip-state/trip-state";

import { trips } from "./trips";

export const tripStates = pgTable("trip_states", {
  tripId: uuid("trip_id")
    .primaryKey()
    .references(() => trips.id, { onDelete: "cascade" }),
  state: jsonb("state").$type<TripState>().notNull(),
  createdAt: timestamp("created_at", {
    mode: "string",
    withTimezone: true,
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "string",
    withTimezone: true,
  }).notNull(),
});
