import { destinationText, type TripState } from "@/domain/trip-state/trip-state";
import { destinationAdditions, destinationAreasText } from "@/domain/trip-state/destination-areas";
import { capturedDetailsNote, missingDetailsInvitation, planReadyNote } from "@/capabilities/conversation/turn-reply";
import { evaluateGeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";

/**
 * Meri's answer when the user picks places from cards, which has no model reply of
 * its own. Readiness and the details still worth adding are said on the pick that
 * makes the Journey ready, not after every later pick: repeated four times in one
 * conversation, it buried what each pick changed.
 */
export function destinationSelectionReply(tripState: TripState, before: TripState): string {
  const text = destinationText(tripState.destination);
  if (text === null) {
    throw new Error("Selected destination must be set before composing a reply.");
  }
  const readiness = evaluateGeneratePlanReadiness(tripState);
  // A text-bearing destination is never missing, so the only way it is not ready is
  // an old record that was never verified. A whole province is ready.
  if (!readiness.canProceed) {
    return `好，目的地现在是${text}。${capturedDetailsNote(tripState)}之前保存的地点还需要重新搜索确认。`;
  }
  const added = destinationAdditions(areasOf(before), areasOf(tripState));
  const news = added.length === 0 ? "这些地点已经在旅程里了。" : `好，已加入${destinationAreasText(added)}。`;
  if (evaluateGeneratePlanReadiness(before).canProceed) {
    return news;
  }
  return `${news}${capturedDetailsNote(tripState)}${planReadyNote}${missingDetailsInvitation(tripState)}`;
}

function areasOf(tripState: TripState) {
  return tripState.destination.state === "known" ? tripState.destination.areas : [];
}
