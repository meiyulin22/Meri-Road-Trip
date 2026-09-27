export type DestinationDisambiguation =
  | { readonly state: "missing"; readonly value: null }
  | { readonly state: "known"; readonly value: readonly string[] };

export function validateDestinationDisambiguation(
  value: unknown,
  hasDestination: boolean,
): DestinationDisambiguation {
  if (value === null) return { state: "missing", value: null };
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
    Object.keys(value).length !== 2 || !("state" in value) || !("value" in value)) {
    throw new Error("destinationDisambiguation has an invalid shape.");
  }
  if (value.state === "missing") {
    if (value.value !== null) throw new Error("destinationDisambiguation missing value must be null.");
    return { state: "missing", value: null };
  }
  if (value.state !== "known" || !hasDestination || !Array.isArray(value.value) ||
    value.value.length < 2 || value.value.length > 3) {
    throw new Error("destinationDisambiguation has an invalid shape.");
  }
  const expressions: string[] = [];
  for (const expression of value.value) {
    if (typeof expression !== "string" || expression.trim() === "" || expression.trim().length > 80) {
      throw new Error("destinationDisambiguation contains an invalid expression.");
    }
    expressions.push(expression.trim());
  }
  if (new Set(expressions).size !== expressions.length) {
    throw new Error("destinationDisambiguation expressions must be distinct.");
  }
  return { state: "known", value: expressions };
}
