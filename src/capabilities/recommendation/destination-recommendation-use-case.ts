import type { RecommendationScope, TripMessage } from "@/domain/trip-message/trip-message";
import { isDestinationOpenToRecommendations, type TripState } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";
import { buildConversationalDestinationRecommendationContext, type DestinationRecommendationContext } from "./destination-recommendation-context";
import { runDestinationRecommendationWorkflow, type DestinationRecommendationWorkflowResult } from "./destination-recommendation-workflow";

export interface DestinationRecommendationUseCaseDependencies {
  readonly runWorkflow: (context: DestinationRecommendationContext, requestId: string) => Promise<DestinationRecommendationWorkflowResult>;
}

export function destinationRecommendationDependencies(): DestinationRecommendationUseCaseDependencies {
  return { runWorkflow: runDestinationRecommendationWorkflow };
}

/**
 * Which cards, if any, a turn may promise. 「我想去云南，想爬山」 names a province, and only
 * the provider knows that: the turn adds 云南省 with no place inside it. So openness is
 * read from the state the turn left, never from the proposal — reading the proposal
 * closed 「去哪」 on the exact turn that opened it.
 *
 * Asking to widen a trip that has nothing saved yet is just asking where to go, so it
 * is answered the same way.
 */
export function recommendationScopeForTurn(
  interpretation: WorkspaceConversationInterpretation,
  stateAfterWrite: TripState,
): RecommendationScope | null {
  const destination = stateAfterWrite.destination;
  switch (interpretation.presentationIntent) {
    case "none":
      return null;
    case "destination_recommendations":
      return isDestinationOpenToRecommendations(destination, "within") ? "within" : null;
    case "destination_recommendations_elsewhere":
      if (isDestinationOpenToRecommendations(destination, "elsewhere")) return "elsewhere";
      return isDestinationOpenToRecommendations(destination, "within") ? "within" : null;
  }
}

/** What the cards for a pending reply are built from, read back out of the stored conversation. */
export type PendingRecommendationRequest =
  | { readonly status: "found"; readonly scope: RecommendationScope; readonly userText: string;
    readonly earlierMessages: readonly TripMessage[] }
  | { readonly status: "not_found" };

/**
 * The cards answer the user message the pending reply answered, with the conversation
 * as it stood before it. Nothing about the request is sent by the browser: what it
 * asked for is whatever was stored, so a reload or a retry asks for the same cards.
 */
export function pendingRecommendationRequest(
  messages: readonly TripMessage[],
  pendingMessageId: string,
): PendingRecommendationRequest {
  const index = messages.findIndex((message) => message.id === pendingMessageId);
  const pending = messages[index];
  const user = messages[index - 1];
  if (pending?.role !== "assistant" || pending.presentation?.type !== "destination_recommendations_pending" ||
    user?.role !== "user") {
    return { status: "not_found" };
  }
  return { status: "found", scope: pending.presentation.scope, userText: user.content,
    earlierMessages: messages.slice(0, index - 1) };
}

/**
 * The state may have moved on since the reply promised cards — a place picked on the
 * right — and cards for a question that is no longer open would argue with that.
 */
export async function createPendingRecommendations(input: {
  readonly tripId: string;
  readonly tripState: TripState;
  readonly request: Extract<PendingRecommendationRequest, { status: "found" }>;
  readonly requestId: string;
}, dependencies: DestinationRecommendationUseCaseDependencies): Promise<DestinationRecommendationWorkflowResult | null> {
  if (!isDestinationOpenToRecommendations(input.tripState.destination, input.request.scope)) return null;
  const context = buildConversationalDestinationRecommendationContext(input.tripId, input.tripState,
    input.request.earlierMessages, input.request.userText, input.request.scope);
  return dependencies.runWorkflow(context, input.requestId);
}
