CREATE TYPE "public"."trip_preference_pace" AS ENUM('packed', 'relaxed');--> statement-breakpoint
ALTER TABLE "trip_preferences" ADD COLUMN "pace" "trip_preference_pace";--> statement-breakpoint
ALTER TABLE "trip_preferences" ADD CONSTRAINT "trip_preferences_pace_kind_check" CHECK ("trip_preferences"."pace" IS NULL OR "trip_preferences"."kind" = 'pace');