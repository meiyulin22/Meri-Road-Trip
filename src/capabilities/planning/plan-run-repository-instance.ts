import { db } from "@/platform/persistence/database/db";
import { PostgresPlanRunRepository } from "@/platform/persistence/postgres/postgres-plan-run-repository";

export const planRunRepository = new PostgresPlanRunRepository(db);
