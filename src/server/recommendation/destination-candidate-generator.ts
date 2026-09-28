import { randomUUID } from "node:crypto";

import { validateDestinationCandidatePool, type DestinationCandidate } from "@/domain/location/destination-candidates";
import { buildDestinationCandidateSystemPrompt } from "@/server/recommendation/prompts/destination-candidate-prompt";
import type { DiscoverySearchResult } from "@/platform/search/discovery-search";
import type { DestinationRecommendationContext } from "./destination-recommendation-context";
import { createAiSdkKimiClientFromEnvironment } from "@/platform/llm/ai-sdk-kimi-client";
import type { StructuredOutputModelClient } from "@/platform/llm/kimi-client";

export const destinationCandidateJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      minItems: 8,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "region", "preferenceRationale"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 80, description: "Concise real-world destination or route expression." },
          region: { type: ["string", "null"], maxLength: 50, description: "Province-level region when useful and known; otherwise null." },
          preferenceRationale: { type: "string", minLength: 1, maxLength: 300 },
        },
      },
    },
  },
};

export class InvalidDestinationCandidateOutputError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "InvalidDestinationCandidateOutputError";
  }
}

export async function generateDestinationCandidates(
  context: DestinationRecommendationContext & { readonly discoveryResults?: readonly DiscoverySearchResult[] },
  requestId: string,
  client: StructuredOutputModelClient = createAiSdkKimiClientFromEnvironment(),
  generateId: () => string = randomUUID,
): Promise<readonly DestinationCandidate[]> {
  const response = await client.generateStructuredOutput({
    requestId,
    operation: "destination_candidates",
    schemaName: "destination_candidates",
    systemPrompt: buildDestinationCandidateSystemPrompt(context),
    conversationHistory: context.conversationHistory,
    jsonSchema: destinationCandidateJsonSchema,
  });
  if (response.finishReason === "length" || !response.content?.trim()) {
    throw new InvalidDestinationCandidateOutputError("Destination candidate output is empty or truncated.");
  }
  try {
    const proposals = validateDestinationCandidatePool(JSON.parse(response.content));
    const candidates = proposals.map((proposal) => ({ id: generateId(), ...proposal }));
    if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
      throw new Error("Generated candidate IDs must be distinct.");
    }
    return candidates;
  } catch (error) {
    throw new InvalidDestinationCandidateOutputError("Destination candidate output is invalid.", error);
  }
}
