import {
  transportPreferences,
  type TransportPreference,
} from "@/domain/trip-draft/trip-draft";
import type {
  TripState,
  TripStateField,
  TripStateFieldName,
  TripStatePatch,
} from "@/domain/trip-state/trip-state";

export const workspaceConversationIntents = [
  "trip_state_update",
  "question",
  "unclear_update_intent",
] as const;

export type WorkspaceConversationIntent =
  (typeof workspaceConversationIntents)[number];

export interface ProposedTripStateChange {
  readonly field: TripStateFieldName;
  readonly state: "known" | "approximate" | "ambiguous" | "missing";
  readonly value: string | null;
}

export interface WorkspaceConversationInterpretation {
  readonly intent: WorkspaceConversationIntent;
  readonly changes: readonly ProposedTripStateChange[];
  readonly reply: string;
}

export class InvalidWorkspaceConversationInterpretationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkspaceConversationInterpretationError";
  }
}

const tripStateFieldNames: TripStateFieldName[] = [
  "name",
  "origin",
  "destination",
  "startDate",
  "endDate",
  "duration",
  "transportPreference",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const keys = Object.keys(value);
  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new InvalidWorkspaceConversationInterpretationError(
      `${label} has an invalid shape.`,
    );
  }
}

function isTripStateFieldName(value: unknown): value is TripStateFieldName {
  return (
    typeof value === "string" &&
    tripStateFieldNames.some((field) => field === value)
  );
}

function isWorkspaceConversationIntent(
  value: unknown,
): value is WorkspaceConversationIntent {
  return (
    typeof value === "string" &&
    workspaceConversationIntents.some((intent) => intent === value)
  );
}

function parseChange(value: unknown, index: number): ProposedTripStateChange {
  const label = `changes[${index}]`;
  if (!isRecord(value)) {
    throw new InvalidWorkspaceConversationInterpretationError(
      `${label} must be an object.`,
    );
  }

  assertExactKeys(value, ["field", "state", "value"], label);

  if (!isTripStateFieldName(value.field)) {
    throw new InvalidWorkspaceConversationInterpretationError(
      `${label}.field is invalid.`,
    );
  }

  if (
    value.state !== "known" &&
    value.state !== "approximate" &&
    value.state !== "ambiguous" &&
    value.state !== "missing"
  ) {
    throw new InvalidWorkspaceConversationInterpretationError(
      `${label}.state is invalid.`,
    );
  }

  if (value.state === "missing") {
    if (value.value !== null) {
      throw new InvalidWorkspaceConversationInterpretationError(
        `${label}.value must be null when missing.`,
      );
    }
  } else if (typeof value.value !== "string" || value.value.trim() === "") {
    throw new InvalidWorkspaceConversationInterpretationError(
      `${label}.value must be a non-empty string.`,
    );
  }

  if (
    value.field === "transportPreference" &&
    (value.state !== "known" ||
      typeof value.value !== "string" ||
      !transportPreferences.some((preference) => preference === value.value))
  ) {
    throw new InvalidWorkspaceConversationInterpretationError(
      "transportPreference must be a known supported value.",
    );
  }

  return {
    field: value.field,
    state: value.state,
    value: value.value as string | null,
  };
}

export function validateWorkspaceConversationInterpretation(
  value: unknown,
): WorkspaceConversationInterpretation {
  if (!isRecord(value)) {
    throw new InvalidWorkspaceConversationInterpretationError(
      "Workspace conversation interpretation must be an object.",
    );
  }

  assertExactKeys(value, ["intent", "changes", "reply"], "interpretation");

  if (!isWorkspaceConversationIntent(value.intent)) {
    throw new InvalidWorkspaceConversationInterpretationError(
      "interpretation.intent is invalid.",
    );
  }

  if (!Array.isArray(value.changes)) {
    throw new InvalidWorkspaceConversationInterpretationError(
      "interpretation.changes must be an array.",
    );
  }

  if (typeof value.reply !== "string" || value.reply.trim() === "") {
    throw new InvalidWorkspaceConversationInterpretationError(
      "interpretation.reply must be a non-empty string.",
    );
  }

  const changes = value.changes.map(parseChange);
  const fields = changes.map((change) => change.field);
  if (new Set(fields).size !== fields.length) {
    throw new InvalidWorkspaceConversationInterpretationError(
      "interpretation.changes contains duplicate fields.",
    );
  }

  if (value.intent === "trip_state_update" && changes.length === 0) {
    throw new InvalidWorkspaceConversationInterpretationError(
      "trip_state_update must contain at least one change.",
    );
  }

  if (value.intent !== "trip_state_update" && changes.length !== 0) {
    throw new InvalidWorkspaceConversationInterpretationError(
      "Only trip_state_update may contain changes.",
    );
  }

  return { intent: value.intent, changes, reply: value.reply };
}

function createUserField(
  change: ProposedTripStateChange,
): TripStateField {
  if (change.state === "missing") {
    return { state: "missing" };
  }

  return {
    state: change.state,
    value: change.value as string,
    source: "user",
  };
}

export function createTripStatePatchFromInterpretation(
  interpretation: WorkspaceConversationInterpretation,
): TripStatePatch | null {
  if (interpretation.intent !== "trip_state_update") {
    return null;
  }

  const patch: { -readonly [K in keyof TripState]?: TripState[K] } = {};
  for (const change of interpretation.changes) {
    if (change.field === "transportPreference") {
      patch.transportPreference = {
        state: "known",
        value: change.value as TransportPreference,
        source: "user",
      };
      continue;
    }

    Object.assign(patch, { [change.field]: createUserField(change) });
  }

  return patch;
}
