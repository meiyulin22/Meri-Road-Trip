export interface LocationCandidate {
  readonly providerId: string;
  readonly name: string;
  /**
   * The administrative area the provider filed this place under. Amap answers a
   * POI search with these three levels separately, and a destination made of
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
  readonly coordinateSystem: "GCJ-02";
}
