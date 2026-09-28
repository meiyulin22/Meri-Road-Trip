import { PostgresJourneySummaryRepository } from "@/platform/persistence/postgres/postgres-journey-summary-repository";
import { db } from "@/platform/persistence/database/db";

export const journeySummaryRepository = new PostgresJourneySummaryRepository(db);
