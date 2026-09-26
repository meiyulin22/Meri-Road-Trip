CREATE TABLE "trip_user_actions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "trip_id" uuid NOT NULL,
  "type" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "trip_user_actions_type_check" CHECK ("type" = 'request_destination_recommendations')
);
--> statement-breakpoint
ALTER TABLE "trip_user_actions" ADD CONSTRAINT "trip_user_actions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
