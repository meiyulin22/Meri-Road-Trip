-- pg_trgm matches names; vector holds embeddings from step 3 of the catalog work.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "catalog_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] NOT NULL,
	"aliases_text" text NOT NULL,
	"province" text NOT NULL,
	"prefecture" text NOT NULL,
	"county" text,
	"summary" text NOT NULL,
	"tags" text[] NOT NULL,
	"tags_raw" text[] NOT NULL,
	"details" jsonb NOT NULL,
	"related" jsonb NOT NULL,
	"historical" jsonb,
	"source_refs" jsonb NOT NULL,
	"confidence" text NOT NULL,
	"source_count" integer NOT NULL,
	"search_text" text NOT NULL,
	"embedding" vector,
	"catalog_version" text NOT NULL,
	"imported_at" timestamp with time zone NOT NULL,
	CONSTRAINT "catalog_entries_kind_check" CHECK (kind IN ('spot', 'dish', 'restaurant', 'stay', 'transport', 'tip')),
	CONSTRAINT "catalog_entries_confidence_check" CHECK ("catalog_entries"."confidence" IN ('high', 'medium', 'low'))
);
--> statement-breakpoint
CREATE INDEX "catalog_entries_prefecture_kind_idx" ON "catalog_entries" USING btree ("prefecture","kind");--> statement-breakpoint
CREATE INDEX "catalog_entries_name_trgm_idx" ON "catalog_entries" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "catalog_entries_aliases_trgm_idx" ON "catalog_entries" USING gin ("aliases_text" gin_trgm_ops);