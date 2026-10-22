import type { CoordinateSystem } from "./location";

/** The map providers Meri can verify places with; `MAP_PROVIDER` picks one. */
export const locationProviders = ["amap", "tianditu"] as const;
export type LocationProviderName = (typeof locationProviders)[number];

/** The one coordinate system each provider answers in; a point labelled otherwise is invalid. */
export const providerCoordinateSystem: Readonly<Record<LocationProviderName, CoordinateSystem>> = {
  amap: "GCJ-02",
  tianditu: "CGCS2000",
};

export function isLocationProviderName(value: unknown): value is LocationProviderName {
  return locationProviders.includes(value as LocationProviderName);
}

export interface LocationSuggestion {
  readonly provider: LocationProviderName;
  /** The provider's own ID for the suggestion; it is not necessarily a POI ID, and Tianditu gives none. */
  readonly providerId: string | null;
  readonly name: string;
  readonly region: string | null;
  /** The six-digit administrative code (GB/T 2260), e.g. 530702 for 古城区. */
  readonly adcode: string | null;
  readonly address: string | null;
  readonly coordinates: {
    readonly longitude: number;
    readonly latitude: number;
    readonly coordinateSystem: CoordinateSystem;
  } | null;
}
