type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function requestRecentJourneyDeletion(
  tripId: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}`, {
    method: "DELETE",
  });
  if (response.status !== 204) {
    throw new Error(`Journey deletion failed for ${tripId}: HTTP ${response.status}.`);
  }
}

export async function requestRecentJourneyDeletionOnce(
  tripId: string,
  pending: { current: boolean },
  fetcher: Fetcher = fetch,
): Promise<boolean> {
  if (pending.current) return false;
  pending.current = true;
  try {
    await requestRecentJourneyDeletion(tripId, fetcher);
    return true;
  } finally {
    pending.current = false;
  }
}
