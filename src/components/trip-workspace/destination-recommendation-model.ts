import { validateTripMessage, type TripMessage } from "@/domain/trip-message/trip-message";
import { validateTripState, type TripState } from "@/domain/trip-state/trip-state";
import { DestinationSelectionFollowUpError, WorkspaceConversationRequestError } from "./workspace-conversation-model";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const DEFAULT_DESTINATION_IMAGE = "/backgrounds/home-v2-landscape.png";

export function canUseDestinationGuidance(tripState: TripState): boolean {
  return tripState.destination.state === "missing";
}

export function canSelectDestinationRecommendation(tripState: TripState): boolean {
  return tripState.destination.state !== "known";
}

export function destinationImageUrl(imageUrl: string | null, imageFailed: boolean): string {
  return imageFailed ? DEFAULT_DESTINATION_IMAGE : imageUrl ?? DEFAULT_DESTINATION_IMAGE;
}

export async function requestDestinationRecommendations(
  tripId: string,
  fetcher: Fetcher = fetch,
): Promise<TripMessage> {
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/destination-recommendations`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Destination recommendations request failed.");
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("message" in body)) {
    throw new Error("Destination recommendation response is invalid.");
  }
  const message = validateTripMessage(body.message);
  if (message.role !== "assistant" ||
    (message.presentation !== undefined && message.presentation.type !== "destination_recommendations")) {
    throw new Error("Destination recommendation response has an invalid presentation.");
  }
  return message;
}

export async function requestDestinationRecommendationsIfMissing(
  tripId: string, tripState: TripState, fetcher: Fetcher = fetch,
): Promise<TripMessage | null> {
  return canUseDestinationGuidance(tripState)
    ? requestDestinationRecommendations(tripId, fetcher)
    : null;
}

/**
 * Picking a recommendation card goes through its own endpoint rather than a plain
 * TripState write, because the server has to confirm the card was really offered,
 * check what can be planned next, and answer the user.
 */
export async function selectDestinationRecommendation(
  tripId: string, messageId: string, destinationId: string, fetcher: Fetcher = fetch,
): Promise<{ readonly tripState: TripState; readonly assistantMessage: TripMessage }> {
  const response = await fetcher(
    `/api/trips/${encodeURIComponent(tripId)}/destination-recommendation-selection`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, destinationId }) });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new WorkspaceConversationRequestError("Destination recommendation selection response is invalid.");
  }
  if (!response.ok) {
    if (typeof body === "object" && body !== null && "code" in body &&
      body.code === "follow_up_unavailable" && "tripState" in body) {
      throw new DestinationSelectionFollowUpError(validateTripState(body.tripState));
    }
    throw new WorkspaceConversationRequestError("Destination recommendation selection failed.");
  }
  if (typeof body !== "object" || body === null || !("tripState" in body) || !("assistantMessage" in body)) {
    throw new WorkspaceConversationRequestError("Destination recommendation selection response is invalid.");
  }
  const tripState = validateTripState(body.tripState);
  const assistantMessage = validateTripMessage(body.assistantMessage);
  if (assistantMessage.role !== "assistant" || assistantMessage.tripId !== tripId) {
    throw new WorkspaceConversationRequestError("Destination recommendation selection follow-up is invalid.");
  }
  return { tripState, assistantMessage };
}
