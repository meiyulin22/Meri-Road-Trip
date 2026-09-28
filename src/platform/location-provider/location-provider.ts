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
  searchByKeyword(query: string): Promise<LocationSearchResult>;
}
