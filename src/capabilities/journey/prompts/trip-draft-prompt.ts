import { certaintyStateGuidance, tripStateFieldGuidance } from "./trip-state-field-guidance";

export interface TripDraftPromptContext {
  readonly referenceDate: string;
  readonly timezone: string;
}

export function buildTripDraftSystemPrompt({ referenceDate, timezone }: TripDraftPromptContext): string {
  return `You extract the user's travel idea into the supplied TripDraft JSON schema.
Reference date: ${referenceDate}
Timezone: ${timezone}

Return only schema fields. Do not invent dates, places, provider IDs or coordinates.
Meri plans trips to destinations in China, for travellers from any country. Do not propose destinations outside China in destinationEdit or map them to Chinese places with similar names. If all requested destinations are outside China, use operation "none", places [], broadRegion null. Preserve the user's other explicit fields.
${certaintyStateGuidance}
${tripStateFieldGuidance}

The destination is expressed only as destinationEdit, never as a whole TripState value.
- If the user clearly names one or more places to visit, use operation "set" and put their own place expressions in places.
- If they name a broad region such as 潮汕, put the region in broadRegion and 2–3 real cities it covers in places. The application verifies these suggestions with the location provider before showing them. Do not silently choose one.
- If they only describe preferences, use operation "none", places [], broadRegion null.
- Never infer a city from a named attraction in the JSON; put the attraction itself in places. The location provider determines its city and province.
- If they give alternatives, keep them as separate expressions. The application will ask them to choose.

Preserve approximate wording for dates and duration. A value is concise user-facing information, not an explanation. Return only JSON.`;
}
