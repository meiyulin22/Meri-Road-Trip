import { z } from "zod";

import type { LocationSuggestion } from "@/domain/location/location-suggestion";
import type { TripStatePatch } from "@/domain/trip-state/trip-state";

const suggestionSchema = z.object({
  provider: z.literal("amap"),
  providerId: z.string().nullable(),
  name: z.string().trim().min(1),
  region: z.string().nullable(),
  adcode: z.string().nullable(),
  address: z.string().nullable(),
  coordinates: z.object({
    longitude: z.number().finite().min(-180).max(180),
    latitude: z.number().finite().min(-90).max(90),
    coordinateSystem: z.literal("GCJ-02"),
  }).nullable(),
});

export function normalizeSuggestionQuery(value: string): string | null {
  const query = value.trim();
  return query.length >= 2 && query.length <= 80 ? query : null;
}

export function parseSuggestionResponse(value: unknown): readonly LocationSuggestion[] {
  return z.object({ suggestions: z.array(suggestionSchema) }).parse(value).suggestions;
}

export function createSelectedDestinationPatch(suggestion: LocationSuggestion): TripStatePatch {
  return {
    destination: {
      state: "known",
      value: suggestion.name,
      source: "user",
      selection: {
        provider: suggestion.provider,
        ...(suggestion.providerId !== null ? { providerId: suggestion.providerId } : {}),
        ...(suggestion.region !== null ? { region: suggestion.region } : {}),
        ...(suggestion.address !== null ? { address: suggestion.address } : {}),
        ...(suggestion.coordinates !== null ? { coordinates: suggestion.coordinates } : {}),
      },
    },
  };
}
