import { destinationText, type TripState } from "@/domain/trip-state/trip-state";
import { destinationAdditions, destinationAreasText } from "@/domain/trip-state/destination-areas";
import { capturedDetailsNote, planReadyInvitation } from "@/capabilities/conversation/turn-reply";
import type { MeriReplies } from "@/capabilities/conversation/meri-replies";
import { evaluateGeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";

/**
 * Meri's answer when the user picks places from cards, which has no model reply of
 * its own. Readiness and the details still worth adding are said on the pick that
 * makes the Journey ready, not after every later pick: repeated four times in one
 * conversation, it buried what each pick changed.
 */
export function destinationSelectionReply(tripState: TripState, before: TripState, replies: MeriReplies): string {
  const text = destinationText(tripState.destination);
  if (text === null) {
    throw new Error("Selected destination must be set before composing a reply.");
  }
  const readiness = evaluateGeneratePlanReadiness(tripState);
  // A text-bearing destination is never missing, so the only way it is not ready is
  // an old record that was never verified. A whole province is ready.
  if (!readiness.canProceed) {
    return replies.join([replies.destinationIs(text), capturedDetailsNote(tripState, replies), replies.reverifySaved]);
  }
  const added = destinationAdditions(areasOf(before), areasOf(tripState));
  const news = added.length === 0 ? replies.alreadyInJourney : replies.pickedAdded(destinationAreasText(added));
  if (evaluateGeneratePlanReadiness(before).canProceed) {
    return news;
  }
  return replies.join([news, capturedDetailsNote(tripState, replies), planReadyInvitation(tripState, replies)]);
}

function areasOf(tripState: TripState) {
  return tripState.destination.state === "known" ? tripState.destination.areas : [];
}
