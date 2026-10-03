import {
  transportPreferences,
  type TransportPreference,
} from "@/domain/trip-draft/trip-draft";
import { validateDestinationEdit, type DestinationEdit } from "@/domain/trip-state/destination-edit";
import type {
  TripState,
  TripStateField,
  TripStatePatch,
} from "@/domain/trip-state/trip-state";

/**
 * The fields a turn can change with a plain value. The destination is not among them:
 * it changes only through `destinationEdit`, which names places for the application
 * to confirm rather than a value to store.
 */
export const conversationFieldNames = [
  "name",
  "origin",
  "startDate",
  "endDate",
  "duration",
  "transportPreference",
] as const;

export type ConversationFieldName = (typeof conversationFieldNames)[number];

export interface ProposedTripStateChange {
  readonly field: ConversationFieldName;
  readonly state: "known" | "approximate" | "ambiguous" | "missing";
  readonly value: string | null;
}

/**
 * There is no separate intent: whether a turn updates the Journey is exactly whether
 * it proposes changes, and asking the model to state it twice only gave it a way to
 * contradict itself — which failed the whole turn.
 */
/**
 * `destination_recommendations` answers an open 「去哪」 inside the provinces already
 * saved; `destination_recommendations_elsewhere` widens a trip that has its places
 * to provinces it does not have yet (「推荐别的省份」).
 */
export const presentationIntents = ["none", "destination_recommendations", "destination_recommendations_elsewhere"] as const;

export type PresentationIntent = (typeof presentationIntents)[number];

export interface WorkspaceConversationInterpretation {
  readonly presentationIntent: PresentationIntent;
  readonly changes: readonly ProposedTripStateChange[];
  readonly destinationEdit: DestinationEdit;
  readonly reply: string;
}

export class InvalidWorkspaceConversationInterpretationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkspaceConversationInterpretationError";
  }
}

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

function isConversationFieldName(value: unknown): value is ConversationFieldName {
  return typeof value === "string" && conversationFieldNames.some((field) => field === value);
}

function parseChange(value: unknown, index: number): ProposedTripStateChange {
  const label = `changes[${index}]`;
  if (!isRecord(value)) {
    throw new InvalidWorkspaceConversationInterpretationError(
      `${label} must be an object.`,
    );
  }

  assertExactKeys(value, ["field", "state", "value"], label);

  if (!isConversationFieldName(value.field)) {
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

  // Clearing transport is as legitimate as clearing any other field; only a value it
  // holds has to be one the application supports.
  if (
    value.field === "transportPreference" && value.state !== "missing" &&
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

/**
 * A model answer with one unusable part is still mostly an answer. Failing the whole
 * turn over it threw away the user's message along with every valid change in it —
 * once for a list that was one entry too long, once for clearing transport — so each
 * part is checked on its own: a bad part becomes "nothing proposed" and is named in
 * `dropped`, and only an answer with no usable reply fails.
 */
export interface SalvagedWorkspaceConversationInterpretation {
  readonly interpretation: WorkspaceConversationInterpretation;
  readonly dropped: readonly string[];
}

export function salvageWorkspaceConversationInterpretation(
  value: unknown,
): SalvagedWorkspaceConversationInterpretation {
  if (!isRecord(value)) {
    throw new InvalidWorkspaceConversationInterpretationError(
      "Workspace conversation interpretation must be an object.",
    );
  }
  if (typeof value.reply !== "string" || value.reply.trim() === "") {
    throw new InvalidWorkspaceConversationInterpretationError(
      "interpretation.reply must be a non-empty string.",
    );
  }

  const dropped: string[] = [];
  const expectedKeys = ["presentationIntent", "changes", "destinationEdit", "reply"];
  for (const key of Object.keys(value)) {
    if (!expectedKeys.includes(key)) dropped.push(`interpretation.${key} is not part of the schema.`);
  }

  let presentationIntent: PresentationIntent = "none";
  if (presentationIntents.some((intent) => intent === value.presentationIntent)) {
    presentationIntent = value.presentationIntent as PresentationIntent;
  } else {
    dropped.push("interpretation.presentationIntent is invalid.");
  }

  const changes: ProposedTripStateChange[] = [];
  if (Array.isArray(value.changes)) {
    value.changes.forEach((item, index) => {
      try {
        const change = parseChange(item, index);
        if (changes.some((kept) => kept.field === change.field)) {
          dropped.push(`changes[${index}] repeats ${change.field}.`);
        } else {
          changes.push(change);
        }
      } catch (error) {
        dropped.push(error instanceof Error ? error.message : `changes[${index}] is invalid.`);
      }
    });
  } else {
    dropped.push("interpretation.changes must be an array.");
  }

  let destinationEdit: DestinationEdit = { operation: "none" };
  try {
    destinationEdit = validateDestinationEdit(value.destinationEdit);
  } catch (error) {
    dropped.push(error instanceof Error ? error.message : "destinationEdit is invalid.");
  }

  return { interpretation: { presentationIntent, changes, destinationEdit, reply: value.reply }, dropped };
}

/** The same reading with nothing allowed to be dropped, for callers that need an exact answer. */
export function validateWorkspaceConversationInterpretation(
  value: unknown,
): WorkspaceConversationInterpretation {
  const { interpretation, dropped } = salvageWorkspaceConversationInterpretation(value);
  if (dropped.length > 0) {
    throw new InvalidWorkspaceConversationInterpretationError(dropped[0]);
  }
  return interpretation;
}

/** Whether the turn proposes anything for the Journey at all. */
export function proposesJourneyUpdate(interpretation: WorkspaceConversationInterpretation): boolean {
  return interpretation.changes.length > 0 || interpretation.destinationEdit.operation !== "none";
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

/**
 * The model sometimes restates fields as they already are — a name it was shown, or
 * four fields already missing set to missing. Harmless against an empty Journey, but
 * the same habit is how a stale value would overwrite a newer one, so a change that
 * would leave the field as it is never becomes part of the patch.
 */
function leavesFieldUnchanged(change: ProposedTripStateChange, current: TripState): boolean {
  const field = current[change.field];
  if (field.state === "missing") return change.state === "missing";
  return field.state === change.state && field.value === change.value;
}

export function createTripStatePatchFromInterpretation(
  interpretation: WorkspaceConversationInterpretation,
  current: TripState,
): TripStatePatch | null {
  const changes = interpretation.changes.filter((change) => !leavesFieldUnchanged(change, current));
  if (changes.length === 0) {
    return null;
  }

  const patch: { -readonly [K in keyof TripState]?: TripState[K] } = {};
  for (const change of changes) {
    if (change.field === "transportPreference" && change.state !== "missing") {
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
