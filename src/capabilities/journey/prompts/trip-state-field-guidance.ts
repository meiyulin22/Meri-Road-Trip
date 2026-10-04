import type { Locale } from "@/domain/locale/locale";
import { transportPreferences } from "@/domain/trip-draft/trip-draft";

/**
 * What TripState fields mean, written once for every prompt that proposes field
 * values. The first-message extractor and the workspace conversation each used to
 * carry their own copy and they drifted: only the extractor resolved a relative
 * date, so "明天" given on a later turn was stored as those two characters and
 * went stale the next day.
 */

export const certaintyStateGuidance = `Every field must use exactly one certainty state:
- known: the information is sufficiently definite.
- approximate: the user's intent is clear, but the value is intentionally broad, coarse, approximate, or expressed as a natural-language range.
- missing: the user did not provide the information; value must be null.
- ambiguous: the user provided multiple reasonable interpretations and choosing one would require an assumption.`;

export const tripStateFieldGuidance = `Field guidance:
- origin is where the user will depart from. Destination expressions belong in destinationEdit, not a text field.
- startDate and endDate use YYYY-MM-DD only when known. Approximate date expressions remain in the user's natural language.
- Resolve sufficiently definite relative dates, such as "明天", using the reference date and timezone.
- duration: an exact whole number of days is known and written as N天 with Arabic digits ("玩七天" → "7天", "7天6晚" → "7天"). Anything else preserves the user's expression, such as "一周" or "大概一周".
- The application derives the remaining one of startDate, endDate and duration when two are exact; counting is inclusive (2026-10-01 to 2026-10-07 is 7天).
- transportPreference may be known only as one of: ${transportPreferences.join(", ")}.
- A concise trip name may be inferred only from clearly supplied trip details.`;

/**
 * The field examples above are Chinese, and with only those to go on the model wrote
 * an English user's "a week" as 「一周」. Approximate values are shown to the user as
 * written, so they stay in the user's words; only an exact day count takes the 7天
 * form, which the application parses and shows as "7 days". Empty for Chinese, whose
 * prompts are locked as tuned.
 */
export const approximateWordingNote: Record<Locale, string> = {
  zh: "",
  en: `\n- Approximate values keep the user's own English words: "a week" stays "a week", "early November" stays "early November". Only an exact whole number of days takes the N天 form.`,
};
