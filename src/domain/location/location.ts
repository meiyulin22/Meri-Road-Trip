export interface LocationCandidate {
  readonly providerId: string;
  readonly name: string;
  readonly region: string | null;
  readonly address: string | null;
  readonly longitude: number;
  readonly latitude: number;
  readonly coordinateSystem: "GCJ-02";
}
