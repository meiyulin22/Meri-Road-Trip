import {
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const tripStatusEnum = pgEnum("trip_status", ["idea", "planning"]);

export const trips = pgTable("trips", {
    id: uuid("id").primaryKey(),
    ownerGuestId: uuid("owner_guest_id").notNull(),
    status: tripStatusEnum("status").notNull(),
    createdAt: timestamp("created_at", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
});
