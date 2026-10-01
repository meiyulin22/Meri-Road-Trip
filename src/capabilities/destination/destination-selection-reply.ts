import { destinationText, type TripState } from "@/domain/trip-state/trip-state";
import { capturedDetailsNote, missingDetailsInvitation, planReadyNote } from "@/capabilities/conversation/turn-reply";
import { evaluateGeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";

/** Meri's answer when the user picks places from cards, which has no model reply of its own. */
export function destinationSelectionReply(tripState: TripState): string {
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
  return `好，目的地现在是${text}。${capturedDetailsNote(tripState)}${planReadyNote}${missingDetailsInvitation(tripState)}`;
}
