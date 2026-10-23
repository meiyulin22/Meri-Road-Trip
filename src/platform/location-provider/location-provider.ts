import type { LocationCandidate } from "@/domain/location/location";

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
  /**
   * `areas` is where the trip already is — province, 市 or 区县 names from TripState — and
   * only narrows where a provider looks first. It never decides that a place is the one
   * the user meant: the name still has to match, and the user still confirms the choice.
   * A provider with nothing to narrow by ignores it.
   */
  searchByKeyword(query: string, areas?: readonly string[]): Promise<LocationSearchResult>;
}
