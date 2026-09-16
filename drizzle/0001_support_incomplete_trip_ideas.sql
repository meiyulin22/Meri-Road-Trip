ALTER TABLE "trips" ALTER COLUMN "destination" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "start_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "end_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "origin" text;