import { db } from "@/platform/persistence/database/db";
import { PostgresTripPreferenceRepository } from "@/platform/persistence/postgres/postgres-trip-preference-repository";

export const tripPreferenceRepository = new PostgresTripPreferenceRepository(db);
