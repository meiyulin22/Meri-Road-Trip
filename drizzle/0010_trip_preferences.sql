CREATE TYPE "public"."trip_preference_kind" AS ENUM('pace', 'walking', 'companions', 'budget', 'diet', 'interests', 'avoid', 'other');--> statement-breakpoint
CREATE TYPE "public"."trip_preference_source" AS ENUM('conversation', 'plan_page', 'question');--> statement-breakpoint
CREATE TYPE "public"."trip_preference_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TABLE "trip_preferences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"label" text NOT NULL,
	"kind" "trip_preference_kind" NOT NULL,
	"quote" text NOT NULL,
	"source" "trip_preference_source" NOT NULL,
	"message_id" uuid,
	"status" "trip_preference_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_preferences" ADD CONSTRAINT "trip_preferences_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_preferences" ADD CONSTRAINT "trip_preferences_message_id_trip_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."trip_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_preferences_trip_status_idx" ON "trip_preferences" USING btree ("trip_id","status");