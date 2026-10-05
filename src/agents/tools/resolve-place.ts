import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { LocationService, type LocationResolveResult } from "@/capabilities/destination/location-service";
import type { LocationCandidate } from "@/domain/location/location";
import { AmapLocationProvider } from "@/platform/location-provider/amap-location-provider";

const maxPlaces = 5;

const placeSchema = z.object({
  name: z.string(),
  province: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  kind: z.enum(["sight", "other", "unknown"]),
  longitude: z.number(),
  latitude: z.number(),
});

const resolvePlaceOutput = z.object({
  status: z.enum(["resolved", "ambiguous", "area", "unresolved", "provider_error"]),
  /** A whole province when status is "area"; the place is not a point then. */
  province: z.string().nullable(),
  places: z.array(placeSchema),
});

function place(candidate: LocationCandidate): z.infer<typeof placeSchema> {
  return {
    name: candidate.name, province: candidate.province, city: candidate.city, district: candidate.district,
    kind: candidate.kind ?? "unknown", longitude: candidate.longitude, latitude: candidate.latitude,
  };
}

/** The provider's answer, reduced to what an agent can reason about. */
export function resolvePlaceAnswer(result: LocationResolveResult): z.infer<typeof resolvePlaceOutput> {
  switch (result.status) {
    case "resolved": return { status: "resolved", province: null, places: [place(result.candidate)] };
    case "ambiguous": return { status: "ambiguous", province: null, places: result.candidates.slice(0, maxPlaces).map(place) };
    case "area": return { status: "area", province: result.province, places: [] };
    case "provider_error": return { status: "provider_error", province: null, places: [] };
    default: return { status: "unresolved", province: null, places: [] };
  }
}

/**
 * Amap's identity check for one Chinese place name, the same one the Workspace uses
 * before a place is saved. Coordinates are GCJ-02. Finding a place says nothing about
 * whether it is open, safe or reachable.
 */
export function createResolvePlaceTool(resolve: (name: string) => Promise<LocationResolveResult>) {
  return createTool({
    id: "resolve-place",
    description: "Look up one place in China by its Chinese name (丽江, 玉龙雪山) with the Amap map provider. " +
      "Returns the matching place with province, city and GCJ-02 coordinates, several candidates when the name " +
      "is ambiguous, or the province when the name is a whole province. It does not say whether a place is open or reachable.",
    inputSchema: z.object({ name: z.string().min(1).max(40).describe("The place's Chinese name") }),
    outputSchema: resolvePlaceOutput,
    execute: async ({ name }) => resolvePlaceAnswer(await resolve(name)),
  });
}

export const resolvePlaceTool = createResolvePlaceTool((name) =>
  new LocationService(new AmapLocationProvider()).resolveExpression(name));
