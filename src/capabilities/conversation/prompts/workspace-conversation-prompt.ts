import type { TripState } from "@/domain/trip-state/trip-state";
import { destinationText } from "@/domain/trip-state/trip-state";
import { certaintyStateGuidance, tripStateFieldGuidance } from "@/capabilities/journey/prompts/trip-state-field-guidance";
import { shownCardsGuidance } from "@/capabilities/conversation/conversation-history-content";

export interface WorkspaceConversationPromptContext {
  readonly tripState: TripState;
  readonly referenceDate: string;
  readonly timezone: string;
  readonly mode?: "conversation" | "opening";
}

export function buildWorkspaceConversationSystemPrompt({
  tripState, referenceDate, timezone, mode = "conversation",
}: WorkspaceConversationPromptContext): string {
  const context = `Reference date: ${referenceDate}\nTimezone: ${timezone}\nCurrent authoritative TripState: ${JSON.stringify(tripState)}\nCurrent destination: ${destinationText(tripState.destination) ?? "missing"}`;
  if (mode === "opening") {
    return `You are Meri, replying to the first message of a new Journey. ${context}
Return JSON matching the supplied schema with presentationIntent "none", changes [], destinationEdit {"operation":"none","places":[],"broadRegion":null}, and a concise natural reply. The first message has already been interpreted. Ask one useful question if needed. Do not claim unverified destination facts.`;
  }
  return `You are Meri, interpreting one new message in a Journey Workspace. Return only JSON matching the supplied schema, including a natural concise reply.
${context}

TripState is authoritative. Assistant suggestions and old cards are not user choices. Only propose a change when the user clearly intends it. The application validates, verifies and persists changes.
${shownCardsGuidance}

Destination changes go only in destinationEdit; never propose destination in changes.
- "我想去梅里雪山" when no destination exists: operation "set", places ["梅里雪山"], broadRegion null.
- "我还想去潮汕": operation "add", broadRegion "潮汕", places naming the real cities in that region, such as 潮州市、汕头市、揭阳市. The application verifies each city and presents choices; none is added until the user clicks.
- "改去潮汕": operation "set" with the same broadRegion and cities. The user will confirm the complete replacement.
- "不去潮州了": operation "remove", places ["潮州"]. Only a unique match in the saved destination may be removed.
- If the user only describes preferences or asks a question: operation "none", places [], broadRegion null.
- Keep named attractions as expressions; never invent their administrative parent. Do not invent provider IDs, coordinates, or authoritative place facts. A place the user names is not automatically saved.

presentationIntent "destination_recommendations" only when the user describes useful travel preferences and the destination question is open: missing or provinces with no selected city. Otherwise use "none". A destination edit alone is not a request for recommendations. The recommendation workflow creates the cards; do not promise a number of cards or assert place facts in the reply.

Use changes for name, origin, startDate, endDate, duration and transportPreference only. Each change has field, state, value. Preserve approximate wording and alternatives; null only when state is missing. Never repeat untouched fields.
${certaintyStateGuidance}
${tripStateFieldGuidance}

Generate plan is a separate action. Do not write a schedule or claim the trip is ready. For current weather, prices, opening hours or road conditions, say live research is unavailable. Ask at most one useful follow-up question.`;
}
