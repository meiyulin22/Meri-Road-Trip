import { db } from "@/server/database/db";
import { PostgresTripRepository } from "@/infrastructure/persistence/postgres/postgres-trip-repository";
import { TripService } from "./trip-service";

export const tripRepository = new PostgresTripRepository(db);

export const tripService = new TripService({ repository: tripRepository });
