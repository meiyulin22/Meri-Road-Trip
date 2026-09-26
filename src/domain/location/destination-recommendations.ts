import { z } from "zod";

const destinationRecommendationsSchema = z.strictObject({
  reply: z.string().trim().min(1),
  destinations: z.array(z.strictObject({
    name: z.string().trim().min(1),
    region: z.string().trim().min(1).nullable(),
    reason: z.string().trim().min(1),
  })).length(3),
});

export type DestinationRecommendations = z.infer<typeof destinationRecommendationsSchema>;

export function validateDestinationRecommendations(value: unknown): DestinationRecommendations {
  return destinationRecommendationsSchema.parse(value);
}
