import { db } from "@/server/database/db";
import { PostgresTripRepository } from "./postgres-trip-repository";
import { TripService } from "./trip-service";

const tripRepository = new PostgresTripRepository(db);

export const tripService = new TripService({ repository: tripRepository });
