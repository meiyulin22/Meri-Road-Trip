import type { DestinationChoice } from "./trip-message";

/** This identity describes the saved travel preference, not a particular map POI. */
export function destinationPreferenceId(province: string, city: string, spot: string | null): string {
  const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/gu, "");
  return `destination:${JSON.stringify([normalize(province), normalize(city), spot === null ? null : normalize(spot)])}`;
}

/** Historical offers can contain several POIs for the same preference. Keep their
 * original IDs for submission; displaying one row must not fabricate a new offer. */
export function groupDestinationChoices(choices: readonly DestinationChoice[]): readonly {
  readonly choice: DestinationChoice; readonly ids: readonly string[];
}[] {
  const groups = new Map<string, { choice: DestinationChoice; ids: string[] }>();
  for (const choice of choices) {
    const key = choice.city ? destinationPreferenceId(choice.province, choice.city, choice.spot ?? null)
      : JSON.stringify([choice.province, choice.name, choice.legacyUnverified ?? false]);
    const existing = groups.get(key);
    if (existing) existing.ids.push(choice.id);
    else groups.set(key, { choice, ids: [choice.id] });
  }
  return [...groups.values()];
}
