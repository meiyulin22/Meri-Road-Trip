import { PostgresTripMessageRepository } from "@/infrastructure/persistence/postgres/postgres-trip-message-repository";
import { db } from "@/server/database/db";
import { tripService } from "@/server/trip/trip-service-instance";

import { TripMessageService } from "./trip-message-service";

export const tripMessageService = new TripMessageService({
  tripService,
  repository: new PostgresTripMessageRepository(db),
});
