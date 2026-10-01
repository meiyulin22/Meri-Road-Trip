import { evaluateGeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { TripState } from "@/domain/trip-state/trip-state";

/** What the conversation is doing right now, as the companion needs to know it. */
export type ConversationActivity = "idle" | "thinking" | "error";

export type CompanionMood = "idle" | "thinking" | "ready" | "missing" | "error";

export interface CompanionStatus {
  readonly mood: CompanionMood;
  readonly text: string;
}

/** The optional details worth asking for, in the order a traveller would answer them. */
function missingDetails(tripState: TripState): string[] {
  const missing: string[] = [];
  if (tripState.origin.state === "missing") missing.push("出发地");
  if ([tripState.startDate, tripState.endDate, tripState.duration].every((field) => field.state === "missing")) {
    missing.push("出行时间");
  }
  if (tripState.transportPreference.state === "missing") missing.push("交通方式");
  return missing;
}

/**
 * The bear's one line, decided from the saved Journey and the conversation, never by
 * the model: it is instant, free, and cannot claim something the state does not say.
 * A failure outranks everything, then Meri thinking, then whether a plan can be made.
 */
export function companionStatus(tripState: TripState, activity: ConversationActivity): CompanionStatus {
  if (activity === "error") {
    return { mood: "error", text: "出错了，等我一下哦。刷新一下就能看到最新的状态。" };
  }
  if (activity === "thinking") {
    return { mood: "thinking", text: "我想想…" };
  }

  const readiness = evaluateGeneratePlanReadiness(tripState);
  const missing = missingDetails(tripState);
  if (readiness.canProceed) {
    return missing.length === 0
      ? { mood: "ready", text: "都齐啦，可以生成计划了！" }
      : { mood: "ready", text: `可以生成计划啦！再告诉我${missing.join("、")}，会更准。` };
  }
  if (readiness.reason === "destination_unverified") {
    return { mood: "missing", text: "之前记下的目的地要重新确认一下哦。" };
  }
  return { mood: "missing", text: "还差目的地。告诉我想去哪儿，或者说「帮我推荐几个地方」。" };
}
