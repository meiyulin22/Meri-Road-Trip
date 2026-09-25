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

export class InvalidLocationSuggestionQueryError extends Error {
  constructor() {
    super("Query must contain 1 to 80 characters after trimming.");
    this.name = "InvalidLocationSuggestionQueryError";
  }
}

export class LocationSuggestionProviderError extends Error {
  constructor(readonly reason: LocationSuggestionFailureReason) {
    super(`Location suggestions unavailable: ${reason}.`);
    this.name = "LocationSuggestionProviderError";
  }
}

export class LocationSuggestionService {
  constructor(private readonly provider: LocationSuggestionProvider) {}

  async suggest(rawQuery: string): Promise<readonly LocationSuggestion[]> {
    const query = rawQuery.trim();
    if (query.length === 0 || query.length > 80) {
      throw new InvalidLocationSuggestionQueryError();
    }

    const result = await this.provider.suggest(query);
    if (result.status === "failure") {
      throw new LocationSuggestionProviderError(result.reason);
    }
    return result.suggestions;
  }
}
