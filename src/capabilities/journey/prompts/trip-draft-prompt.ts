import { certaintyStateGuidance, tripStateFieldGuidance } from "./trip-state-field-guidance";

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
${certaintyStateGuidance}

Preserve the user's meaning, not your explanation of it.
- Values contain only useful, concise, user-facing trip information.
- Never put reasoning, derivation, commentary, or an explanation of uncertainty in a value.
- Preserve useful natural-language expressions such as "今年冬天", "十月底左右", and "大概一周".
- Do not invent precision. For example, do not turn "今年冬天" into "2026-12-01".
- When alternatives are supplied, preserve the alternatives and mark them ambiguous; do not silently choose one.

${tripStateFieldGuidance}

destinationDisambiguation is an auxiliary signal, not a TripState field. Return exactly {"state":"known","value":["place 1","place 2"]} for a destination naming a broad or fuzzy real-world area, using 2–3 distinct concise concrete place expressions appropriate to the user's idea. Preserve the user's original destination value. Otherwise return exactly {"state":"missing","value":null}. 青岛 and 大理 are direct; 潮汕, 川西, 江南, and 阿尔卑斯 may need concrete choices; do not invent alternatives for nonsense such as 导弹市. These are examples, not fixed mappings. Expressions contain only place names and optional geographic qualification; never include provider IDs, coordinates, or selection metadata. The application verifies every proposed candidate before showing it.

Semantic examples:
- "今年冬天想找个地方滑雪": startDate is approximate with value "今年冬天"; destination is missing.
- "从大连去大理玩一周": origin is known with value "大连"; destination is known with value "大理"; duration is known with value "一周"; destinationDisambiguation is {"state":"missing","value":null}.
- "十月底左右想出去旅行": startDate is approximate with value "十月底左右".
- "二世谷或者富良野都行": destination is ambiguous and its value preserves both alternatives.`;
}
