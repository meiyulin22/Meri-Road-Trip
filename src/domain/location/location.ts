/**
 * Each provider answers in its own coordinate system: Amap in GCJ-02, the shifted
 * system Chinese law requires for public maps, Tianditu in CGCS2000, the national
 * geodetic system. Meri never converts between them — a point is only ever drawn on
 * the map of the provider it came from — so every point says which one it is in.
 */
export const coordinateSystems = ["GCJ-02", "CGCS2000"] as const;
export type CoordinateSystem = (typeof coordinateSystems)[number];

export function isCoordinateSystem(value: unknown): value is CoordinateSystem {
  return coordinateSystems.includes(value as CoordinateSystem);
}

export interface LocationCandidate {
  readonly providerId: string;
  readonly name: string;
  /**
   * The administrative area the provider filed this place under. Amap and Tianditu
   * both answer a POI search with these three levels separately, and a destination made of
   * cities has to group them by province, so they are kept apart here instead of
   * being flattened on arrival. Any level can be absent: a POI outside mainland
   * China, or one the provider filed loosely, carries fewer of them.
   */
  readonly province: string | null;
  readonly city: string | null;
  readonly district: string | null;
  /** The three levels above, joined for display and for name matching. */
  readonly region: string | null;
  readonly address: string | null;
  readonly longitude: number;
  readonly latitude: number;
  readonly coordinateSystem: CoordinateSystem;
  /**
   * What the provider says the place is, reduced to the one thing Meri asks of it:
   * a sight people go to see (a scenic area, park, temple, museum), or anything
   * else — a ticket office, car park, stop, hotel or restaurant serving one. Absent
   * when the provider did not say, which is treated as not known to be a sight.
   */
  readonly kind?: LocationKind;
}

export type LocationKind = "sight" | "other";
