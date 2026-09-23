import { PostgresJourneySummaryRepository } from "@/infrastructure/persistence/postgres/postgres-journey-summary-repository";
import { db } from "@/server/database/db";

export const journeySummaryRepository = new PostgresJourneySummaryRepository(db);
