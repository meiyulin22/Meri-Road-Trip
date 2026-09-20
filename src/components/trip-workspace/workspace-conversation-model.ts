import type { TripState } from "@/domain/trip-state/trip-state";
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
  tripState: TripState,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceConversationInterpretation> {
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
      body: JSON.stringify({ message, tripState }),
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
    !("interpretation" in body)
  ) {
    throw new WorkspaceConversationRequestError(
      "The workspace conversation request was unsuccessful.",
    );
  }

  try {
    return validateWorkspaceConversationInterpretation(body.interpretation);
  } catch (error) {
    throw new WorkspaceConversationRequestError(
      "The workspace conversation response was invalid.",
      error,
    );
  }
}
