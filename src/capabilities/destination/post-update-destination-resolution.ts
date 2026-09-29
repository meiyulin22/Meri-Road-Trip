import type { DestinationDisambiguation } from "@/domain/location/destination-disambiguation";
import { destinationAreasText } from "@/domain/trip-state/destination-areas";
import type { DestinationField, TripFieldSource, TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";
import { composeTurnReply, type DestinationTurnFact } from "@/capabilities/conversation/turn-reply";

import type { LocationResolveResult, LocationService } from "./location-service";
import { verifyDestinationDisambiguation, type DestinationDisambiguationResult } from "./verify-destination-disambiguation";

export async function persistWorkspacePatchWithDisambiguation(
  previousState: TripState,
  patch: TripStatePatch | null,
  disambiguation: DestinationDisambiguation | null | undefined,
  persistPatch: (patch: TripStatePatch) => Promise<TripState>,
  locationService: LocationService,
): Promise<{ tripState: TripState; resolution: LocationResolveResult | null;
  persistedPatch: TripStatePatch | null; disambiguationResult: DestinationDisambiguationResult | null }> {
  if (disambiguation?.state !== "known") {
    return { ...await persistWorkspacePatchWithDestinationValidation(previousState, patch, persistPatch, locationService),
      disambiguationResult: null };
  }
  const disambiguationResult = await verifyDestinationDisambiguation(disambiguation, locationService);
  const otherFields = patch ? withoutDestination(patch) : null;
  const result = await persistWorkspacePatchWithDestinationValidation(
    previousState,
    otherFields && Object.keys(otherFields).length > 0 ? otherFields : null,
    persistPatch,
    locationService,
  );
  return { ...result, disambiguationResult };
}

export async function persistWorkspacePatchWithDestinationValidation(
  previousState: TripState,
  patch: TripStatePatch | null,
  persistPatch: (patch: TripStatePatch) => Promise<TripState>,
  locationService: LocationService,
): Promise<{ tripState: TripState; resolution: LocationResolveResult | null; persistedPatch: TripStatePatch | null }> {
  if (patch === null) return { tripState: previousState, resolution: null, persistedPatch: null };

  const previous = previousState.destination;
  const current = patch.destination;
  const destinationChanged = patch.destination !== undefined && (
    previous.state !== current?.state ||
    (previous.state !== "missing" && current?.state !== "missing" && previous.value !== current?.value)
  );
  let resolution: LocationResolveResult | null = null;
  let persistedPatch: TripStatePatch = patch;
  if (destinationChanged && current?.state !== "missing" && current !== undefined) {
    resolution = await locationService.resolveExpression(current.value);
    if (resolution.status === "area") {
      persistedPatch = { ...patch, destination: destinationForProvince(resolution.province, current.source) };
    } else if (resolution.status !== "resolved") {
      persistedPatch = withoutDestination(patch);
    }
  } else if (!destinationChanged && current !== undefined) {
    persistedPatch = withoutDestination(patch);
  }
  if (Object.keys(persistedPatch).length === 0) {
    return { tripState: previousState, resolution, persistedPatch: null };
  }
  return { tripState: await persistPatch(persistedPatch), resolution, persistedPatch };
}

/**
 * A province is not a point, so it cannot be "known" — but it is what the user
 * said, and dropping it threw away the one thing they had told us: 「我想去海南」
 * came back as "I could not verify that". It is stored as the approximate
 * destination it is, carrying the province as its only area. Which places inside
 * it are wanted is a later question, and the answer goes into the same area.
 */
function destinationForProvince(province: string, source: TripFieldSource): DestinationField {
  const areas = [{ province, places: [] }] as const;
  return { state: "approximate", value: destinationAreasText(areas), source, areas };
}

function withoutDestination(patch: TripStatePatch): TripStatePatch {
  const otherFields: { -readonly [K in keyof TripState]?: TripState[K] } = { ...patch };
  delete otherFields.destination;
  return otherFields;
}

/**
 * Facts, not phrasings: the model wrote its reply before anything was
 * validated, so it assumed the destination it proposed would land.
 */
function destinationFactFromResolution(
  resolution: LocationResolveResult | null,
  tripState: TripState,
): DestinationTurnFact {
  if (resolution === null) return { kind: "untouched" };
  switch (resolution.status) {
    case "not_ready":
    case "selected":
      return { kind: "untouched" };
    case "resolved":
      return tripState.destination.state === "known" ? { kind: "confirmed" } : { kind: "unsettled" };
    case "ambiguous":
      return { kind: "choice_pending" };
    case "area":
      return { kind: "area_recorded" };
    case "unresolved":
      return { kind: "not_identified", expression: null };
    case "provider_error":
      return { kind: "lookup_unavailable", expression: null };
  }
}

export function replyAfterDestinationResolution(
  interpretation: WorkspaceConversationInterpretation,
  tripState: TripState,
  resolution: LocationResolveResult | null,
  persistedPatch: TripStatePatch | null,
): string {
  return composeTurnReply({
    modelReply: interpretation.reply,
    destination: destinationFactFromResolution(resolution, tripState),
    otherFieldsSaved: persistedPatch !== null &&
      Object.keys(persistedPatch).some((field) => field !== "destination"),
  });
}
