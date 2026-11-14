import { z } from "zod";

import { locales } from "@/domain/locale/locale";
import { planPreferenceSchema } from "@/domain/plan/trip-preference";
import { validateTripState } from "@/domain/trip-state/trip-state";

export const planHandoffSchema = z.strictObject({
  tripState: z.unknown().transform(validateTripState),
  referenceDate: z.iso.date(),
  timezone: z.string().min(1),
  locale: z.enum(locales),
  /** The trip's active preferences when the plan was opened: conversation, plan page and answers. */
  preferences: z.array(planPreferenceSchema),
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
