export type SpotEvidence = {
  readonly url: string;
  readonly title: string;
  readonly publishedAt: string | null;
  readonly checkedAt: string;
  readonly quote: string;
};

/**
 * Whether Tianditu finds the spot inside its own 市. Not finding it lowers trust but
 * keeps the card: Tianditu's data is incomplete. Unchecked means the check did not run
 * or stopped at a failure.
 */
export type SpotMapCheck =
  | {
    readonly status: "located";
    readonly district: string | null;
    /** Where the map draws it (CGCS2000); null on plans saved before 1.2100. */
    readonly point: { readonly longitude: number; readonly latitude: number } | null;
  }
  | { readonly status: "not_located" }
  | { readonly status: "unchecked" };

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
  readonly mapCheck: SpotMapCheck;
  /** What the second round found about opening on the trip's dates; absent until it runs. */
  readonly availability?: SpotAvailability;
};

/**
 * The second round's facts about when a spot is open, each with the quote it rests on.
 * Weekdays run 1 (Monday) to 7 (Sunday); ranges are month-day, "12-01" to "03-31", and may
 * cross the new year. A scope names the part that closes (a cable car, an area); null is the
 * whole spot. Notices too vague for a rule stay uncertain, with their quote.
 */
export type SpotAvailability = {
  readonly checkedAt: string;
  readonly hours: { readonly open: string; readonly close: string; readonly evidence: SpotEvidence } | null;
  readonly closedWeekdays: readonly { readonly weekday: number; readonly scope: string | null; readonly evidence: SpotEvidence }[];
  readonly closedRanges: readonly {
    readonly from: string;
    readonly to: string;
    readonly scope: string | null;
    readonly evidence: SpotEvidence;
  }[];
  readonly reservation: { readonly required: boolean; readonly daysAhead: number | null; readonly evidence: SpotEvidence } | null;
  readonly uncertain: readonly { readonly note: string; readonly evidence: SpotEvidence }[];
};

/** One city's first-round research: its cards, and whether its search finished. */
export type CityResearch = {
  readonly province: string;
  readonly city: string;
  readonly status: "ready" | "partial" | "unavailable" | "deferred";
  readonly searchCalls: number;
  readonly spots: readonly SpotCard[];
  /** Model tokens the city's research spent; absent on research saved before 1.2014. */
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number };
  /** Tianditu lookups the city's own map check made (1.2116); absent before it moved into research. */
  readonly mapLookups?: number;
};
