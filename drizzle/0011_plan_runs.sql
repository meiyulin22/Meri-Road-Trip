CREATE TYPE "public"."plan_run_status" AS ENUM('running', 'succeeded', 'failed', 'interrupted');--> statement-breakpoint
CREATE TABLE "plan_run_events" (
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "plan_run_events_run_id_seq_pk" PRIMARY KEY("run_id","seq")
);
--> statement-breakpoint
CREATE TABLE "plan_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"status" "plan_run_status" NOT NULL,
	"handoff" jsonb NOT NULL,
	"handoff_key" text NOT NULL,
	"error_code" text,
	"usage" jsonb,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "plan_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"trip_state" jsonb NOT NULL,
	"preferences" jsonb NOT NULL,
	"plan" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "plan_versions_run_id_unique" UNIQUE("run_id"),
	CONSTRAINT "plan_versions_trip_version_unique" UNIQUE("trip_id","version")
);
--> statement-breakpoint
ALTER TABLE "plan_run_events" ADD CONSTRAINT "plan_run_events_run_id_plan_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."plan_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_runs" ADD CONSTRAINT "plan_runs_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_run_id_plan_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."plan_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_runs_trip_started_idx" ON "plan_runs" USING btree ("trip_id","started_at");