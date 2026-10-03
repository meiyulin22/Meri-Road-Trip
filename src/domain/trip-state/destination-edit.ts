/**
 * What the user asked to do to the destination, in their own words. The model reads
 * the sentence; the application owns the result. The model used to rewrite the whole
 * destination as one string — 「云南省 迪庆… · 广东省 潮州市 · 青岛」 — which no
 * provider can look up and which silently dropped whatever the model forgot to copy.
 * Now it names only what changed, and the application applies that to the structure.
 *
 * `set` names initial destinations and safely adds if destinations already exist;
 * `add` extends them. Only `remove` drops explicitly named existing places
 * (「不去潮州了」); naming a new place never removes any saved destination.
 *
 * `broadRegion` is set when the user named a region wider than one 市, such as 潮汕 or
 * 川西. `places` then lists the 市 it covers, and they are offered as choices instead
 * of all being added.
 */
export type DestinationEdit =
  | { readonly operation: "none" }
  | {
      readonly operation: "set" | "add";
      readonly places: readonly string[];
      readonly broadRegion: string | null;
    }
  | { readonly operation: "remove"; readonly places: readonly string[] };

export const noDestinationEdit: DestinationEdit = { operation: "none" };

const maxPlaces = 6;
const maxExpressionLength = 80;

/** The JSON schema the model answers in; strict mode needs every key present. */
export const destinationEditJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["operation", "places", "broadRegion"],
  properties: {
    operation: { type: "string", enum: ["none", "set", "add", "remove"],
      description: "set and add preserve all existing destinations. Only remove deletes places the user explicitly no longer wants." },
    places: {
      type: "array",
      maxItems: maxPlaces,
      items: { type: "string", minLength: 1, maxLength: maxExpressionLength },
    },
    broadRegion: { type: ["string", "null"], maxLength: maxExpressionLength },
  },
};

export class InvalidDestinationEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDestinationEditError";
  }
}

export function validateDestinationEdit(value: unknown): DestinationEdit {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidDestinationEditError("destinationEdit must be an object.");
  }
  const record = value as Record<string, unknown>;
  // The model always sends all three keys; an edit this module produced and a client
  // sent back omits the ones its operation does not use.
  if (Object.keys(record).some((key) => !["operation", "places", "broadRegion"].includes(key))) {
    throw new InvalidDestinationEditError("destinationEdit has an invalid shape.");
  }
  // A model that says nothing changed but still lists places is contradicting
  // itself; taking "none" at its word is the safe reading.
  if (record.operation === "none") return noDestinationEdit;
  if (!Array.isArray(record.places) || record.places.length > maxPlaces ||
    record.places.some((place) => typeof place !== "string" || place.trim() === "" ||
      place.trim().length > maxExpressionLength)) {
    throw new InvalidDestinationEditError("destinationEdit.places is invalid.");
  }
  const places = [...new Set((record.places as string[]).map((place) => place.trim()))];
  const broadRegion = typeof record.broadRegion === "string" && record.broadRegion.trim() !== ""
    ? record.broadRegion.trim()
    : null;
  if (record.broadRegion !== undefined && record.broadRegion !== null && broadRegion === null) {
    throw new InvalidDestinationEditError("destinationEdit.broadRegion is invalid.");
  }

  switch (record.operation) {
    case "remove":
      if (places.length === 0) throw new InvalidDestinationEditError("remove needs at least one place.");
      return { operation: "remove", places };
    case "set":
    case "add":
      if (places.length === 0) {
        throw new InvalidDestinationEditError(`${record.operation} needs at least one place.`);
      }
      return { operation: record.operation, places, broadRegion };
    default:
      throw new InvalidDestinationEditError("destinationEdit.operation is invalid.");
  }
}
