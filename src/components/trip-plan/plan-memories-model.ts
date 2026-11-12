import { z } from "zod";

/** A preference the traveller added on the plan page, in their own words. */
export type AddedPreference = {
  readonly id: string;
  readonly text: string;
  readonly addedAt: string;
};

const maxAdded = 20;
const maxCharacters = 80;

const storedSchema = z.array(z.strictObject({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(maxCharacters),
  addedAt: z.iso.datetime(),
})).max(maxAdded);

function storageKey(tripId: string): string {
  return `meri:plan-preferences:v1:${tripId}`;
}

/**
 * Adds what the traveller typed or picked, trimmed, without repeats of anything already
 * remembered, and up to a limit. Nothing here touches the drafted days.
 */
export function addPreferences(
  current: readonly AddedPreference[],
  texts: readonly string[],
  remembered: readonly string[],
  now: Date,
  newId: () => string,
): AddedPreference[] {
  const seen = new Set([...remembered, ...current.map(({ text }) => text)].map((text) => text.trim()));
  const added = [...current];
  for (const raw of texts) {
    const text = raw.trim().slice(0, maxCharacters);
    if (!text || seen.has(text) || added.length >= maxAdded) continue;
    seen.add(text);
    added.push({ id: newId(), text, addedAt: now.toISOString() });
  }
  return added;
}

// Kept in this tab beside the handoff, not in the handoff: changing the handoff would
// throw away the drafted days, and these preferences wait for the next change to the plan.
export function readAddedPreferences(tripId: string): AddedPreference[] {
  try {
    const value = window.sessionStorage.getItem(storageKey(tripId));
    return value === null ? [] : storedSchema.parse(JSON.parse(value));
  } catch {
    return [];
  }
}

export function saveAddedPreferences(tripId: string, preferences: readonly AddedPreference[]): void {
  try {
    window.sessionStorage.setItem(storageKey(tripId), JSON.stringify(preferences));
  } catch {
    // A full or blocked storage only loses the added preferences after a refresh.
  }
}
