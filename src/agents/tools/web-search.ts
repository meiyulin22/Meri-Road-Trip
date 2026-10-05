import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { createBochaDiscoverySearchFromEnvironment } from "@/platform/search/bocha-discovery-search";
import type { DiscoverySearch } from "@/platform/search/discovery-search";

const maxResults = 5;

const webSearchOutput = z.object({
  status: z.enum(["ok", "unavailable"]),
  results: z.array(z.object({
    title: z.string(),
    snippet: z.string().nullable(),
    url: z.string(),
    source: z.string(),
    publishedAt: z.string().nullable(),
  })),
});

/**
 * A web search through Bocha. Results are leads, not evidence: a page saying a road
 * is closed may be years old, so the date travels with every result.
 */
export function createWebSearchTool(search: DiscoverySearch) {
  return createTool({
    id: "web-search",
    description: "Search the web (Bocha, good for Chinese sources) for recent notices about a place: closures, " +
      "reservations, seasonal access. Results are unverified leads with their publish date; never treat one as proof.",
    inputSchema: z.object({ query: z.string().min(1).max(120).describe("Search query, Chinese works best") }),
    outputSchema: webSearchOutput,
    execute: async ({ query }) => {
      try {
        const results = await search.search(query);
        return { status: "ok" as const, results: results.slice(0, maxResults).map((result) => ({
          title: result.title, snippet: result.snippet ?? null, url: result.url,
          source: result.source, publishedAt: result.publishedAt ?? null,
        })) };
      } catch {
        // Provider errors can carry the token-bearing request URL; the agent only needs to know it failed.
        return { status: "unavailable" as const, results: [] };
      }
    },
  });
}

export const webSearchTool = createWebSearchTool(createBochaDiscoverySearchFromEnvironment());
