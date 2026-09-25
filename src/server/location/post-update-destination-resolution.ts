import type { LocationCandidate } from "@/domain/location/location";
import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";

import type { LocationResolveResult, LocationService } from "./location-service";

export async function persistWorkspacePatchAndResolveDestination(
  previousState: TripState,
  patch: TripStatePatch | null,
  persistPatch: (patch: TripStatePatch) => Promise<TripState>,
  locationService: LocationService,
): Promise<{ tripState: TripState; resolution: LocationResolveResult | null }> {
  if (patch === null) return { tripState: previousState, resolution: null };

  const tripState = await persistPatch(patch);
  const previous = previousState.destination;
  const current = tripState.destination;
  const destinationChanged = patch.destination !== undefined && (
    previous.state !== current.state ||
    (previous.state !== "missing" && current.state !== "missing" && previous.value !== current.value)
  );

  if (!destinationChanged || current.state === "missing") {
    return { tripState, resolution: null };
  }

  return { tripState, resolution: await locationService.resolve(tripState) };
}

function candidateLabel(candidate: LocationCandidate): string {
  const context = candidate.region ?? candidate.address;
  return context ? `${candidate.name}（${context}）` : candidate.name;
}

export function replyAfterDestinationResolution(
  interpretation: WorkspaceConversationInterpretation,
  tripState: TripState,
  resolution: LocationResolveResult | null,
): string {
  if (resolution === null || resolution.status === "not_ready") return interpretation.reply;
  if (tripState.destination.state === "missing") return interpretation.reply;

  const saved = `已将目的地记为「${tripState.destination.value}」。`;
  const otherChanges = interpretation.changes.some((change) => change.field !== "destination")
    ? "其他旅程信息也已保存。"
    : "";

  switch (resolution.status) {
    case "selected":
      return interpretation.reply;
    case "resolved":
      return `${saved}${otherChanges}匹配到地点：${candidateLabel(resolution.candidate)}。`;
    case "ambiguous":
      return `${saved}${otherChanges}找到多个可能的地点：${resolution.candidates.map(candidateLabel).join("、")}。你指的是哪一个？`;
    case "unresolved":
      return `${saved}${otherChanges}目前无法识别这个地点的地理位置。请补充地区或更具体的名称。`;
    case "provider_error":
      return `${saved}${otherChanges}地点查询暂时失败，无法确认地理位置。稍后可以再试。`;
  }
}
