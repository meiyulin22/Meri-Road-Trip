import { type TripState } from "@/domain/trip-state/trip-state";
import { addToDestination, destinationAreasText, type DestinationArea } from "@/domain/trip-state/destination-areas";
import { evaluateGeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { DestinationEditResult } from "@/capabilities/destination/apply-destination-edit";

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
): string {
  const facts: string[] = [];
  const added = result.added.reduce<readonly DestinationArea[]>((areas, pick) => addToDestination(areas, pick), []);
  if (added.length > 0) facts.push(`已加入${destinationAreasText(added)}。`);
  if (result.choices) facts.push(`找到「${result.choices.answering}」相关的地点了，点击添加后才会记入旅程。`);
  if (result.ambiguousRemovals.length) {
    facts.push(`${result.changed ? "已移除能确认的地点。" : ""}「${result.ambiguousRemovals.join("、")}」对应多个已保存地点，请说得更具体一些。`);
  } else if (result.notInDestination.length) {
    facts.push(`${result.changed ? "已移除能确认的地点。" : ""}当前旅程里没有找到「${result.notInDestination.join("、")}」。`);
  }
  const somethingHappened = facts.length > 0;
  if (result.lookupFailed.length) {
    facts.push(somethingHappened
      ? `「${result.lookupFailed.join("、")}」查询暂时不可用。`
      : "地点查询暂时不可用，目的地没有改变。请稍后重试。");
  }
  if (result.unresolved.length) {
    facts.push(somethingHappened || result.lookupFailed.length
      ? `「${result.unresolved.join("、")}」暂时没找到。`
      : `暂时没找到「${result.unresolved.join("、")}」的可靠地点，目的地没有因此改变。`);
  }
  const needsAttention = result.choices !== null || result.unresolved.length > 0 || result.lookupFailed.length > 0 ||
    result.ambiguousRemovals.length > 0 || result.notInDestination.length > 0;
  const becameReady = !evaluateGeneratePlanReadiness(before).canProceed && evaluateGeneratePlanReadiness(after).canProceed;
  return `${facts.join("")}${becameReady ? `${planReadyNote}。` : ""}${needsAttention ? "" : modelReply}`;
}
