import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { preferenceKinds, preferenceSources, preferenceStatuses } from "@/domain/plan/trip-preference";

import { tripMessages } from "./trip-messages";
import { trips } from "./trips";

export const tripPreferenceKindEnum = pgEnum("trip_preference_kind", preferenceKinds);
export const tripPreferenceSourceEnum = pgEnum("trip_preference_source", preferenceSources);
export const tripPreferenceStatusEnum = pgEnum("trip_preference_status", preferenceStatuses);

/** What a traveller wants from this trip: a label to show, a kind for code, their own words for the planner. */
export const tripPreferences = pgTable("trip_preferences", {
  id: uuid("id").primaryKey(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  kind: tripPreferenceKindEnum("kind").notNull(),
  quote: text("quote").notNull(),
  source: tripPreferenceSourceEnum("source").notNull(),
  messageId: uuid("message_id").references(() => tripMessages.id, { onDelete: "set null" }),
  status: tripPreferenceStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
}, (table) => [index("trip_preferences_trip_status_idx").on(table.tripId, table.status)]);
