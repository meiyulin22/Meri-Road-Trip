import { z } from "zod";

const candidateProposalSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(50).nullable(),
  preferenceRationale: z.string().trim().min(1).max(300),
});

const candidatePoolSchema = z.strictObject({
  candidates: z.array(candidateProposalSchema).min(8).max(10),
}).superRefine(({ candidates }, context) => {
  const names = new Set<string>();
  for (const candidate of candidates) {
    const name = candidate.name.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase();
    if (names.has(name)) {
      context.addIssue({ code: "custom", message: "Candidate names must be distinct." });
      return;
    }
    names.add(name);
  }
});

export type DestinationCandidateProposal = z.infer<typeof candidateProposalSchema>;
export type DestinationCandidate = DestinationCandidateProposal & { readonly id: string };

export function validateDestinationCandidatePool(value: unknown): readonly DestinationCandidateProposal[] {
  return candidatePoolSchema.parse(value).candidates;
}
