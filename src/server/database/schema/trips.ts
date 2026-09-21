import { sql } from "drizzle-orm";
import {
  check,
  date,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const tripStatusEnum = pgEnum("trip_status", ["idea", "planning"]);

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey(),
    ownerGuestId: uuid("owner_guest_id").notNull(),
    name: text("name").notNull(),
    origin: text("origin"),
    destination: text("destination"),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    status: tripStatusEnum("status").notNull(),
    createdAt: timestamp("created_at", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    check(
      "trips_end_date_not_before_start_date",
      sql`${table.endDate} >= ${table.startDate}`,
    ),
  ],
);
