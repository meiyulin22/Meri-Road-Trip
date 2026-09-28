import { PostgresTripMessageRepository } from "@/platform/persistence/postgres/postgres-trip-message-repository";
import { db } from "@/platform/persistence/database/db";
import { tripService } from "@/capabilities/journey/trip-service-instance";

import { TripMessageService } from "./trip-message-service";

export const tripMessageService = new TripMessageService({
  tripService,
  repository: new PostgresTripMessageRepository(db),
});
