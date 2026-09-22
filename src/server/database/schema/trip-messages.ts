import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { tripMessageRoles } from "@/domain/trip-message/trip-message";

import { trips } from "./trips";

export const tripMessageRoleEnum = pgEnum(
  "trip_message_role",
  tripMessageRoles,
);

export const tripMessages = pgTable("trip_messages", {
  id: uuid("id").primaryKey(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  role: tripMessageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", {
    mode: "string",
    withTimezone: true,
  }).notNull(),
});
