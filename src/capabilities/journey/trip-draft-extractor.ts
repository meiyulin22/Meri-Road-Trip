import {
  validateTripDraft,
  type TripDraft,
} from "@/domain/trip-draft/trip-draft";
import { validateDestinationDisambiguation } from "@/domain/location/destination-disambiguation";
import { createAiSdkKimiClientFromEnvironment } from "@/platform/llm/ai-sdk-kimi-client";
import type { StructuredOutputModelClient } from "@/platform/llm/kimi-client";
import { buildTripDraftSystemPrompt } from "@/capabilities/journey/prompts/trip-draft-prompt";
import { logger, logEvents } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";

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
    destinationDisambiguation: {
      type: "object", additionalProperties: false, required: ["state", "value"],
      properties: {
        state: { type: "string", enum: ["missing", "known"] },
        value: { type: ["array", "null"], minItems: 2, maxItems: 3,
          items: { type: "string", minLength: 1, maxLength: 80 } },
      },
    },
  },
};

function validateExtractedDraft(value: unknown, requestId: string): TripDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
    !Object.hasOwn(value, "destinationDisambiguation")) {
    return validateTripDraft(value);
  }

  const { destinationDisambiguation, ...coreValue } = value as Record<string, unknown>;
  const draft = validateTripDraft(coreValue);
  try {
    return { ...draft, destinationDisambiguation: validateDestinationDisambiguation(
      destinationDisambiguation, draft.destination.state !== "missing") };
  } catch (error) {
    logger.warn({
      event: logEvents.llmAuxiliaryOutputInvalid,
      requestId,
      operation: "trip_draft_extraction",
      field: "destinationDisambiguation",
      reason: error instanceof Error ? error.message : "invalid_auxiliary_output",
    }, "TripDraft auxiliary output was discarded");
    return { ...draft, destinationDisambiguation: { state: "missing", value: null } };
  }
}

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

  const modelClient = client ?? createAiSdkKimiClientFromEnvironment();
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

    return validateExtractedDraft(parsed, input.requestId);
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
