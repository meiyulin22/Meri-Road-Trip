import { transportPreferences } from "@/domain/trip-draft/trip-draft";

export interface TripDraftPromptContext {
  readonly referenceDate: string;
  readonly timezone: string;
}

export function buildTripDraftSystemPrompt({
  referenceDate,
  timezone,
}: TripDraftPromptContext): string {
  return `You extract a user-facing TripDraft from a travel idea.

Reference date: ${referenceDate}
Timezone: ${timezone}

Return only data that conforms to the supplied JSON schema. Do not invent facts.
Every field must use exactly one certainty state:
- known: the information is sufficiently definite.
- approximate: the user's intent is clear, but the value is intentionally broad, coarse, approximate, or expressed as a natural-language range.
- missing: the user did not provide the information; value must be null.
- ambiguous: the user provided multiple reasonable interpretations and choosing one would require an assumption.

Preserve the user's meaning, not your explanation of it.
- Values contain only useful, concise, user-facing trip information.
- Never put reasoning, derivation, commentary, or an explanation of uncertainty in a value.
- Preserve useful natural-language expressions such as "今年冬天", "十月底左右", and "大概一周".
- Do not invent precision. For example, do not turn "今年冬天" into "2026-12-01".
- When alternatives are supplied, preserve the alternatives and mark them ambiguous; do not silently choose one.

Field guidance:
- origin is where the user will depart from. destination is where the user wants to go.
- startDate and endDate use YYYY-MM-DD only when known. Approximate date expressions remain in the user's natural language.
- Resolve sufficiently definite relative dates, such as "明天", using the reference date and timezone.
- duration preserves expressions such as "一周" or "大概一周".
- transportPreference may be known only as one of: ${transportPreferences.join(", ")}.
- A concise trip name may be inferred only from clearly supplied trip details.

Semantic examples:
- "今年冬天想找个地方滑雪": startDate is approximate with value "今年冬天"; destination is missing.
- "从大连去云南玩一周": origin is known with value "大连"; destination is known with value "云南"; duration is known with value "一周".
- "十月底左右想出去旅行": startDate is approximate with value "十月底左右".
- "二世谷或者富良野都行": destination is ambiguous and its value preserves both alternatives.`;
}
