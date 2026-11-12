import { z } from "zod";

import { parsePlaceImage, type PlaceImage } from "@/domain/location/place-image";

import { daySlots, spotFacts, type PlanDraft } from "./plan-draft";
import type { CityResearch, SpotCard, SpotEvidence } from "./spot-card";

export const spotEvidenceSchema: z.ZodType<SpotEvidence> = z.strictObject({
  url: z.string(),
  title: z.string(),
  publishedAt: z.string().nullable(),
  checkedAt: z.string(),
  quote: z.string(),
});

export const spotCardSchema: z.ZodType<SpotCard> = z.strictObject({
  id: z.string().min(1),
  province: z.string().min(1),
  city: z.string().min(1),
  name: z.string().min(1),
  requested: z.boolean(),
  location: spotEvidenceSchema.nullable(),
  opening: spotEvidenceSchema.nullable(),
  reservation: spotEvidenceSchema.nullable(),
  setting: spotEvidenceSchema.nullable(),
  walking: spotEvidenceSchema.nullable(),
  suggestedDuration: spotEvidenceSchema.nullable(),
});

export const cityResearchSchema: z.ZodType<CityResearch> = z.strictObject({
  province: z.string().min(1),
  city: z.string().min(1),
  status: z.enum(["ready", "partial", "unavailable", "deferred"]),
  searchCalls: z.number().int().nonnegative(),
  spots: z.array(spotCardSchema),
});

const planDraftSchema: z.ZodType<PlanDraft> = z.strictObject({
  mode: z.enum(["preview", "full"]),
  totalDays: z.number().int().positive().nullable(),
  days: z.array(z.strictObject({
    day: z.number().int().positive(),
    date: z.iso.date().nullable(),
    province: z.string().min(1),
    city: z.string().min(1),
    stops: z.array(z.strictObject({
      spotId: z.string().min(1),
      slot: z.enum(daySlots),
      anchor: z.strictObject({ time: z.string(), reason: z.string(), evidence: spotEvidenceSchema }).nullable(),
    })),
  })),
  conflicts: z.array(z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("requested_unscheduled"), spotId: z.string().min(1) }),
    z.strictObject({ kind: z.literal("not_enough_candidates"), day: z.number().int().positive() }),
  ])),
  unverified: z.array(z.strictObject({ spotId: z.string().min(1), fields: z.array(z.enum(spotFacts)) })),
});

// The page renders this URL, so it passes the same checks as every other place photo.
const placeImageSchema: z.ZodType<PlaceImage, unknown> = z.unknown().transform((value, context) => {
  const image = parsePlaceImage(value);
  if (image) return image;
  context.addIssue({ code: "custom", message: "Invalid place image." });
  return z.NEVER;
});

/**
 * What the plan page receives. A ready draft carries the cards it refers to, so the page
 * can name each stop and show its sources, and each city's research status. Several
 * cities with a confirmed duration wait for the Plan Agent's allocation.
 */
export const planDraftResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ready"),
    draft: planDraftSchema,
    spots: z.array(spotCardSchema),
    cities: z.array(z.strictObject({
      province: z.string().min(1),
      city: z.string().min(1),
      status: z.enum(["ready", "partial", "unavailable", "deferred"]),
    })),
    pendingProvinces: z.array(z.string().min(1)),
    /** A photo for each day where the local catalog has one: a stop of the day, or its city. */
    dayPhotos: z.array(z.strictObject({ day: z.number().int().positive(), image: placeImageSchema })),
  }),
  z.strictObject({ status: z.literal("unsupported"), reason: z.enum(["no_city", "multiple_cities"]) }),
]);

export type PlanDraftResponse = z.output<typeof planDraftResponseSchema>;
