import { z } from "zod";

const planPdfStageSchema = z.enum(["queued", "reading", "opening", "preparing", "printing"]);

export const planPdfErrorCodeSchema = z.enum([
  "no_plan", "incomplete", "not_found", "limited", "busy", "timeout", "failed",
]);

export const planPdfEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("stage"), stage: planPdfStageSchema }),
  z.strictObject({
    type: z.literal("pdf"),
    filename: z.string().min(1),
    base64: z.string().min(1),
    version: z.number().int().positive(),
    stale: z.boolean(),
  }),
  z.strictObject({ type: z.literal("error"), code: planPdfErrorCodeSchema }),
]);

export type PlanPdfStage = z.infer<typeof planPdfStageSchema>;
export type PlanPdfErrorCode = z.infer<typeof planPdfErrorCodeSchema>;
export type PlanPdfEvent = z.infer<typeof planPdfEventSchema>;
