import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";
import type { LocationResolveResult } from "@/capabilities/destination/location-service";
import { replyAfterDestinationResolution } from "@/capabilities/destination/post-update-destination-resolution";
import {
  replyForDestinationDisambiguation,
  type DestinationDisambiguationResult,
} from "@/capabilities/destination/verify-destination-disambiguation";

/**
 * Which of Meri's four conversational routes a workspace turn took, and the reply
 * that route produces. The routes were a nested ternary in the request handler plus
 * an unwritten agreement with the prompt, so nothing named them and nothing logged
 * them. Naming them here makes a fifth route — Generate plan — one more entry.
 */
export type WorkspaceTurnBranch =
  /** Cards were produced, and the reply is the sentence written above them. */
  | "destination_recommendations"
  /** The expression covers too much ground, so narrower places are offered. */
  | "destination_narrowing"
  /** The turn moved the Journey forward by proposing TripState values. */
  | "journey_update"
  /**
   * Everything else the user can say: a factual question, an unclear update, and
   * 闲聊. This route has no code of its own by design — the model's own words are
   * the reply, and the system prompt is the only thing steering them.
   */
  | "conversation";

export function resolveWorkspaceTurn(input: {
  readonly interpretation: WorkspaceConversationInterpretation;
  /** The assistant content already persisted by the recommendation workflow, if it ran. */
  readonly recommendationReply: string | null;
  readonly disambiguationResult: DestinationDisambiguationResult | null;
  readonly destinationExpression: string | null;
  readonly tripState: TripState;
  readonly resolution: LocationResolveResult | null;
  readonly persistedPatch: TripStatePatch | null;
}): { readonly branch: WorkspaceTurnBranch; readonly reply: string } {
  if (input.recommendationReply !== null) {
    return { branch: "destination_recommendations", reply: input.recommendationReply };
  }
  if (input.disambiguationResult && input.destinationExpression) {
    return {
      branch: "destination_narrowing",
      reply: replyForDestinationDisambiguation(
        input.destinationExpression, input.disambiguationResult, input.persistedPatch !== null),
    };
  }
  // The provider can also find an over-broad destination ambiguous after the model
  // thought it was settled. That narrowing arrives here rather than above, because
  // only the resolution knows it happened.
  const reply = replyAfterDestinationResolution(
    input.interpretation, input.tripState, input.resolution, input.persistedPatch);
  return {
    branch: input.interpretation.intent === "trip_state_update" ? "journey_update" : "conversation",
    reply,
  };
}
