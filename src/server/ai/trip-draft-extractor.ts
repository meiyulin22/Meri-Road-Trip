import {
  validateTripDraft,
  type TripDraft,
} from "@/domain/trip-draft/trip-draft";
import {
  createKimiClientFromEnvironment,
  type StructuredOutputModelClient,
} from "@/server/ai/kimi-client";
import { buildTripDraftSystemPrompt } from "@/server/ai/prompts/trip-draft-prompt";
import { logger, logEvents } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";

export interface ExtractTripDraftInput {
  readonly message: string;
  readonly requestId: string;
  readonly referenceDate: string;
  readonly timezone: string;
}

export class InvalidTripDraftRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTripDraftRequestError";
  }
}

export class InvalidModelOutputError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "InvalidModelOutputError";
  }
}

const fieldSchema = {
  type: "object",
  additionalProperties: false,
  required: ["state", "value"],
  properties: {
    state: {
      type: "string",
      enum: ["known", "approximate", "missing", "ambiguous"],
    },
    value: { type: ["string", "null"] },
  },
};

export const tripDraftJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "origin",
    "destination",
    "startDate",
    "endDate",
    "duration",
    "transportPreference",
  ],
  properties: {
    name: fieldSchema,
    origin: fieldSchema,
    destination: fieldSchema,
    startDate: fieldSchema,
    endDate: fieldSchema,
    duration: fieldSchema,
    transportPreference: fieldSchema,
  },
};

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateInput(input: ExtractTripDraftInput): void {
  if (typeof input.message !== "string" || input.message.trim() === "") {
    throw new InvalidTripDraftRequestError("message must be a non-empty string.");
  }

  if (!isIsoDate(input.referenceDate)) {
    throw new InvalidTripDraftRequestError(
      "referenceDate must use the YYYY-MM-DD format.",
    );
  }

  if (input.timezone.trim() === "") {
    throw new InvalidTripDraftRequestError("timezone must be non-empty.");
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
  } catch {
    throw new InvalidTripDraftRequestError(
      "timezone must be a valid IANA timezone.",
    );
  }
}

export async function extractTripDraft(
  input: ExtractTripDraftInput,
  client?: StructuredOutputModelClient,
): Promise<TripDraft> {
  validateInput(input);

  const modelClient = client ?? createKimiClientFromEnvironment();
  const response = await modelClient.generateStructuredOutput({
    requestId: input.requestId,
    operation: "trip_draft_extraction",
    schemaName: "trip_draft",
    systemPrompt: buildTripDraftSystemPrompt({
      referenceDate: input.referenceDate,
      timezone: input.timezone,
    }),
    userMessage: input.message,
    jsonSchema: tripDraftJsonSchema,
  });

  try {
    if (response.content === null || response.content.trim() === "") {
      throw new InvalidModelOutputError("The model returned no structured output.");
    }

    if (response.finishReason === "length") {
      throw new InvalidModelOutputError("The model output was truncated.");
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(response.content);
    } catch (error) {
      throw new InvalidModelOutputError(
        "The model returned invalid JSON.",
        error,
      );
    }

    return validateTripDraft(parsed);
  } catch (error) {
    logger.warn(
      {
        event: logEvents.llmOutputInvalid,
        requestId: input.requestId,
        operation: "trip_draft_extraction",
        provider: "moonshot",
        model: response.model,
        finishReason: response.finishReason,
        error: serializeError(error),
      },
      "LLM output validation failed",
    );

    throw error;
  }
}
