import { z } from "zod";

const accessEvidenceSchema = z.strictObject({
  authority: z.string().trim().min(1),
  sourceUrl: z.url(),
  title: z.string().trim().min(1),
  retrievedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().optional(),
  effectiveAt: z.iso.datetime().optional(),
  excerpt: z.string().trim().min(1),
});

const destinationAccessResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("allowed"),
    reason: z.string().trim().min(1),
    evidence: z.array(accessEvidenceSchema).min(1),
  }),
  z.strictObject({
    status: z.literal("restricted"),
    reason: z.string().trim().min(1),
    evidence: z.array(accessEvidenceSchema).min(1),
  }),
  z.strictObject({
    status: z.literal("unknown"),
    reason: z.string().trim().min(1),
    evidence: z.array(accessEvidenceSchema).optional(),
  }),
]);

export type DestinationAccessEvidence = z.infer<typeof accessEvidenceSchema>;
export type DestinationAccessResult = z.infer<typeof destinationAccessResultSchema>;

export function validateDestinationAccessResult(value: unknown): DestinationAccessResult {
  return destinationAccessResultSchema.parse(value);
}
