import type { DestinationDisambiguation } from "@/domain/location/destination-disambiguation";
import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";

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
    if (resolution.status !== "resolved") {
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

function withoutDestination(patch: TripStatePatch): TripStatePatch {
  const otherFields: { -readonly [K in keyof TripState]?: TripState[K] } = { ...patch };
  delete otherFields.destination;
  return otherFields;
}

export function replyAfterDestinationResolution(
  interpretation: WorkspaceConversationInterpretation,
  tripState: TripState,
  resolution: LocationResolveResult | null,
  persistedPatch: TripStatePatch | null,
): string {
  if (resolution === null || resolution.status === "not_ready") return interpretation.reply;
  const otherChanges = persistedPatch && Object.keys(persistedPatch).some((field) => field !== "destination")
    ? "你提到的其他信息也记下了。"
    : "";

  switch (resolution.status) {
    case "selected":
      return interpretation.reply;
    case "resolved": {
      if (tripState.destination.state !== "known") {
        return `${otherChanges}我找到了与你描述相符的地点，但目的地还没有明确下来。想更具体时，可以告诉我你打算去哪里。`;
      }
      const destination = tripState.destination.value;
      const hasDate = tripState.startDate.state !== "missing" || tripState.endDate.state !== "missing";
      const hasDuration = tripState.duration.state !== "missing";
      if (!hasDate && !hasDuration) {
        return `好，目的地记下了：${destination}。想继续完善的话，可以告诉我大概什么时候去、准备玩几天。`;
      }
      if (!hasDate) {
        const durationNote = tripState.duration.state === "known" ? "行程时长也已经记下。" : "";
        return `好，目的地记下了：${destination}。${durationNote}想好什么时候出发时再告诉我就行。`;
      }
      if (!hasDuration) {
        const dateNote = tripState.startDate.state === "known" || tripState.endDate.state === "known"
          ? "时间也已经记下。" : "";
        return `好，目的地记下了：${destination}。${dateNote}再告诉我大概玩几天，就更完整了。`;
      }
      const detailsNote = (tripState.startDate.state === "known" || tripState.endDate.state === "known") &&
        tripState.duration.state === "known" ? "时间和行程时长也已经记下。" : "";
      return `好，目的地记下了：${destination}。${detailsNote}之后有新想法，随时告诉我。`;
    }
    case "ambiguous":
      return `${otherChanges}我找到几个可能的地点。你想去下面哪一个？`;
    case "unresolved":
      return `${otherChanges}我还没能确认这个地点，所以没有改动目的地。能告诉我更具体的地名或所在地区吗？`;
    case "provider_error":
      return `${otherChanges}地点查询暂时不可用，目的地还没有改动。稍后可以再试一次。`;
  }
}
