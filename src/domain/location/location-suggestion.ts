export interface LocationSuggestion {
  readonly provider: "amap";
  /** InputTips ID; it is not necessarily a POI ID. */
  readonly providerId: string | null;
  readonly name: string;
  readonly region: string | null;
  readonly adcode: string | null;
  readonly address: string | null;
  readonly coordinates: {
    readonly longitude: number;
    readonly latitude: number;
    readonly coordinateSystem: "GCJ-02";
  } | null;
}
