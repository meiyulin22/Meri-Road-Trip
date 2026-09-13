import { InMemoryTripRepository } from "./in-memory-trip-repository";
import { TripService } from "./trip-service";

const tripRepository = new InMemoryTripRepository();

export const tripService = new TripService({ repository: tripRepository });
