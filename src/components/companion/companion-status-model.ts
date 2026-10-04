import type { Messages } from "@/components/i18n/messages";
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
function missingDetails(tripState: TripState, text: Messages["bear"]): string[] {
  const missing: string[] = [];
  if (tripState.origin.state === "missing") missing.push(text.origin);
  if ([tripState.startDate, tripState.endDate, tripState.duration].every((field) => field.state === "missing")) {
    missing.push(text.dates);
  }
  if (tripState.transportPreference.state === "missing") missing.push(text.transport);
  return missing;
}

/**
 * The bear's one line, decided from the saved Journey and the conversation, never by
 * the model: it is instant, free, and cannot claim something the state does not say.
 * A failure outranks everything, then Meri thinking, then whether a plan can be made.
 */
export function companionStatus(
  tripState: TripState,
  activity: ConversationActivity,
  words: Messages["bear"],
): CompanionStatus {
  if (activity === "error") {
    return { mood: "error", text: words.error };
  }
  if (activity === "thinking") {
    return { mood: "thinking", text: words.thinking };
  }

  const readiness = evaluateGeneratePlanReadiness(tripState);
  const missing = missingDetails(tripState, words);
  if (readiness.canProceed) {
    return missing.length === 0
      ? { mood: "ready", text: words.allSet }
      : { mood: "ready", text: words.readyMissing(missing) };
  }
  if (readiness.reason === "destination_unverified") {
    return { mood: "missing", text: words.reverify };
  }
  return { mood: "missing", text: words.needsDestination };
}
