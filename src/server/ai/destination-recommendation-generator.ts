import { validateDestinationRecommendations, type DestinationRecommendations } from "@/domain/location/destination-recommendations";
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
          name: { type: "string", minLength: 1 },
          region: { type: ["string", "null"] },
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
    systemPrompt: `You are Meri, an outdoor travel companion. The persisted UI action in the context requests three destination suggestions. Use the authoritative TripState and real conversation history to infer available preferences. Do not treat assistant suggestions as confirmed user preferences. Respond in Chinese with a short reply and exactly three distinct destinations. Each reason should explain why its destination may fit the available context. Do not assert unverified current conditions, weather, routes, prices, hotel availability, or other researched facts. No tools or research are available. If preferences are sparse, offer varied possibilities and say why they are exploratory. The UI action is not a user message.\n\nPersisted action and authoritative TripState:\n${JSON.stringify({ action: context.action, tripState: context.tripState })}`,
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
