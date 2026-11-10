import { z } from "zod";

import { locales } from "@/domain/locale/locale";
import { validateTripState } from "@/domain/trip-state/trip-state";

const preferenceSchema = z.strictObject({
  messageId: z.string().min(1),
  quote: z.string().min(1),
  createdAt: z.iso.datetime(),
});

export const planHandoffSchema = z.strictObject({
  tripState: z.unknown().transform(validateTripState),
  referenceDate: z.iso.date(),
  timezone: z.string().min(1),
  locale: z.enum(locales),
  preferences: z.array(preferenceSchema),
  preferenceStatus: z.enum(["ready", "unavailable"]),
});

export type PlanHandoff = z.output<typeof planHandoffSchema>;

export const planHandoffResponseSchema = z.discriminatedUnion("canProceed", [
  z.strictObject({ canProceed: z.literal(true), handoff: planHandoffSchema }),
  z.strictObject({
    canProceed: z.literal(false),
    reason: z.enum(["destination_missing", "destination_unverified"]),
  }),
]);

export type PlanHandoffResponse = z.output<typeof planHandoffResponseSchema>;
