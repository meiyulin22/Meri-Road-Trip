import { tool } from "ai";
import { z } from "zod";

import type { TripState } from "@/domain/trip-state/trip-state";
import type { LocationService } from "@/server/location/location-service";
import { logger, logEvents } from "@/server/observability/logger";

interface ResolveLocationToolContext {
  readonly tripState: TripState;
  readonly requestId: string;
  readonly locationService: LocationService;
}

export function createResolveLocationTool({
  tripState,
  requestId,
  locationService,
}: ResolveLocationToolContext) {
  return tool({
    description:
      "Resolve only the current Journey destination stored in TripState when the current user task needs geographic identification or disambiguation. The query must exactly match TripState.destination.value. Do not resolve origin or another place merely mentioned in conversation. A destination in TripState alone is not a reason to call this tool. Do not call for casual conversation, questions about Meri, or requests unrelated to geographic resolution. A resolved candidate is geographically matched, not user-confirmed TripState.",
    inputSchema: z.object({ query: z.string().trim().min(1).max(80) }),
    execute: async ({ query }) => {
      logger.info(
        { event: logEvents.locationToolRequested, requestId },
        "Location tool requested",
      );

      const destination = tripState.destination;
      if (destination.state === "missing" || destination.value !== query) {
        logger.info(
          { event: logEvents.locationToolCompleted, requestId, status: "not_ready", candidateCount: 0 },
          "Location tool completed",
        );
        return { status: "not_ready" as const, reason: "destination_missing_or_mismatch" as const };
      }

      logger.info(
        {
          event: logEvents.locationToolExecuted,
          requestId,
          inputSource: "trip_state",
        },
        "Location tool executed",
      );
      const result = await locationService.resolve(tripState);
      logger.info(
        {
          event: logEvents.locationToolCompleted,
          requestId,
          status: result.status,
          candidateCount: result.status === "ambiguous" ? result.candidates.length : result.status === "resolved" ? 1 : 0,
        },
        "Location tool completed",
      );

      return result;
    },
  });
}
