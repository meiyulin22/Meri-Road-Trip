CREATE TYPE "public"."trip_status" AS ENUM('idea', 'planning');--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"destination" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "trip_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "trips_end_date_not_before_start_date" CHECK ("trips"."end_date" >= "trips"."start_date")
);
