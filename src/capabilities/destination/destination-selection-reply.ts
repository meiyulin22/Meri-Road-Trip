import { destinationText, type TripState } from "@/domain/trip-state/trip-state";
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
  if (evaluateGeneratePlanReadiness(before).canProceed) {
    return `好，目的地现在是${text}。`;
  }
  return `好，目的地现在是${text}。${capturedDetailsNote(tripState)}${planReadyNote}${missingDetailsInvitation(tripState)}`;
}
