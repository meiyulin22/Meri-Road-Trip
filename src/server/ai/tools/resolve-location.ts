import { tool } from "ai";
import { z } from "zod";

import type { TripState } from "@/domain/trip-state/trip-state";
import type { LocationService } from "@/server/location/location-service";
import { logger, logEvents } from "@/server/observability/logger";

interface ResolveLocationToolContext {
  readonly tripState: TripState;
  readonly currentUserMessage: string;
  readonly requestId: string;
  readonly locationService: LocationService;
}

export function createResolveLocationTool({
  tripState,
  currentUserMessage,
  requestId,
  locationService,
}: ResolveLocationToolContext) {
  return tool({
    description:
      "Resolve a destination the user named into real-world location candidates when geographic identification or disambiguation is useful. Do not call for every message. Candidates are unconfirmed.",
    inputSchema: z.object({ query: z.string().trim().min(1).max(80) }),
    execute: async ({ query }) => {
      logger.info(
        { event: logEvents.locationToolRequested, requestId },
        "Location tool requested",
      );

      const destination = tripState.destination;
      const isAuthoritative = destination.state !== "missing" && destination.value === query;
      const isInCurrentMessage = currentUserMessage.includes(query);
      if (!isAuthoritative && !isInCurrentMessage) {
        logger.info(
          { event: logEvents.locationToolCompleted, requestId, status: "not_ready", candidateCount: 0 },
          "Location tool completed",
        );
        return { status: "not_ready" as const };
      }

      logger.info(
        {
          event: logEvents.locationToolExecuted,
          requestId,
          inputSource: isAuthoritative ? "trip_state" : "current_message",
        },
        "Location tool executed",
      );
      const result = isAuthoritative
        ? await locationService.resolve(tripState)
        : await locationService.resolveExpression(query);
      logger.info(
        {
          event: logEvents.locationToolCompleted,
          requestId,
          status: result.status,
          candidateCount: result.status === "candidates" ? result.candidates.length : 0,
        },
        "Location tool completed",
      );

      return result;
    },
  });
}
