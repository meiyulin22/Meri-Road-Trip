import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { TripUserAction } from "@/domain/trip-user-action/trip-user-action";
import { trips } from "./trips";

export const tripUserActions = pgTable("trip_user_actions", {
  id: uuid("id").primaryKey(),
  tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  type: text("type").$type<TripUserAction["type"]>().notNull(),
  createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
});
