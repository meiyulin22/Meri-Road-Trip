import { type TripState } from "@/domain/trip-state/trip-state";
import { addToDestination, destinationAreasText, type DestinationArea } from "@/domain/trip-state/destination-areas";
import { evaluateGeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { DestinationEditResult } from "@/capabilities/destination/apply-destination-edit";

import type { MeriReplies } from "./meri-replies";

/**
 * Every sentence Meri says about its own bookkeeping is composed here, from the
 * wording in meri-replies.ts for the visitor's language. Code outside this module
 * either passes the model's own wording through or asks this module for a sentence,
 * so one fact never gets two phrasings.
 */


/**
 * The one copy of "which Journey details are still worth asking about". Used
 * where no model reply exists for the turn, such as an explicit card selection.
 */
export function capturedDetailsNote(tripState: TripState, replies: MeriReplies): string {
  const dateKnown = tripState.startDate.state === "known" || tripState.endDate.state === "known";
  const durationKnown = tripState.duration.state === "known";
  if (dateKnown && durationKnown) return replies.captured.both;
  if (dateKnown) return replies.captured.dates;
  if (durationKnown) return replies.captured.duration;
  return "";
}

/**
 * Readiness is the application's own bookkeeping — the prompt forbids the model from
 * claiming it — and the button is named rather than placed, because there is one in
 * the conversation as well as one in Journey overview. Origin belongs on the list of
 * what is still worth adding: a plan has to know where the user leaves from, and
 * settling the destination is the moment that becomes the next useful question.
 */
export function planReadyInvitation(tripState: TripState, replies: MeriReplies): string {
  const missing = [
    tripState.origin.state === "missing" ? replies.missing.origin : null,
    tripState.startDate.state === "missing" && tripState.endDate.state === "missing" ? replies.missing.startDate : null,
    tripState.duration.state === "missing" ? replies.missing.days : null,
  ].filter((detail): detail is string => detail !== null);
  return replies.planReadyInviting(missing);
}

/**
 * The model's words above recommendation cards, without any question in them. The
 * cards are the question on that turn, and a sentence asking for dates beside them
 * asked two things at once — the prompt forbids it, but the model still wrote one.
 */
export function recommendationLeadIn(modelReply: string, replies: MeriReplies): string {
  const sentences = modelReply.match(/[^。！？!?.]+[。！？!?.]*/gu) ?? [];
  const kept = sentences.filter((sentence) => !/[？?]\s*$/u.test(sentence)).join("").trim();
  return kept === "" ? replies.leadInFallback : kept;
}

/**
 * What a destination edit did, said as facts the application established, then the
 * model's own reply when nothing needs the user's attention first. A card or a name
 * that could not be found is the turn's news, and the model wrote its reply before
 * either was known, so then its reply is left out.
 *
 * Readiness is announced once, on the turn that makes the Journey ready: repeating it
 * after every added place buried what each turn actually changed.
 */
export function destinationEditReply(
  result: DestinationEditResult,
  modelReply: string,
  before: TripState,
  after: TripState,
  replies: MeriReplies,
): string {
  const names = (items: readonly string[]) => replies.quoted(replies.list(items));
  const facts: string[] = [];
  const added = result.added.reduce<readonly DestinationArea[]>((areas, pick) => addToDestination(areas, pick), []);
  if (added.length > 0) facts.push(replies.added(destinationAreasText(added)));
  if (result.choices) facts.push(replies.offered(result.choices.answering));
  if (result.ambiguousRemovals.length) {
    if (result.changed) facts.push(replies.removedConfirmable);
    facts.push(replies.ambiguousRemoval(names(result.ambiguousRemovals)));
  } else if (result.notInDestination.length) {
    if (result.changed) facts.push(replies.removedConfirmable);
    facts.push(replies.notInDestination(names(result.notInDestination)));
  }
  const somethingHappened = facts.length > 0;
  if (result.lookupFailed.length) {
    facts.push(somethingHappened ? replies.lookupFailedFor(names(result.lookupFailed)) : replies.lookupFailed);
  }
  if (result.unresolved.length) {
    facts.push(somethingHappened || result.lookupFailed.length
      ? replies.notFoundToo(names(result.unresolved))
      : replies.notFound(names(result.unresolved)));
  }
  // Cards are Meri's best reading of the name, and a miss is a dead end; either way the
  // user can still look the place up themselves in the destination editor.
  const searchHint = result.choices ? replies.searchAfterOffer
    : result.unresolved.length ? replies.searchAfterMiss : "";
  const needsAttention = result.choices !== null || result.unresolved.length > 0 || result.lookupFailed.length > 0 ||
    result.ambiguousRemovals.length > 0 || result.notInDestination.length > 0;
  const becameReady = !evaluateGeneratePlanReadiness(before).canProceed && evaluateGeneratePlanReadiness(after).canProceed;
  return replies.join([...facts, searchHint, becameReady ? replies.planReady : "", needsAttention ? "" : modelReply]);
}
