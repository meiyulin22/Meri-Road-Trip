import type { TripState } from "@/domain/trip-state/trip-state";
import {
  validateWorkspaceConversationInterpretation,
  type WorkspaceConversationInterpretation,
} from "@/domain/trip-state/workspace-conversation";
import {
  createKimiClientFromEnvironment,
  type StructuredOutputModelClient,
} from "@/server/ai/kimi-client";
import { buildWorkspaceConversationSystemPrompt } from "@/server/ai/prompts/workspace-conversation-prompt";
import { logger, logEvents } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";

export interface InterpretWorkspaceConversationInput {
  readonly message: string;
  readonly tripState: TripState;
  readonly requestId: string;
  readonly referenceDate: string;
  readonly timezone: string;
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
    field: {
      type: "string",
      enum: [
        "name",
        "origin",
        "destination",
        "startDate",
        "endDate",
        "duration",
        "transportPreference",
      ],
    },
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
  required: ["intent", "changes", "reply"],
  properties: {
    intent: {
      type: "string",
      enum: ["trip_state_update", "question", "unclear_update_intent"],
    },
    changes: {
      type: "array",
      maxItems: 7,
      items: changeSchema,
    },
    reply: { type: "string" },
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
  const modelClient = client ?? createKimiClientFromEnvironment();

  try {
    const response = await modelClient.generateStructuredOutput({
      requestId: input.requestId,
      operation: "workspace_conversation_interpretation",
      schemaName: "workspace_conversation_interpretation",
      systemPrompt: buildWorkspaceConversationSystemPrompt({
        tripState: input.tripState,
        referenceDate: input.referenceDate,
        timezone: input.timezone,
      }),
      userMessage: input.message,
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

    const interpretation = validateWorkspaceConversationInterpretation(parsed);
    logger.info(
      {
        event: logEvents.workspaceConversationInterpreted,
        requestId: input.requestId,
        intent: interpretation.intent,
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
