ALTER TABLE "trips" ADD COLUMN "owner_guest_id" uuid;
--> statement-breakpoint
UPDATE "trips"
SET "owner_guest_id" = gen_random_uuid()
WHERE "owner_guest_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "owner_guest_id" SET NOT NULL;
