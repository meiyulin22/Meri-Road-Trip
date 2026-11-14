import { randomUUID } from "node:crypto";

import { z } from "zod";

import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import {
  maxActivePreferences,
  maxPreferenceQuoteLength,
  preferenceKinds,
  samePreferenceQuote,
  toPlanPreference,
  type PreferenceKind,
  type TripPreference,
} from "@/domain/plan/trip-preference";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { logger } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";

type PreferenceDependencies = {
  /** Throws TripNotFoundError when the guest does not own the trip. */
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<unknown>;
  readonly listPreferences: (tripId: string) => Promise<readonly TripPreference[]>;
  readonly create: (preference: TripPreference) => Promise<void>;
  readonly markRemoved: (tripId: string, preferenceId: string, at: string) => Promise<boolean>;
  readonly labelPreference: (text: string, requestId: string) => Promise<{ label: string; kind: PreferenceKind }>;
  readonly now: () => Date;
  readonly newId: () => string;
};

/** A common choice on the plan page already knows its kind; a sentence the traveller wrote is labelled by the model. */
const addSchema = z.strictObject({
  text: z.string().trim().min(1).max(maxPreferenceQuoteLength),
  kind: z.enum(preferenceKinds).optional(),
});

function noStore(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function failure(status: number, code: string, message: string): Response {
  return noStore({ error: { code, message } }, status);
}

async function owned(
  tripId: string,
  ownerGuestId: string | null,
  dependencies: PreferenceDependencies,
  run: () => Promise<Response>,
): Promise<Response> {
  if (!ownerGuestId) return failure(404, "journey_not_found", "Journey not found.");
  try {
    await dependencies.loadJourney(tripId, ownerGuestId);
    return await run();
  } catch (error) {
    if (error instanceof TripNotFoundError || error instanceof TripStateNotFoundError) {
      return failure(404, "journey_not_found", "Journey not found.");
    }
    logger.error({ tripId, error: serializeError(error) }, "Trip preferences request failed");
    return failure(500, "internal_error", "Failed to update preferences.");
  }
}

export function handlePreferencesGet(tripId: string, ownerGuestId: string | null, dependencies: PreferenceDependencies) {
  return owned(tripId, ownerGuestId, dependencies, async () => {
    const preferences = await dependencies.listPreferences(tripId);
    return noStore({ preferences: preferences.filter(({ status }) => status === "active").map(toPlanPreference) });
  });
}

/**
 * Adds a preference written or picked on the plan page. It never re-plans: the drafted
 * days stay as they are until the traveller next changes the plan.
 */
export function handlePreferencesPost(
  tripId: string,
  ownerGuestId: string | null,
  body: unknown,
  dependencies: PreferenceDependencies,
) {
  return owned(tripId, ownerGuestId, dependencies, async () => {
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) return failure(400, "invalid_preference", "A preference needs a short sentence.");
    const { text, kind } = parsed.data;

    const active = (await dependencies.listPreferences(tripId)).filter(({ status }) => status === "active");
    const same = active.find(({ quote }) => samePreferenceQuote(quote, text));
    if (same) return noStore({ preference: toPlanPreference(same) });
    if (active.length >= maxActivePreferences) return failure(409, "too_many_preferences", "This trip already remembers many preferences.");

    const labelled = kind ? { label: text, kind } : await dependencies.labelPreference(text, randomUUID());
    const preference: TripPreference = {
      id: dependencies.newId(), tripId, label: labelled.label, kind: labelled.kind, quote: text,
      source: "plan_page", messageId: null, status: "active", createdAt: dependencies.now().toISOString(),
    };
    await dependencies.create(preference);
    return noStore({ preference: toPlanPreference(preference) }, 201);
  });
}

/** Removing keeps the row, marked removed, so the same words are not extracted back later. */
export function handlePreferenceDelete(
  tripId: string,
  ownerGuestId: string | null,
  preferenceId: string,
  dependencies: PreferenceDependencies,
) {
  return owned(tripId, ownerGuestId, dependencies, async () => {
    const removed = await dependencies.markRemoved(tripId, preferenceId, dependencies.now().toISOString());
    return removed ? new Response(null, { status: 204 }) : failure(404, "preference_not_found", "Preference not found.");
  });
}
