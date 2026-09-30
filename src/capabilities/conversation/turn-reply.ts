import { type TripState } from "@/domain/trip-state/trip-state";

/**
 * Every sentence Meri says about its own bookkeeping is written here, and only
 * here. Code outside this module either passes the model's own wording through
 * or asks this module for a sentence, so one fact never gets two phrasings.
 */


/**
 * The one sentence that says a plan can now be generated, without its closing
 * punctuation so a caller can continue it. Readiness is the application's own
 * bookkeeping — the prompt forbids the model from claiming it — and the button is
 * named rather than placed, because there is now one in the conversation as well
 * as one in Journey overview.
 */
export const planReadyNote = "现在已经可以开始生成旅行计划。你可以直接告诉我开始生成，或者点击 Generate plan";

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
