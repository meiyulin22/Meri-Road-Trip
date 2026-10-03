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
    if (search.status !== "success") return { status: "provider_error" };
    const resolution = resolveDestinationCandidates(query, search.candidates);
    const expression = query.normalize("NFKC").trim();
    // Commercial POIs can fill the first page for a bare city name. One bounded
    // retry asks for the administrative name; it must be corroborated by metadata.
    if (resolution.status !== "unresolved" || search.candidates.length === 0 ||
      !/^[\p{Script=Han}]{2,12}$/u.test(expression) || /(?:省|市|区|县|州|镇|乡|村)$/u.test(expression)) {
      return resolution;
    }
    const cityName = `${expression}市`;
    const retry = await this.search(cityName);
    if (retry.status !== "success") return { status: "provider_error" };
    const administrativeCandidates = retry.candidates.filter((candidate) =>
      candidate.name === cityName && (candidate.city === cityName || candidate.district === cityName));
    return resolveDestinationCandidates(expression, administrativeCandidates);
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
