import type { UIMessage } from "ai";

import { recommendationsAwaitingPhoto, type DestinationChoicesPresentation, type DestinationRecommendationPresentation, type DestinationRecommendationsPendingPresentation, type LocationCandidatesPresentation, type TripMessage } from "@/domain/trip-message/trip-message";
import type { RecommendationPhoto } from "@/capabilities/recommendation/recommendation-photos";
import { picksFromSearch } from "@/capabilities/destination/resolve-destination-place";

export function toWorkspaceUIMessages(messages: readonly TripMessage[]): UIMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
    metadata: { createdAt: message.createdAt, ...(message.presentation ? { presentation: message.presentation } : {}) },
  }));
}

export function messageCreatedAt(message: UIMessage): string | null {
  const metadata = message.metadata;
  return typeof metadata === "object" && metadata !== null && "createdAt" in metadata &&
    typeof metadata.createdAt === "string" ? metadata.createdAt : null;
}

export function recommendationPresentation(message: UIMessage): DestinationRecommendationPresentation | undefined {
  const metadata = message.metadata;
  if (typeof metadata !== "object" || metadata === null || !("presentation" in metadata)) return undefined;
  const presentation = metadata.presentation as TripMessage["presentation"];
  return presentation?.type === "destination_recommendations" ? presentation : undefined;
}

/** The cards in this message whose photo no one has looked up yet. */
export function recommendationIdsAwaitingPhoto(message: UIMessage): readonly string[] {
  const presentation = recommendationPresentation(message);
  return presentation ? recommendationsAwaitingPhoto(presentation).map((item) => item.id) : [];
}

/** Puts one streamed photo onto its card, leaving every other message as it was. */
export function withRecommendationPhoto(
  messages: readonly UIMessage[], messageId: string, photo: RecommendationPhoto,
): UIMessage[] {
  return messages.map((message) => {
    const presentation = message.id === messageId ? recommendationPresentation(message) : undefined;
    if (!presentation) return message;
    return { ...message, metadata: { ...(message.metadata as Record<string, unknown>), presentation: {
      ...presentation,
      destinations: presentation.destinations.map((item) => item.id === photo.id ? { ...item, image: photo.image } : item),
    } } };
  });
}

export function locationCandidatePresentation(message: UIMessage): LocationCandidatesPresentation | undefined {
  const metadata = message.metadata;
  if (typeof metadata !== "object" || metadata === null || !("presentation" in metadata)) return undefined;
  const presentation = metadata.presentation as TripMessage["presentation"];
  return presentation?.type === "location_candidates" ? presentation : undefined;
}

export function destinationChoicePresentation(message: UIMessage): DestinationChoicesPresentation | undefined {
  const metadata = message.metadata;
  if (typeof metadata !== "object" || metadata === null || !("presentation" in metadata)) return undefined;
  const presentation = metadata.presentation as TripMessage["presentation"];
  if (presentation?.type === "destination_choices") return presentation;
  if (presentation?.type === "destination_recommendations") return { type: "destination_choices", mode: "add",
    choices: presentation.destinations.flatMap((item) => item.province === null ? [] :
      [{ id: item.id, name: item.name, province: item.province, reason: item.reason,
        legacyUnverified: !/(省|市|自治区|特别行政区)$/u.test(item.province),
        ...(item.image ? { image: item.image } : {}) }]) };
  if (presentation?.type === "location_candidates") return { type: "destination_choices", mode: "add",
    choices: picksFromSearch(presentation.candidates).map((pick) => ({ id: pick.id,
      name: pick.spot ?? pick.place ?? pick.province, province: pick.province,
      ...(pick.place === null ? {} : { city: pick.place }),
      ...(pick.spot === null ? {} : { spot: pick.spot }),
      ...(pick.detail ? { detail: pick.detail } : {}) })) };
  return undefined;
}

export function appendPersistedMessageIfAbsent(
  messages: UIMessage[],
  persisted: TripMessage,
): UIMessage[] {
  return messages.some((message) => message.id === persisted.id)
    ? messages
    : [...messages, ...toWorkspaceUIMessages([persisted])];
}

/** A reply whose recommendation cards are still on their way. */
export function pendingRecommendationPresentation(message: UIMessage): DestinationRecommendationsPendingPresentation | undefined {
  const metadata = message.metadata;
  if (typeof metadata !== "object" || metadata === null || !("presentation" in metadata)) return undefined;
  const presentation = metadata.presentation as TripMessage["presentation"];
  return presentation?.type === "destination_recommendations_pending" ? presentation : undefined;
}
