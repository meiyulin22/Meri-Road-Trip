import type { LocationCandidate } from "@/domain/location/location";
import { evaluatePlanningReadiness } from "@/domain/trip-state/planning-readiness";
import type { TripState } from "@/domain/trip-state/trip-state";
import { logger, logEvents } from "@/server/observability/logger";

export type LocationSearchResult =
  | { readonly status: "success"; readonly candidates: readonly LocationCandidate[] }
  | {
      readonly status: "failure";
      readonly reason:
        | "missing_configuration"
        | "invalid_query"
        | "http_error"
        | "api_or_response_error"
        | "invalid_candidates"
        | "network_or_response_error";
    };

export interface LocationProvider {
  searchByKeyword(query: string): Promise<LocationSearchResult>;
}

export type LocationResolveResult =
  | { readonly status: "not_ready"; readonly reason: "destination_missing" }
  | { readonly status: "candidates"; readonly candidates: readonly LocationCandidate[] }
  | { readonly status: "no_candidates" }
  | { readonly status: "provider_error" };

export class LocationService {
  constructor(private readonly provider: LocationProvider) {}

  async resolve(tripState: TripState): Promise<LocationResolveResult> {
    const readiness = evaluatePlanningReadiness(tripState).locationResolve;
    if (!readiness.canAttempt) {
      return { status: "not_ready", reason: readiness.reason };
    }

    // Readiness permits every non-missing destination state, each with text.
    if (tripState.destination.state === "missing") {
      return { status: "not_ready", reason: "destination_missing" };
    }

    return this.resolveExpression(tripState.destination.value);
  }

  // A newly mentioned destination can be searched before a TripState update is persisted.
  // This never changes the authoritative state or confirms a candidate.
  async resolveExpression(query: string): Promise<LocationResolveResult> {
    if (query.trim() === "") {
      return { status: "not_ready", reason: "destination_missing" };
    }

    try {
      const search = await this.provider.searchByKeyword(query);
      if (search.status === "failure") {
        logger.warn(
          { event: logEvents.locationResolveFailed, reason: search.reason },
          "Location resolve failed",
        );
        return { status: "provider_error" };
      }

      return search.candidates.length === 0
        ? { status: "no_candidates" }
        : { status: "candidates", candidates: search.candidates };
    } catch {
      // Provider exceptions can contain a URL with the API key; never log them.
      logger.warn(
        { event: logEvents.locationResolveFailed, reason: "provider_exception" },
        "Location resolve failed",
      );
      return { status: "provider_error" };
    }
  }
}
