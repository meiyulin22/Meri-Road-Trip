import { resolveDestinationCandidates, type DestinationResolution } from "@/domain/location/destination-resolution-policy";
import type { LocationCandidate } from "@/domain/location/location";
import type { LocationProvider } from "@/platform/location-provider/location-provider";
import { logger, logEvents } from "@/platform/observability/logger";

export type LocationResolveResult =
  | { readonly status: "not_ready"; readonly reason: "destination_missing" }
  | DestinationResolution
  | { readonly status: "provider_error" };

export class LocationService {
  constructor(private readonly provider: LocationProvider) {}

  async resolveExpression(query: string): Promise<LocationResolveResult> {
    if (query.trim() === "") {
      return { status: "not_ready", reason: "destination_missing" };
    }
    const search = await this.search(query);
    return search.status === "success"
      ? resolveDestinationCandidates(query, search.candidates)
      : { status: "provider_error" };
  }

  /** The provider's matches for a query as they are, for a list the user picks from. */
  async search(query: string): Promise<
    | { readonly status: "success"; readonly candidates: readonly LocationCandidate[] }
    | { readonly status: "provider_error" }
  > {
    try {
      const search = await this.provider.searchByKeyword(query);
      if (search.status === "success") return search;
      logger.warn(
        { event: logEvents.locationResolveFailed, reason: search.reason },
        "Location resolve failed",
      );
      return { status: "provider_error" };
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
