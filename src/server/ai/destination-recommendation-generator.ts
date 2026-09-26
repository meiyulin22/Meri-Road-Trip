import { validateDestinationRecommendations, type DestinationRecommendations } from "@/domain/location/destination-recommendations";
import { buildDestinationRecommendationSystemPrompt } from "@/server/ai/prompts/destination-recommendation-prompt";
import type { DestinationRecommendationContext } from "./destination-recommendation-context";
import { createAiSdkKimiClientFromEnvironment } from "./ai-sdk-kimi-client";
import type { StructuredOutputModelClient } from "./kimi-client";

export type { DestinationRecommendations } from "@/domain/location/destination-recommendations";

export const destinationRecommendationJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "destinations"],
  properties: {
    reply: { type: "string", minLength: 1 },
    destinations: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "region", "reason"],
        properties: {
          name: { type: "string", minLength: 1, description: "Concise destination or place name without a province prefix." },
          region: { type: ["string", "null"], description: "Province-level administrative region when known; otherwise null." },
          reason: { type: "string", minLength: 1 },
        },
      },
    },
  },
};

export class InvalidDestinationRecommendationOutputError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "InvalidDestinationRecommendationOutputError";
  }
}

export async function generateDestinationRecommendations(
  context: DestinationRecommendationContext,
  requestId: string,
  client: StructuredOutputModelClient = createAiSdkKimiClientFromEnvironment(),
): Promise<DestinationRecommendations> {
  const response = await client.generateStructuredOutput({
    requestId,
    operation: "destination_recommendations",
    schemaName: "destination_recommendations",
    systemPrompt: buildDestinationRecommendationSystemPrompt(context),
    conversationHistory: context.conversationHistory,
    jsonSchema: destinationRecommendationJsonSchema,
  });
  if (response.finishReason === "length" || !response.content?.trim()) {
    throw new InvalidDestinationRecommendationOutputError("Destination recommendation output is empty or truncated.");
  }
  try {
    return validateDestinationRecommendations(JSON.parse(response.content));
  } catch (error) {
    throw new InvalidDestinationRecommendationOutputError("Destination recommendation output is invalid.", error);
  }
}
