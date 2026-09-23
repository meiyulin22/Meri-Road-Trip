ALTER TABLE "trips" DROP CONSTRAINT "trips_end_date_not_before_start_date";--> statement-breakpoint
ALTER TABLE "trips" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "trips" DROP COLUMN "origin";--> statement-breakpoint
ALTER TABLE "trips" DROP COLUMN "destination";--> statement-breakpoint
ALTER TABLE "trips" DROP COLUMN "start_date";--> statement-breakpoint
ALTER TABLE "trips" DROP COLUMN "end_date";