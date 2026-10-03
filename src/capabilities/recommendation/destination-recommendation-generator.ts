import { validateDestinationRecommendations, type DestinationRecommendationGroup } from "@/domain/location/destination-recommendations";
import { chinaProvinces } from "@/domain/location/china-destination-scope";
import { buildDestinationRecommendationSystemPrompt } from "@/capabilities/recommendation/prompts/destination-recommendation-prompt";
import type { DiscoverySearchResult } from "@/platform/search/discovery-search";
import type { DestinationRecommendationContext } from "./destination-recommendation-context";
import { createAiSdkKimiClientFromEnvironment } from "@/platform/llm/ai-sdk-kimi-client";
import type { StructuredOutputModelClient } from "@/platform/llm/kimi-client";

export type { DestinationRecommendationGroup } from "@/domain/location/destination-recommendations";

export const destinationRecommendationJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["provinces"],
  properties: {
    provinces: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["province", "places"],
        properties: {
          province: {
            type: "string", minLength: 1, maxLength: 20,
            enum: [...chinaProvinces],
            description: "Full province-level name, e.g. 云南省、广西壮族自治区、北京市.",
          },
          places: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "reason", "landmark"],
              properties: {
                name: {
                  type: "string", minLength: 1, maxLength: 30,
                  description: "One prefecture-level city or autonomous prefecture inside the province (丽江市、甘孜藏族自治州). Never a province, never a single landmark.",
                },
                reason: {
                  type: "string", minLength: 1, maxLength: 120,
                  description: "One short Chinese sentence on why this place may fit the user's stated preferences.",
                },
                landmark: {
                  type: "string", minLength: 1, maxLength: 30,
                  description: "The one well-known scenic spot inside this place that best shows it, by its common name (玉龙雪山 for 丽江市, 洱海 for 大理白族自治州). Used only to find a photo.",
                },
              },
            },
          },
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
  context: DestinationRecommendationContext & { readonly discoveryResults?: readonly DiscoverySearchResult[] },
  requestId: string,
  client: StructuredOutputModelClient = createAiSdkKimiClientFromEnvironment(),
): Promise<readonly DestinationRecommendationGroup[]> {
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
