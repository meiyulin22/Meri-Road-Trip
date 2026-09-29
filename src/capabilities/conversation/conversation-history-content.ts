import type { TripMessage, TripMessagePresentation } from "@/domain/trip-message/trip-message";

export const shownDestinationCardsLabel = "[展示过的卡片]";
export const shownLocationCandidatesLabel = "[展示过的地点候选]";

/** Tells a model reading that history what the marked lines are. */
export const shownCardsGuidance = `In conversation history, a line starting with ${shownDestinationCardsLabel} or ${shownLocationCandidatesLabel} records the cards the screen showed with that assistant message. The user saw them as choices; what they picked is in the assistant message that follows and in TripState, and a card nobody picked is not a user decision. Never write such a line in your reply.`;

/**
 * The model's history channel carries only text, while the cards a turn showed live
 * in the message's presentation. Without them the history reads as a question the
 * user never answered: 「你想去哪几个？」 followed by something else, and the model
 * asks again with the same cards. So the cards are written out under the words they
 * were shown with, marked as what the screen offered rather than what anyone said.
 */
export function conversationHistoryContent(message: TripMessage): string {
  if (message.role !== "assistant" || !message.presentation) {
    return message.content;
  }
  return `${message.content}\n${presentationText(message.presentation)}`;
}

function presentationText(presentation: TripMessagePresentation): string {
  switch (presentation.type) {
    case "destination_recommendations":
      return `${shownDestinationCardsLabel} ${destinationCardsText(presentation.destinations)}`;
    case "location_candidates":
      return `${shownLocationCandidatesLabel} ${presentation.candidates
        .map((candidate) => candidate.region ? `${candidate.name}（${candidate.region}）` : candidate.name)
        .join("｜")}`;
  }
}

/**
 * Cards offered before places were grouped by province carry none, and they are
 * listed by name alone rather than filed under a province they were never given.
 */
function destinationCardsText(
  destinations: Extract<TripMessagePresentation, { type: "destination_recommendations" }>["destinations"],
): string {
  const groups = new Map<string | null, string[]>();
  for (const destination of destinations) {
    const names = groups.get(destination.province) ?? [];
    names.push(destination.name);
    groups.set(destination.province, names);
  }
  return [...groups]
    .map(([province, names]) => province === null ? names.join("、") : `${province}：${names.join("、")}`)
    .join("；");
}
