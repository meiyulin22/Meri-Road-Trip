export type SpotEvidence = {
  readonly url: string;
  readonly title: string;
  readonly publishedAt: string | null;
  readonly checkedAt: string;
  readonly quote: string;
};

export type SpotCard = {
  readonly id: string;
  readonly province: string;
  readonly city: string;
  readonly name: string;
  readonly requested: boolean;
  readonly location: SpotEvidence | null;
  readonly opening: SpotEvidence | null;
  readonly reservation: SpotEvidence | null;
  readonly setting: SpotEvidence | null;
  readonly walking: SpotEvidence | null;
  readonly suggestedDuration: SpotEvidence | null;
};

/** One city's first-round research: its cards, and whether its search finished. */
export type CityResearch = {
  readonly province: string;
  readonly city: string;
  readonly status: "ready" | "partial" | "unavailable" | "deferred";
  readonly searchCalls: number;
  readonly spots: readonly SpotCard[];
};
