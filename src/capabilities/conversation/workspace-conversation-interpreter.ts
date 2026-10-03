import type { TripState } from "@/domain/trip-state/trip-state";
import {
  conversationFieldNames,
  proposesJourneyUpdate,
  salvageWorkspaceConversationInterpretation,
  type WorkspaceConversationInterpretation,
  presentationIntents,
} from "@/domain/trip-state/workspace-conversation";
import { destinationEditJsonSchema } from "@/domain/trip-state/destination-edit";
import { createAiSdkKimiClientFromEnvironment } from "@/platform/llm/ai-sdk-kimi-client";
import type {
  StructuredOutputConversationMessage,
  StructuredOutputModelClient,
} from "@/platform/llm/kimi-client";
import { buildWorkspaceConversationSystemPrompt } from "@/capabilities/conversation/prompts/workspace-conversation-prompt";
import { logger, logEvents } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";

export interface InterpretWorkspaceConversationInput {
  readonly message: string;
  readonly tripState: TripState;
  readonly requestId: string;
  readonly referenceDate: string;
  readonly timezone: string;
  readonly conversationHistory?: readonly StructuredOutputConversationMessage[];
  readonly mode?: "conversation" | "opening";
}

export class InvalidWorkspaceConversationRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkspaceConversationRequestError";
  }
}

export class InvalidWorkspaceConversationModelOutputError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "InvalidWorkspaceConversationModelOutputError";
  }
}

const changeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["field", "state", "value"],
  properties: {
    field: { type: "string", enum: [...conversationFieldNames] },
    state: {
      type: "string",
      enum: ["known", "approximate", "ambiguous", "missing"],
    },
    value: { type: ["string", "null"] },
  },
};

export const workspaceConversationJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["presentationIntent", "changes", "destinationEdit", "reply"],
  properties: {
    presentationIntent: { type: "string", enum: [...presentationIntents] },
    changes: {
      type: "array",
      maxItems: conversationFieldNames.length,
      items: changeSchema,
    },
    destinationEdit: destinationEditJsonSchema,
    reply: { type: "string", minLength: 1 },
  },
};

function validateInput(input: InterpretWorkspaceConversationInput): void {
  if (input.message.trim() === "") {
    throw new InvalidWorkspaceConversationRequestError(
      "message must be a non-empty string.",
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.referenceDate)) {
    throw new InvalidWorkspaceConversationRequestError(
      "referenceDate must use the YYYY-MM-DD format.",
    );
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
  } catch {
    throw new InvalidWorkspaceConversationRequestError(
      "timezone must be a valid IANA timezone.",
    );
  }
}

export async function interpretWorkspaceConversation(
  input: InterpretWorkspaceConversationInput,
  client?: StructuredOutputModelClient,
): Promise<WorkspaceConversationInterpretation> {
  validateInput(input);
  const modelClient = client ?? createAiSdkKimiClientFromEnvironment();

  try {
    const response = await modelClient.generateStructuredOutput({
      requestId: input.requestId,
      operation: "workspace_conversation_interpretation",
      schemaName: "workspace_conversation_interpretation",
      systemPrompt: buildWorkspaceConversationSystemPrompt({
        tripState: input.tripState,
        referenceDate: input.referenceDate,
        timezone: input.timezone,
        mode: input.mode,
      }),
      userMessage: input.message,
      conversationHistory: input.conversationHistory,
      jsonSchema: workspaceConversationJsonSchema,
    });

    if (response.content === null || response.content.trim() === "") {
      throw new InvalidWorkspaceConversationModelOutputError(
        "The model returned no structured output.",
      );
    }

    if (response.finishReason === "length") {
      throw new InvalidWorkspaceConversationModelOutputError(
        "The model output was truncated.",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch (error) {
      throw new InvalidWorkspaceConversationModelOutputError(
        "The model returned invalid JSON.",
        error,
      );
    }

    const { interpretation, dropped } = salvageWorkspaceConversationInterpretation(parsed);
    if (dropped.length > 0) {
      // The turn goes ahead without these parts; the log is the only place they show.
      logger.warn({ event: logEvents.workspaceConversationPartsDropped, requestId: input.requestId, dropped },
        "Unusable parts of the model answer were dropped");
    }
    if (input.mode === "opening" &&
      (proposesJourneyUpdate(interpretation) || interpretation.presentationIntent !== "none")) {
      throw new InvalidWorkspaceConversationModelOutputError(
        "Opening response must not propose TripState changes.",
      );
    }
    logger.info(
      {
        event: logEvents.workspaceConversationInterpreted,
        requestId: input.requestId,
        destinationOperation: interpretation.destinationEdit.operation,
        presentationIntent: interpretation.presentationIntent,
        changedFields: interpretation.changes.map((change) => change.field),
      },
      "Workspace conversation interpreted",
    );

    return interpretation;
  } catch (error) {
    logger.warn(
      {
        event: logEvents.workspaceConversationFailed,
        requestId: input.requestId,
        error: serializeError(error),
      },
      "Workspace conversation interpretation failed",
    );
    throw error;
  }
}
