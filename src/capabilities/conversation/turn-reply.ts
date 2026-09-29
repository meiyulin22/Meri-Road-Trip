import type { TripState } from "@/domain/trip-state/trip-state";

/**
 * Every sentence Meri says about its own bookkeeping is written here, and only
 * here. Code outside this module either passes the model's own wording through
 * or asks this module for a sentence, so one fact never gets two phrasings.
 */

const otherFieldsSavedNote = "其他信息也一起记下了。";
const destinationUnchangedNote = "目的地暂时没有改动。";

/**
 * The one sentence that says a plan can now be generated, without its closing
 * punctuation so a caller can continue it. Readiness is the application's own
 * bookkeeping — the prompt forbids the model from claiming it — and the button is
 * named rather than placed, because there is now one in the conversation as well
 * as one in Journey overview.
 */
export const planReadyNote = "现在已经可以开始生成旅行计划。你可以直接告诉我开始生成，或者点击 Generate plan";

/**
 * What the turn actually did to the authoritative destination. This is a fact,
 * not a phrasing: the model proposes a change before anything is validated, so
 * its reply is written on the assumption that the change lands.
 */
export type DestinationTurnFact =
  | { readonly kind: "untouched" }
  | { readonly kind: "confirmed" }
  | { readonly kind: "unsettled" }
  | { readonly kind: "choice_pending" }
  /** A region was saved as the destination, with the places inside it still open. */
  | { readonly kind: "area_recorded" }
  | { readonly kind: "narrowing_offered"; readonly expression: string; readonly candidateCount: number }
  | { readonly kind: "not_identified"; readonly expression: string | null }
  | { readonly kind: "lookup_unavailable"; readonly expression: string | null };

/**
 * The deterministic sentence a fact requires, or null when the model's own
 * reply is already true and may stand.
 */
function sentenceForDestinationFact(fact: DestinationTurnFact): string | null {
  switch (fact.kind) {
    // The model assumed the change would land, and it did. Its reply answers
    // what the user actually said, so replacing it would only make Meri repeat
    // one fixed sentence on every destination change.
    case "untouched":
    case "confirmed":
    // The user named a region and the region was saved, so the model's reply —
    // written expecting exactly that — is true. A fixed sentence here would
    // answer 「我想去海南」 with bookkeeping instead of with 海南.
    case "area_recorded":
      return null;
    case "unsettled":
      return "我找到了与你描述相符的地点，但目的地还没有明确下来。想更具体时，可以告诉我你打算去哪里。";
    case "choice_pending":
      return "我找到几个可能的地点。你想去下面哪一个？";
    case "narrowing_offered":
      return fact.candidateCount === 1
        ? `「${fact.expression}」范围比较大，我找到一个更具体的地点。要把下方地点设为目的地吗？`
        : `「${fact.expression}」范围比较大，我找到几个更具体的地点，你更想去哪个？`;
    case "not_identified":
      return fact.expression === null
        ? `我还没能确认这个地点，${destinationUnchangedNote}能告诉我更具体的地名或所在地区吗？`
        : `请告诉我「${fact.expression}」中更具体的地点，${destinationUnchangedNote}`;
    case "lookup_unavailable":
      return fact.expression === null
        ? `地点查询暂时不可用，${destinationUnchangedNote}稍后可以再试一次。`
        : `暂时无法验证「${fact.expression}」的具体地点，${destinationUnchangedNote}请稍后再试。`;
  }
}

export function composeTurnReply(input: {
  readonly modelReply: string;
  readonly destination: DestinationTurnFact;
  readonly otherFieldsSaved: boolean;
}): string {
  const sentence = sentenceForDestinationFact(input.destination);
  const reply = sentence === null
    ? input.modelReply
    : input.otherFieldsSaved ? `${otherFieldsSavedNote}${sentence}` : sentence;
  // A confirmed destination is the moment a plan becomes possible, and the user has
  // no other way to learn it: the fields they are still being asked for are the
  // useful ones, not the required ones.
  return input.destination.kind === "confirmed" ? `${reply}${planReadyNote}。` : reply;
}

/**
 * The one copy of "which Journey details are still worth asking about". Used
 * where no model reply exists for the turn, such as an explicit card selection.
 */
export function capturedDetailsNote(tripState: TripState): string {
  const dateKnown = tripState.startDate.state === "known" || tripState.endDate.state === "known";
  const durationKnown = tripState.duration.state === "known";
  if (dateKnown && durationKnown) return "时间和行程时长也已经记下。";
  if (dateKnown) return "时间也已经有了。";
  if (durationKnown) return "行程时长也已经记下。";
  return "";
}

/**
 * Origin belongs on this list: a plan has to know where the user leaves from, and
 * settling the destination is the moment that becomes the next useful question.
 */
export function missingDetailsInvitation(tripState: TripState): string {
  const missing = [
    tripState.origin.state === "missing" ? "出发地" : null,
    tripState.startDate.state === "missing" && tripState.endDate.state === "missing" ? "出发时间" : null,
    tripState.duration.state === "missing" ? "行程天数" : null,
  ].filter((detail): detail is string => detail !== null);
  return missing.length === 0 ? "。" : `；如果愿意，也可以继续补充${missing.join("、")}。`;
}
