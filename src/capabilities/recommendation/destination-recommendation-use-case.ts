import type { TripMessage } from "@/domain/trip-message/trip-message";
import { isDestinationOpenToRecommendations, type TripState, type TripStatePatch } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";
import type { TripMessageService } from "@/capabilities/conversation/trip-message-service";
import { logEvents, logger } from "@/platform/observability/logger";
import { buildConversationalDestinationRecommendationContext, type DestinationRecommendationContext } from "./destination-recommendation-context";
import { runDestinationRecommendationWorkflow, type DestinationRecommendationWorkflowResult } from "./destination-recommendation-workflow";

export interface DestinationRecommendationUseCaseDependencies {
  readonly runWorkflow: (context: DestinationRecommendationContext, requestId: string) => Promise<DestinationRecommendationWorkflowResult>;
}

/**
 * 「我想去云南，想爬山」 names a province, and only the provider knows that: the model
 * proposes a plain known destination and the write turns it into an area with no place
 * chosen inside. So openness is read from the state the write produced, never from the
 * proposal — reading the proposal closed 「去哪」 on the exact turn that opened it.
 * A destination the user named that failed to land is the turn's news instead, and
 * cards would take the place of the sentence saying so.
 */
export function shouldCreateConversationalRecommendations(
  interpretation: WorkspaceConversationInterpretation,
  stateAfterWrite: TripState,
  destinationChange: { readonly proposed: boolean; readonly written: boolean },
): boolean {
  if (destinationChange.proposed && !destinationChange.written) return false;
  return interpretation.presentationIntent === "destination_recommendations" &&
    isDestinationOpenToRecommendations(stateAfterWrite.destination) &&
    interpretation.destinationDisambiguation?.state !== "known";
}

export async function createDestinationRecommendationReply(
  context: DestinationRecommendationContext,
  requestId: string,
  dependencies: DestinationRecommendationUseCaseDependencies,
): Promise<DestinationRecommendationWorkflowResult> {
  return dependencies.runWorkflow(context, requestId);
}

export function destinationRecommendationDependencies(): DestinationRecommendationUseCaseDependencies {
  return { runWorkflow: runDestinationRecommendationWorkflow };
}

/**
 * The model writes its reply before the workflow runs, so it assumed cards would
 * follow. When they do, its reply is the one written about what the user actually
 * said and it stands. When the workflow found nothing, that assumption failed and
 * only the workflow can say so.
 */
function recommendationTurnContent(
  modelReply: string,
  result: DestinationRecommendationWorkflowResult,
): string {
  return result.presentation ? modelReply : result.content;
}

export async function persistConversationalRecommendationTurn(input: {
  readonly tripId: string;
  readonly ownerGuestId: string;
  readonly tripState: TripState;
  readonly interpretation: WorkspaceConversationInterpretation;
  /** What the model proposed, and what the write actually committed of it. */
  readonly patch: TripStatePatch | null;
  readonly persistedPatch: TripStatePatch | null;
  readonly previousMessages: readonly TripMessage[];
  readonly currentUserText: string;
  readonly requestId: string;
}, dependencies: DestinationRecommendationUseCaseDependencies & {
  readonly persistTurn: Pick<TripMessageService, "persistSuccessfulTurn">["persistSuccessfulTurn"];
}): Promise<readonly [TripMessage, TripMessage] | null> {
  if (!shouldCreateConversationalRecommendations(input.interpretation, input.tripState, {
    proposed: input.patch?.destination !== undefined,
    written: input.persistedPatch?.destination !== undefined,
  })) {
    // The model asked for cards on a turn that cannot offer them, so its reply is
    // the whole turn. That is legitimate, but it is also how a weak reply reaches
    // the user, and it is invisible without this line.
    if (input.interpretation.presentationIntent === "destination_recommendations") {
      logger.warn({
        event: logEvents.recommendationIntentDeclined,
        requestId: input.requestId,
        tripId: input.tripId,
        destinationState: input.tripState.destination.state,
        patchDestinationState: input.patch?.destination?.state ?? null,
        writtenDestinationState: input.persistedPatch?.destination?.state ?? null,
        disambiguationState: input.interpretation.destinationDisambiguation?.state ?? null,
      }, "Destination recommendations were requested on a turn that cannot offer them");
    }
    return null;
  }
  const context = buildConversationalDestinationRecommendationContext(
    input.tripId, input.tripState, input.previousMessages, input.currentUserText);
  const reply = await createDestinationRecommendationReply(context, input.requestId, dependencies);
  return dependencies.persistTurn({
    tripId: input.tripId,
    ownerGuestId: input.ownerGuestId,
    userContent: input.currentUserText,
    assistantContent: recommendationTurnContent(input.interpretation.reply, reply),
    ...(reply.presentation ? { assistantPresentation: reply.presentation } : {}),
  });
}
