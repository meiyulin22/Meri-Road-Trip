import { z } from "zod";

import { planPreferenceSchema, type PlanPreference, type PreferenceKind } from "@/domain/plan/trip-preference";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function base(tripId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/preferences`;
}

export async function listPreferences(tripId: string, fetcher: Fetcher = fetch): Promise<PlanPreference[]> {
  const response = await fetcher(base(tripId), { cache: "no-store" });
  if (!response.ok) throw new Error("Preferences request failed.");
  return z.object({ preferences: z.array(planPreferenceSchema) }).parse(await response.json()).preferences;
}

export async function addPreference(
  tripId: string,
  text: string,
  kind: PreferenceKind | undefined,
  fetcher: Fetcher = fetch,
): Promise<PlanPreference> {
  const response = await fetcher(base(tripId), {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kind ? { text, kind } : { text }),
  });
  if (!response.ok) throw new Error("Adding a preference failed.");
  return z.object({ preference: planPreferenceSchema }).parse(await response.json()).preference;
}

export async function removePreference(tripId: string, preferenceId: string, fetcher: Fetcher = fetch): Promise<void> {
  const response = await fetcher(`${base(tripId)}/${encodeURIComponent(preferenceId)}`, { method: "DELETE", cache: "no-store" });
  if (!response.ok && response.status !== 404) throw new Error("Removing a preference failed.");
}

/**
 * The common choices in the add sheet, in the order the sheet lists them, already know
 * their kind. Anything else the traveller writes is labelled by the server.
 */
const suggestionKinds: readonly PreferenceKind[] = ["companions", "walking", "avoid", "budget", "interests", "diet", "pace"];

export function kindOfSuggestion(text: string, suggestions: readonly string[]): PreferenceKind | undefined {
  const index = suggestions.indexOf(text);
  return index >= 0 ? suggestionKinds[index] : undefined;
}
