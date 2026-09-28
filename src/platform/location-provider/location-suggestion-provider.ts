import type { LocationSuggestion } from "@/domain/location/location-suggestion";

export type LocationSuggestionFailureReason =
  | "missing_configuration"
  | "timeout"
  | "upstream_error"
  | "malformed_response";

export type LocationSuggestionProviderResult =
  | { readonly status: "success"; readonly suggestions: readonly LocationSuggestion[] }
  | { readonly status: "failure"; readonly reason: LocationSuggestionFailureReason };

export interface LocationSuggestionProvider {
  suggest(query: string): Promise<LocationSuggestionProviderResult>;
}
