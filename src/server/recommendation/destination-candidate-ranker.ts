import { z } from "zod";

import type { DestinationCandidate } from "@/domain/location/destination-candidates";
import { buildDestinationRankerSystemPrompt } from "@/server/recommendation/prompts/destination-ranker-prompt";
import type { DiscoverySearchResult } from "@/platform/search/discovery-search";
import type { DestinationRecommendationContext } from "./destination-recommendation-context";
import { createAiSdkKimiClientFromEnvironment } from "@/platform/llm/ai-sdk-kimi-client";
import type { StructuredOutputModelClient } from "@/platform/llm/kimi-client";

const MAX_RESULTS = 3;
const MAX_DISCOVERY_RESULTS = 8;
const rankingSchema = z.strictObject({
  rankings: z.array(z.strictObject({
    candidateId: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(240),
    evidenceIds: z.array(z.string().trim().min(1)).max(MAX_DISCOVERY_RESULTS),
  })).max(MAX_RESULTS),
});

export type RankedDestinationCandidate = {
  readonly candidate: DestinationCandidate;
  readonly reason: string;
  readonly evidence: readonly DiscoverySearchResult[];
};

export class InvalidDestinationRankingOutputError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "InvalidDestinationRankingOutputError";
  }
}

export function destinationRankingJsonSchema(count: number): Record<string, unknown> {
  return {
    type: "object", additionalProperties: false, required: ["rankings"],
    properties: {
      rankings: { type: "array", minItems: count, maxItems: count, items: {
        type: "object", additionalProperties: false,
        required: ["candidateId", "reason", "evidenceIds"],
        properties: {
          candidateId: { type: "string", minLength: 1 },
          reason: { type: "string", minLength: 1, maxLength: 240 },
          evidenceIds: { type: "array", maxItems: MAX_DISCOVERY_RESULTS,
            items: { type: "string", minLength: 1 } },
        },
      } },
    },
  };
}

export async function rankDestinationCandidates(
  context: DestinationRecommendationContext,
  eligibleCandidates: readonly DestinationCandidate[],
  requestId: string,
  discoveryResults: readonly DiscoverySearchResult[] = [],
  client?: StructuredOutputModelClient,
): Promise<readonly RankedDestinationCandidate[]> {
  if (!eligibleCandidates.length) return [];
  const candidatesById = new Map(eligibleCandidates.map((candidate) => [candidate.id, candidate]));
  if (candidatesById.size !== eligibleCandidates.length) {
    throw new InvalidDestinationRankingOutputError("Eligible candidate IDs must be unique.");
  }
  const evidence = discoveryResults.slice(0, MAX_DISCOVERY_RESULTS)
    .map((result, index) => ({ id: `e${index + 1}`, result }));
  const evidenceById = new Map(evidence.map((item) => [item.id, item.result]));
  const count = Math.min(MAX_RESULTS, eligibleCandidates.length);
  const response = await (client ?? createAiSdkKimiClientFromEnvironment({ debugRawOutput: false }))
    .generateStructuredOutput({
      requestId, operation: "destination_candidate_ranking", schemaName: "destination_candidate_ranking",
      systemPrompt: buildDestinationRankerSystemPrompt(context),
      conversationHistory: context.conversationHistory,
      userMessage: JSON.stringify({
        rankCount: count,
        eligibleCandidates: eligibleCandidates.map(({ id, name, region, preferenceRationale }) =>
          ({ id, name, region, preferenceRationale })),
        discoveryEvidence: evidence.map(({ id, result }) => ({ id, ...result })),
      }),
      jsonSchema: destinationRankingJsonSchema(count),
    });
  if (response.finishReason === "length" || !response.content?.trim()) {
    throw new InvalidDestinationRankingOutputError("Destination ranking output is empty or truncated.");
  }
  try {
    const rankings = rankingSchema.parse(JSON.parse(response.content)).rankings;
    if (rankings.length !== count) throw new Error("Destination ranking count is invalid.");
    const rankedIds = new Set<string>();
    return rankings.map(({ candidateId, reason, evidenceIds }) => {
      const candidate = candidatesById.get(candidateId);
      if (!candidate || rankedIds.has(candidateId)) throw new Error("Destination ranking candidate ID is invalid.");
      rankedIds.add(candidateId);
      if (new Set(evidenceIds).size !== evidenceIds.length || evidenceIds.some((id) => !evidenceById.has(id))) {
        throw new Error("Destination ranking evidence ID is invalid.");
      }
      if (/https?:\/\//iu.test(reason)) throw new Error("Destination ranking reason includes a URL.");
      return { candidate, reason, evidence: evidenceIds.map((id) => evidenceById.get(id)!) };
    });
  } catch (error) {
    throw new InvalidDestinationRankingOutputError("Destination ranking output is invalid.", error);
  }
}
