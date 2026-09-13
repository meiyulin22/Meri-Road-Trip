import {
  transportPreferences,
  validateTripDraft,
  type TripDraft,
} from "@/domain/trip-draft/trip-draft";
import {
  createKimiClientFromEnvironment,
  type TripDraftModelClient,
} from "@/server/ai/kimi-client";
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
  required: ["state", "value", "note"],
  properties: {
    state: { type: "string", enum: ["known", "missing", "ambiguous"] },
    value: { type: ["string", "null"] },
    note: { type: ["string", "null"] },
  },
};

export const tripDraftJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "destination",
    "startDate",
    "endDate",
    "transportPreference",
  ],
  properties: {
    name: fieldSchema,
    destination: fieldSchema,
    startDate: fieldSchema,
    endDate: fieldSchema,
    transportPreference: {
      ...fieldSchema,
      properties: {
        ...fieldSchema.properties,
        value: { type: ["string", "null"], enum: [...transportPreferences, null] },
      },
    },
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

function buildSystemPrompt(referenceDate: string, timezone: string): string {
  return `You extract a TripDraft from a user's travel request.

Reference date: ${referenceDate}
Timezone: ${timezone}

Return only data that conforms to the supplied JSON schema.
Resolve relative dates using the reference date and timezone. Do not invent facts.
Every field must explicitly use one state:
- known: put the normalized value in value and set note to null.
- missing: set both value and note to null.
- ambiguous: set value to null and briefly explain the ambiguity in note.

Dates must be YYYY-MM-DD. Transport preference must be one of: ${transportPreferences.join(", ")}.
Use self_drive only when the user wants to drive, no_self_drive when the user explicitly does not want to drive, public_transport for public transit, and flexible when any mode is acceptable.
A concise trip name may be inferred from clearly known trip details.`;
}

export async function extractTripDraft(
  input: ExtractTripDraftInput,
  client?: TripDraftModelClient,
): Promise<TripDraft> {
  validateInput(input);

  const modelClient = client ?? createKimiClientFromEnvironment();
  const response = await modelClient.generateTripDraft({
    requestId: input.requestId,
    systemPrompt: buildSystemPrompt(input.referenceDate, input.timezone),
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
