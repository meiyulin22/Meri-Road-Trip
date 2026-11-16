/**
 * How many requests one client may make in a sliding window, counted in memory. One server
 * process, so the limit is per process: enough to stop one visitor or script draining a shared
 * quota, not a distributed limiter.
 */
export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number; maxClients?: number }) {
  const now = options.now ?? Date.now;
  const maxClients = options.maxClients ?? 10_000;
  const hits = new Map<string, number[]>();
  return {
    /** True when this request is within the limit (and is counted); false when it is over. */
    allow(client: string): boolean {
      const time = now();
      const recent = (hits.get(client) ?? []).filter((at) => at > time - options.windowMs);
      if (recent.length >= options.limit) {
        hits.set(client, recent);
        return false;
      }
      recent.push(time);
      hits.delete(client);
      hits.set(client, recent);
      // Forget the clients seen longest ago, so a crowd of addresses cannot grow memory without end.
      if (hits.size > maxClients) hits.delete(hits.keys().next().value as string);
      return true;
    },
  };
}
