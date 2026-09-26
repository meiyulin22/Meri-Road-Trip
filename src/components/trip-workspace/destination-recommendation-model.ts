import { validateDestinationRecommendations, type DestinationRecommendations } from "@/domain/location/destination-recommendations";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function requestDestinationRecommendations(
  tripId: string,
  fetcher: Fetcher = fetch,
): Promise<DestinationRecommendations> {
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/destination-recommendations`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Destination recommendations request failed.");
  return validateDestinationRecommendations(await response.json());
}
