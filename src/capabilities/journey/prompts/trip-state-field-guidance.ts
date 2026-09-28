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
- origin is where the user will depart from. destination is where the user wants to go.
- startDate and endDate use YYYY-MM-DD only when known. Approximate date expressions remain in the user's natural language.
- Resolve sufficiently definite relative dates, such as "明天", using the reference date and timezone.
- duration preserves expressions such as "一周" or "大概一周".
- transportPreference may be known only as one of: ${transportPreferences.join(", ")}.
- A concise trip name may be inferred only from clearly supplied trip details.`;
