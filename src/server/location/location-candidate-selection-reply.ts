import type { GeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { TripState } from "@/domain/trip-state/trip-state";

export function locationCandidateSelectionReply(
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

  const hasDate = tripState.startDate.state !== "missing" || tripState.endDate.state !== "missing";
  const hasDuration = tripState.duration.state !== "missing";
  const dateKnown = tripState.startDate.state === "known" || tripState.endDate.state === "known";
  const durationKnown = tripState.duration.state === "known";
  const captured = dateKnown && durationKnown ? "时间和行程时长也已经记下。" :
    dateKnown ? "时间也已经有了。" :
    durationKnown ? "行程时长也已经记下。" : "";
  const ready = "现在已经可以开始生成旅行计划。你可以直接告诉我开始生成，或者点击右侧的 Generate plan";
  const refinement = !hasDate && !hasDuration ? "；如果愿意，也可以继续补充出发时间和行程天数。" :
    !hasDate ? "；如果愿意，也可以继续补充出发时间。" :
    !hasDuration ? "；如果愿意，也可以继续补充行程天数。" : "。";
  return `${acknowledgement}${captured}${ready}${refinement}`;
}
