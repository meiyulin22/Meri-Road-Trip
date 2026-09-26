import type { LocationCandidate } from "@/domain/location/location";
import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";

import type { LocationResolveResult, LocationService } from "./location-service";

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

function candidateLabel(candidate: LocationCandidate): string {
  const context = candidate.region ?? candidate.address;
  return context ? `${candidate.name}（${context}）` : candidate.name;
}

export function replyAfterDestinationResolution(
  interpretation: WorkspaceConversationInterpretation,
  tripState: TripState,
  resolution: LocationResolveResult | null,
  persistedPatch: TripStatePatch | null,
): string {
  if (resolution === null || resolution.status === "not_ready") return interpretation.reply;
  const otherChanges = persistedPatch && Object.keys(persistedPatch).some((field) => field !== "destination")
    ? "其他旅程信息也已保存。"
    : "";

  switch (resolution.status) {
    case "selected":
      return interpretation.reply;
    case "resolved":
      return `已将目的地记为「${tripState.destination.state === "missing" ? resolution.candidate.name : tripState.destination.value}」。${otherChanges}匹配到地点：${candidateLabel(resolution.candidate)}。`;
    case "ambiguous":
      return `${otherChanges}找到多个可能的地点，请从下方选一个。`;
    case "unresolved":
      return `${otherChanges}目前无法识别这个地点。请补充地区或更具体的名称。`;
    case "provider_error":
      return `${otherChanges}地点验证暂时不可用，未更改目的地。请稍后再试。`;
  }
}
