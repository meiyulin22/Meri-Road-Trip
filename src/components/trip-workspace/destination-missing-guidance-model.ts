import { validateTripMessage, type TripMessage } from "@/domain/trip-message/trip-message";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function requestDestinationMissingGuidance(
  tripId: string,
  fetcher: Fetcher = fetch,
): Promise<TripMessage> {
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/destination-missing-guidance`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Destination guidance request failed.");
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("message" in body)) {
    throw new Error("Destination guidance response is invalid.");
  }
  const message = validateTripMessage(body.message);
  if (message.role !== "assistant" || message.tripId !== tripId) {
    throw new Error("Destination guidance message is invalid.");
  }
  return message;
}
