import {
  validateTripMessage,
  type TripMessage,
} from "@/domain/trip-message/trip-message";
import { validateTripState, type TripState } from "@/domain/trip-state/trip-state";
import {
  validateWorkspaceConversationInterpretation,
  type WorkspaceConversationInterpretation,
} from "@/domain/trip-state/workspace-conversation";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class WorkspaceConversationRequestError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "WorkspaceConversationRequestError";
  }
}

export async function requestWorkspaceConversation(
  message: string,
  tripId: string,
  fetcher: Fetcher = (input, init) => globalThis.fetch(input, init),
): Promise<{
  readonly interpretation: WorkspaceConversationInterpretation;
  readonly tripState: TripState;
  readonly messages: TripMessage[];
}> {
  if (message.trim() === "") {
    throw new WorkspaceConversationRequestError(
      "A workspace message is required.",
    );
  }

  let response: Response;
  try {
    response = await fetcher("/api/trip-workspace/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, tripId }),
    });
  } catch (error) {
    throw new WorkspaceConversationRequestError(
      "The workspace conversation request failed.",
      error,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new WorkspaceConversationRequestError(
      "The workspace conversation response was not JSON.",
      error,
    );
  }

  if (
    !response.ok ||
    typeof body !== "object" ||
    body === null ||
    !("interpretation" in body) ||
    !("tripState" in body) ||
    !("messages" in body) ||
    !Array.isArray(body.messages)
  ) {
    throw new WorkspaceConversationRequestError(
      "The workspace conversation request was unsuccessful.",
    );
  }

  try {
    return {
      interpretation: validateWorkspaceConversationInterpretation(
        body.interpretation,
      ),
      tripState: validateTripState(body.tripState),
      messages: body.messages.map(validateTripMessage),
    };
  } catch (error) {
    throw new WorkspaceConversationRequestError(
      "The workspace conversation response was invalid.",
      error,
    );
  }
}

export class LocationCandidateFollowUpError extends WorkspaceConversationRequestError {
  constructor(readonly tripState: TripState) {
    super("The destination was saved, but its assistant follow-up was unavailable.");
    this.name = "LocationCandidateFollowUpError";
  }
}

export async function selectLocationCandidate(
  tripId: string,
  messageId: string,
  candidateIndex: number,
  fetcher: Fetcher = (input, init) => globalThis.fetch(input, init),
): Promise<{ readonly tripState: TripState; readonly assistantMessage: TripMessage }> {
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/location-candidate-selection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, candidateIndex }),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new WorkspaceConversationRequestError("Location candidate selection response is invalid.");
  }
  if (!response.ok) {
    if (typeof body === "object" && body !== null && "code" in body &&
      body.code === "follow_up_unavailable" && "tripState" in body) {
      throw new LocationCandidateFollowUpError(validateTripState(body.tripState));
    }
    throw new WorkspaceConversationRequestError("Location candidate selection failed.");
  }
  if (typeof body !== "object" || body === null || !("tripState" in body) || !("assistantMessage" in body)) {
    throw new WorkspaceConversationRequestError("Location candidate selection response is invalid.");
  }
  const tripState = validateTripState(body.tripState);
  const assistantMessage = validateTripMessage(body.assistantMessage);
  if (assistantMessage.role !== "assistant" || assistantMessage.tripId !== tripId) {
    throw new WorkspaceConversationRequestError("Location candidate selection follow-up is invalid.");
  }
  return { tripState, assistantMessage };
}

export function canSelectLocationCandidates(
  tripState: TripState,
  messageId: string,
  latestCandidateMessageId: string | undefined,
): boolean {
  return tripState.destination.state !== "known" && messageId === latestCandidateMessageId;
}
