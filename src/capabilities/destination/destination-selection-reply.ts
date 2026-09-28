import type { GeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { TripState } from "@/domain/trip-state/trip-state";
import { capturedDetailsNote, missingDetailsInvitation } from "@/capabilities/conversation/turn-reply";

export function destinationSelectionReply(
  tripState: TripState,
  readiness: GeneratePlanReadiness,
): string {
  if (tripState.destination.state !== "known") {
    throw new Error("Selected destination must be known before composing a reply.");
  }

  const acknowledgement = `好，目的地定为${tripState.destination.value}了。`;
  if (!readiness.canProceed) {
    switch (readiness.reason) {
      case "destination_missing":
        return `${acknowledgement}还需要确认目的地，才能开始规划。`;
      case "destination_ambiguous":
        return `${acknowledgement}还需要确定具体地点，才能开始规划。`;
      case "destination_unresolved":
        return `${acknowledgement}还需要一个更具体的地点，才能开始规划。`;
      case "provider_error":
        return `${acknowledgement}暂时无法确认规划准备情况，请稍后再试。`;
    }
  }

  const ready = "现在已经可以开始生成旅行计划。你可以直接告诉我开始生成，或者点击右侧的 Generate plan";
  return `${acknowledgement}${capturedDetailsNote(tripState)}${ready}${missingDetailsInvitation(tripState)}`;
}
