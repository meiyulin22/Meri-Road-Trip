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
