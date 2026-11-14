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

export const maxPreferenceLabelLength = 24;
export const maxPreferenceQuoteLength = 160;
export const maxActivePreferences = 30;

export type TripPreference = {
  readonly id: string;
  readonly tripId: string;
  readonly label: string;
  readonly kind: PreferenceKind;
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
  quote: z.string().trim().min(1).max(maxPreferenceQuoteLength),
  source: z.enum(preferenceSources),
  messageId: z.string().min(1).nullable(),
  createdAt: z.iso.datetime(),
});

export type PlanPreference = z.output<typeof planPreferenceSchema>;

export function toPlanPreference({ id, label, kind, quote, source, messageId, createdAt }: TripPreference): PlanPreference {
  return { id, label, kind, quote, source, messageId, createdAt };
}

/** The same words twice are one preference, however they were spaced. */
export function samePreferenceQuote(left: string, right: string): boolean {
  return left.normalize("NFKC").replace(/\s+/gu, "") === right.normalize("NFKC").replace(/\s+/gu, "");
}

/** Walking limits and companions such as parents or children make a day lighter. */
export function maxStopsForPreferences(preferences: readonly Pick<PlanPreference, "kind">[], usual: number): number {
  return preferences.some(({ kind }) => kind === "walking" || kind === "companions") ? Math.min(usual, 3) : usual;
}
