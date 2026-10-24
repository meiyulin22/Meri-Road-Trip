import { resolveDestinationCandidates, type DestinationResolution } from "@/domain/location/destination-resolution-policy";
import type { LocationCandidate } from "@/domain/location/location";
import type { LocationProvider } from "@/platform/location-provider/location-provider";
import { logger, logEvents } from "@/platform/observability/logger";

export type LocationResolveResult =
  | { readonly status: "not_ready"; readonly reason: "destination_missing" }
  | DestinationResolution
  | { readonly status: "provider_error" };

export class LocationService {
  /**
   * `areas` is where the trip already is. It is passed to the provider unchanged and only
   * narrows where it looks first — never what the answer is; the resolution rules below
   * stay the same either way.
   */
  constructor(
    private readonly provider: LocationProvider,
    private readonly areas: readonly string[] = [],
    /**
     * The name a model says the map files this place under (苍山 → 点苍山), asked only after
     * the user's own words found nothing. The answer it finds is looked up under that name,
     * so it is never the user's exact words and the user still confirms it on a card.
     */
    private readonly officialNameOf: (query: string) => Promise<string | null> = async () => null,
  ) {}

  async resolveExpression(query: string): Promise<LocationResolveResult> {
    const resolution = await this.resolveWords(query);
    if (resolution.status !== "unresolved") return resolution;
    const official = (await this.officialNameOf(query))?.normalize("NFKC").trim() ?? "";
    if (official === "" || official === query.normalize("NFKC").trim() || official.length > 30) return resolution;
    return this.resolveWords(official);
  }

  private async resolveWords(query: string): Promise<LocationResolveResult> {
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
      const search = await this.provider.searchByKeyword(query, this.areas);
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
