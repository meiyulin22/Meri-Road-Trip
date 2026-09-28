import { PostgresTripStateRepository } from "@/platform/persistence/postgres/postgres-trip-state-repository";
import { db } from "@/platform/persistence/database/db";
import { tripRepository, tripService } from "./trip-service-instance";
import { tripMessageService } from "@/server/conversation/trip-message-service-instance";

import { JourneyService } from "./journey-service";

export const journeyService = new JourneyService({
  tripService,
  createTripStateRepository: (tripId) =>
    new PostgresTripStateRepository(db, tripId),
  deleteTripById: (tripId, ownerGuestId) =>
    tripRepository.deleteById(tripId, ownerGuestId),
  persistInitialUserMessage: (input) =>
    tripMessageService.persistInitialUserMessage(input),
  persistOpeningAssistant: (input) =>
    tripMessageService.persistOpeningAssistant(input),
});
