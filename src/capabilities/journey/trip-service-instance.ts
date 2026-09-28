import { db } from "@/platform/persistence/database/db";
import { PostgresTripRepository } from "@/platform/persistence/postgres/postgres-trip-repository";
import { TripService } from "./trip-service";

export const tripRepository = new PostgresTripRepository(db);

export const tripService = new TripService({ repository: tripRepository });
