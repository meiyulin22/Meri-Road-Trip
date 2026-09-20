import { PostgresTripStateRepository } from "@/infrastructure/persistence/postgres/postgres-trip-state-repository";
import { db } from "@/server/database/db";
import { tripRepository, tripService } from "@/server/trip/trip-service-instance";

import { JourneyService } from "./journey-service";

export const journeyService = new JourneyService({
  tripService,
  createTripStateRepository: (tripId) =>
    new PostgresTripStateRepository(db, tripId),
  deleteTripById: (tripId) => tripRepository.deleteById(tripId),
});
