import { z } from "zod";
import { deduplicateRecommendationDestinations } from "./recommendation-identity";

const candidateProposalSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(50).nullable(),
  preferenceRationale: z.string().trim().min(1).max(300),
});

const candidatePoolSchema = z.strictObject({
  candidates: z.array(candidateProposalSchema).min(8).max(10),
});

export type DestinationCandidateProposal = z.infer<typeof candidateProposalSchema>;
export type DestinationCandidate = DestinationCandidateProposal & { readonly id: string };

export function validateDestinationCandidatePool(value: unknown): readonly DestinationCandidateProposal[] {
  return deduplicateRecommendationDestinations(candidatePoolSchema.parse(value).candidates, (candidate) => candidate);
}
