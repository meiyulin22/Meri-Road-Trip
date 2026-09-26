import { validateTripMessage, type TripMessage } from "@/domain/trip-message/trip-message";
import { requestTripStateUpdate } from "./trip-state-persistence-model";
import type { TripState } from "@/domain/trip-state/trip-state";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const DEFAULT_DESTINATION_IMAGE = "/backgrounds/home-v2-landscape.png";

export function destinationImageUrl(imageUrl: string | null, imageFailed: boolean): string {
  return imageFailed ? DEFAULT_DESTINATION_IMAGE : imageUrl ?? DEFAULT_DESTINATION_IMAGE;
}

export async function requestDestinationRecommendations(
  tripId: string,
  fetcher: Fetcher = fetch,
): Promise<TripMessage> {
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/destination-recommendations`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Destination recommendations request failed.");
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("message" in body)) {
    throw new Error("Destination recommendation response is invalid.");
  }
  const message = validateTripMessage(body.message);
  if (message.role !== "assistant" || message.presentation?.type !== "destination_recommendations") {
    throw new Error("Destination recommendation response lacks its presentation.");
  }
  return message;
}

export function recommendationSelectionPatch(name: string) {
  return { destination: { state: "known" as const, value: name, source: "user" as const } };
}

export async function selectDestinationRecommendation(
  tripId: string, name: string, fetcher: Fetcher = fetch,
): Promise<TripState> {
  return requestTripStateUpdate(tripId, recommendationSelectionPatch(name), fetcher);
}

export async function selectDestinationRecommendationAndApply(
  tripId: string, name: string, onPersisted: (state: TripState) => void, fetcher: Fetcher = fetch,
): Promise<void> {
  onPersisted(await selectDestinationRecommendation(tripId, name, fetcher));
}
