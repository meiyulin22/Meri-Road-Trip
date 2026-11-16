import { z } from "zod";

/**
 * What a preference is about. Never shown: code reads it to set rules (fewer stops a day
 * for walking limits or companions) and, later, to see which kind is missing. The label
 * is what the traveller sees; the quote is what the planner reads.
 */
export const preferenceKinds = ["pace", "walking", "companions", "budget", "diet", "interests", "avoid", "other"] as const;
export type PreferenceKind = (typeof preferenceKinds)[number];

/** Where a preference came from: the Workspace conversation, the plan page, or an answer to Meri's question. */
export const preferenceSources = ["conversation", "plan_page", "question"] as const;
export type PreferenceSource = (typeof preferenceSources)[number];

export const preferenceStatuses = ["active", "removed"] as const;
export type PreferenceStatus = (typeof preferenceStatuses)[number];

/**
 * Which way a pace preference leans, never shown (1.2017): packed wants more in each day and
 * accepts a tight trip, relaxed wants fewer things and time to spare. The model judges it once,
 * when the preference is extracted or labelled; code then applies the rules. Only a pace
 * preference has one, and a pace preference that says neither (早上别太早) has none.
 */
export const paceDirections = ["packed", "relaxed"] as const;
export type PaceDirection = (typeof paceDirections)[number];

/** A direction kept only on a pace preference; on any other kind it means nothing and is dropped. */
export function paceFor(kind: PreferenceKind, pace: PaceDirection | null | undefined): PaceDirection | null {
  return kind === "pace" ? pace ?? null : null;
}

export const maxPreferenceLabelLength = 24;
export const maxPreferenceQuoteLength = 160;
export const maxActivePreferences = 30;

export type TripPreference = {
  readonly id: string;
  readonly tripId: string;
  readonly label: string;
  readonly kind: PreferenceKind;
  readonly pace: PaceDirection | null;
  readonly quote: string;
  readonly source: PreferenceSource;
  /** The user message the quote was checked against; null for one written on the plan page. */
  readonly messageId: string | null;
  readonly status: PreferenceStatus;
  readonly createdAt: string;
};

/** What the plan page and the planner receive: an active preference without its storage fields. */
export const planPreferenceSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(maxPreferenceLabelLength),
  kind: z.enum(preferenceKinds),
  // Plans saved and runs paused before 1.2017 have no direction.
  pace: z.enum(paceDirections).nullable().default(null),
  quote: z.string().trim().min(1).max(maxPreferenceQuoteLength),
  source: z.enum(preferenceSources),
  messageId: z.string().min(1).nullable(),
  createdAt: z.iso.datetime(),
}).refine(({ kind, pace }) => pace === null || kind === "pace", { message: "Only a pace preference has a direction.", path: ["pace"] });

export type PlanPreference = z.output<typeof planPreferenceSchema>;

export function toPlanPreference({ id, label, kind, pace, quote, source, messageId, createdAt }: TripPreference): PlanPreference {
  return { id, label, kind, pace, quote, source, messageId, createdAt };
}

/** The same words twice are one preference, however they were spaced. */
export function samePreferenceQuote(left: string, right: string): boolean {
  return left.normalize("NFKC").replace(/\s+/gu, "") === right.normalize("NFKC").replace(/\s+/gu, "");
}

/** Walking limits, companions such as parents or children, and a relaxed pace (1.2017) make a day lighter. */
export function maxStopsForPreferences(
  preferences: readonly { readonly kind: PreferenceKind; readonly pace?: PaceDirection | null }[],
  usual: number,
): number {
  const lighter = preferences.some(({ kind, pace }) => kind === "walking" || kind === "companions" || pace === "relaxed");
  return lighter ? Math.min(usual, 3) : usual;
}

/** The traveller wants a full trip: every city kept and no question whether to drop one (1.2017). */
export function wantsPackedPace(preferences: readonly { readonly pace?: PaceDirection | null }[]): boolean {
  return preferences.some(({ pace }) => pace === "packed");
}

/** The traveller wants an easy trip: fewer things and time to spare (1.2018). */
export function wantsRelaxedPace(preferences: readonly { readonly pace?: PaceDirection | null }[]): boolean {
  return preferences.some(({ pace }) => pace === "relaxed");
}
