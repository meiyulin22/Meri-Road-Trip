CREATE TYPE "public"."trip_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "trip_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"role" "trip_message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_messages" ADD CONSTRAINT "trip_messages_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;