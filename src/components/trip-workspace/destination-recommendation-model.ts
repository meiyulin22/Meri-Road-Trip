import { parsePlaceImage } from "@/domain/location/place-image";
import { validateTripMessage, type TripMessage } from "@/domain/trip-message/trip-message";
import type { RecommendationPhoto } from "@/capabilities/recommendation/recommendation-photos";
import type { DestinationRecommendationPresentation } from "@/domain/trip-message/trip-message";
import { validateTripState, type TripState } from "@/domain/trip-state/trip-state";
import { DestinationOfferExpiredError, DestinationSelectionFollowUpError, RecommendationsStaleError, WorkspaceConversationRequestError } from "./workspace-conversation-model";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type OfferedDestinations = DestinationRecommendationPresentation["destinations"];

export type RecommendationProvinceGroup = {
  readonly province: string | null;
  readonly destinations: OfferedDestinations;
};

export function canSelectDestinationRecommendation(
  _tripState: TripState,
  presentation?: DestinationRecommendationPresentation,
): boolean {
  return presentation !== undefined;
}

/** Provinces in the order they were offered, each keeping its own places' order. */
export function groupRecommendationsByProvince(
  destinations: OfferedDestinations,
): readonly RecommendationProvinceGroup[] {
  const groups: { province: string | null; destinations: OfferedDestinations[number][] }[] = [];
  for (const destination of destinations) {
    const group = groups.find((item) => item.province === destination.province);
    if (group === undefined) groups.push({ province: destination.province, destinations: [destination] });
    else group.destinations.push(destination);
  }
  return groups;
}

/** The places already settled, so a reopened Journey shows what was picked. */
export function chosenDestinationPlaces(tripState: TripState): readonly string[] {
  const destination = tripState.destination;
  if (destination.state !== "known") return [];
  return destination.areas.flatMap((area) => area.places.map((place) => place.name));
}

/**
 * Picking a recommendation card goes through its own endpoint rather than a plain
 * TripState write, because the server has to confirm the card was really offered,
 * check what can be planned next, and answer the user.
 */
export async function selectDestinationRecommendation(
  tripId: string, messageId: string, destinationIds: readonly string[], fetcher: Fetcher = fetch,
): Promise<{ readonly tripState: TripState; readonly assistantMessage: TripMessage }> {
  const response = await fetcher(
    `/api/trips/${encodeURIComponent(tripId)}/destination-recommendation-selection`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, destinationIds }) });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new WorkspaceConversationRequestError("Destination recommendation selection response is invalid.");
  }
  if (!response.ok) {
    if (response.status === 409 && typeof body === "object" && body !== null &&
      "code" in body && body.code === "offer_expired") throw new DestinationOfferExpiredError();
    if (typeof body === "object" && body !== null && "code" in body &&
      body.code === "follow_up_unavailable" && "tripState" in body) {
      throw new DestinationSelectionFollowUpError(validateTripState(body.tripState));
    }
    throw new WorkspaceConversationRequestError("Destination recommendation selection failed.");
  }
  if (typeof body !== "object" || body === null || !("tripState" in body) || !("assistantMessage" in body)) {
    throw new WorkspaceConversationRequestError("Destination recommendation selection response is invalid.");
  }
  const tripState = validateTripState(body.tripState);
  const assistantMessage = validateTripMessage(body.assistantMessage);
  if (assistantMessage.role !== "assistant" || assistantMessage.tripId !== tripId) {
    throw new WorkspaceConversationRequestError("Destination recommendation selection follow-up is invalid.");
  }
  return { tripState, assistantMessage };
}

/**
 * Asks for the cards a reply promised. The server reads what to recommend from the
 * stored conversation, so the browser only names the reply; asking twice returns the
 * same message.
 */
export async function requestPendingRecommendations(
  tripId: string, messageId: string, fetcher: Fetcher = fetch,
): Promise<TripMessage> {
  const response = await fetcher(
    `/api/trips/${encodeURIComponent(tripId)}/destination-recommendations`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId }) });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new WorkspaceConversationRequestError("Destination recommendations response is invalid.");
  }
  if (response.status === 409) throw new RecommendationsStaleError();
  if (!response.ok || typeof body !== "object" || body === null || !("assistantMessage" in body)) {
    throw new WorkspaceConversationRequestError("Destination recommendations failed.");
  }
  const assistantMessage = validateTripMessage(body.assistantMessage);
  if (assistantMessage.role !== "assistant" || assistantMessage.tripId !== tripId) {
    throw new WorkspaceConversationRequestError("Destination recommendations message is invalid.");
  }
  return assistantMessage;
}

/** One streamed line, or null when it is not a card's answer. A bad photo is no photo. */
export function parseRecommendationPhotoLine(line: string): RecommendationPhoto | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || !("id" in value) || typeof value.id !== "string" ||
    !("image" in value)) {
    return null;
  }
  return { id: value.id, image: value.image === null ? null : parsePlaceImage(value.image) };
}

/**
 * Reads the photos for cards already on screen as the server finds them, one JSON line
 * per card, and hands each to `onPhoto` as it arrives. Resolves when every card has
 * its answer; a card the stream never answered keeps no photo.
 */
export async function streamRecommendationPhotos(
  tripId: string, messageId: string, onPhoto: (photo: RecommendationPhoto) => void, fetcher: Fetcher = fetch,
): Promise<void> {
  const response = await fetcher(
    `/api/trips/${encodeURIComponent(tripId)}/destination-recommendation-photos`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId }) });
  if (!response.ok) throw new WorkspaceConversationRequestError("Recommendation photos failed.");
  if (!response.body) return;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  for (;;) {
    const { value, done } = await reader.read();
    pending += value ?? "";
    const complete = pending.split("\n");
    pending = done ? "" : complete.pop() ?? "";
    for (const line of complete) {
      const photo = line.trim() === "" ? null : parseRecommendationPhotoLine(line);
      if (photo) onPhoto(photo);
    }
    if (done) return;
  }
}
