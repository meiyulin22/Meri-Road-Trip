import { z } from "zod";

import { parsePlaceImage, type PlaceImage } from "@/domain/location/place-image";

import { daySlots, spotFacts, type PlanDay, type PlanDraft, type PlanRoute } from "./plan-draft";
import type { CityResearch, SpotAvailability, SpotCard, SpotEvidence, SpotMapCheck } from "./spot-card";
import { type TransferLeg, travelChoices } from "./transfer-legs";
import type { DayForecast, SpotWeather } from "./weather";
import { type DayOutfit, outfitItemIds, outfitSlots } from "./outfit";
import { type CityStay, stayTiers } from "./stays";

export const spotEvidenceSchema: z.ZodType<SpotEvidence> = z.strictObject({
  url: z.string(),
  title: z.string(),
  publishedAt: z.string().nullable(),
  checkedAt: z.string(),
  quote: z.string(),
});

const spotMapCheckSchema: z.ZodType<SpotMapCheck> = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("located"),
    district: z.string().min(1).nullable(),
    // Plans saved before 1.2100 have none.
    point: z.strictObject({ longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) }).nullable().default(null),
  }),
  z.strictObject({ status: z.literal("not_located") }),
  z.strictObject({ status: z.literal("unchecked") }),
]);

const monthDay = z.string().regex(/^\d{2}-\d{2}$/u);
const clock = z.string().regex(/^\d{2}:\d{2}$/u);

export const spotAvailabilitySchema: z.ZodType<SpotAvailability> = z.strictObject({
  checkedAt: z.string(),
  hours: z.strictObject({ open: clock, close: clock, evidence: spotEvidenceSchema }).nullable(),
  closedWeekdays: z.array(z.strictObject({
    weekday: z.number().int().min(1).max(7), scope: z.string().min(1).nullable(), evidence: spotEvidenceSchema,
  })),
  closedRanges: z.array(z.strictObject({
    from: monthDay, to: monthDay, scope: z.string().min(1).nullable(), evidence: spotEvidenceSchema,
  })),
  reservation: z.strictObject({
    required: z.boolean(), daysAhead: z.number().int().nonnegative().nullable(), evidence: spotEvidenceSchema,
  }).nullable(),
  uncertain: z.array(z.strictObject({ note: z.string().min(1), evidence: spotEvidenceSchema })),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const dayForecastSchema: z.ZodType<DayForecast> = z.strictObject({
  date: isoDate,
  code: z.number().int(),
  high: z.number(),
  low: z.number(),
  precipitationMm: z.number().nonnegative(),
  precipitationChance: z.number().min(0).max(100).nullable(),
  snowfallCm: z.number().nonnegative(),
  gustKmh: z.number().nonnegative(),
});

const spotWeatherSchema: z.ZodType<SpotWeather> = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("forecast"),
    source: z.enum(["spot", "city"]),
    elevation: z.number().nullable(),
    days: z.array(dayForecastSchema),
    beyond: z.array(isoDate),
  }),
  z.strictObject({ status: z.literal("beyond_range") }),
  z.strictObject({ status: z.literal("unavailable") }),
]);

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
  mapCheck: spotMapCheckSchema,
  outdoor: z.boolean().nullable().optional(),
  weather: spotWeatherSchema.optional(),
  availability: spotAvailabilitySchema.optional(),
});

export const cityResearchSchema: z.ZodType<CityResearch> = z.strictObject({
  province: z.string().min(1),
  city: z.string().min(1),
  status: z.enum(["ready", "partial", "unavailable", "deferred"]),
  searchCalls: z.number().int().nonnegative(),
  spots: z.array(spotCardSchema),
  usage: z.strictObject({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).optional(),
});

export const planRouteSchema: z.ZodType<PlanRoute> = z.strictObject({
  source: z.enum(["agent", "fallback"]),
  cities: z.array(z.strictObject({
    province: z.string().min(1), city: z.string().min(1), days: z.number().int().positive(), reason: z.string().min(1).nullable(),
  })),
  omitted: z.array(z.strictObject({ province: z.string().min(1), city: z.string().min(1), reason: z.string().min(1).nullable() })),
});

export const planDaySchema: z.ZodType<PlanDay> = z.strictObject({
  day: z.number().int().positive(),
  date: z.iso.date().nullable(),
  province: z.string().min(1),
  city: z.string().min(1),
  arrivingFrom: z.string().min(1).nullable(),
  focus: z.string().min(1).nullable(),
  theme: z.string().min(1).nullable(),
  stops: z.array(z.strictObject({
    spotId: z.string().min(1),
    slot: z.enum(daySlots),
    anchor: z.strictObject({ time: z.string(), reason: z.string(), evidence: spotEvidenceSchema }).nullable(),
  })),
});

export const stopCheckSchema = z.strictObject({
  day: z.number().int().positive(),
  spotId: z.string().min(1),
  status: z.enum(["open", "partial", "closed", "uncertain", "unchecked"]),
  reservation: z.strictObject({ daysAhead: z.number().int().nonnegative().nullable() }).nullable(),
  movedFrom: z.number().int().positive().nullable(),
});

const pathSchema = z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(2).max(200);

/** One direct train as a leg keeps it (1.2108); a journey with a change wraps two of these (1.2110). */
const trainOptionSchema = z.strictObject({
  code: z.string().min(1).max(25),
  from: z.string().min(1),
  to: z.string().min(1),
  departs: z.string().regex(/^\d{2}:\d{2}$/u),
  arrives: z.string().regex(/^\d{2}:\d{2}$/u),
  arriveDayOffset: z.number().int().min(0).max(4),
  durationMinutes: z.number().int().positive(),
  seats: z.array(z.strictObject({ name: z.string().min(1), price: z.number().nonnegative().nullable(), left: z.string() })),
});

/** One flight as a leg keeps it (1.2111); a journey with a change of plane wraps two (1.2113). */
const flightOptionSchema = z.strictObject({
  // Two numbers with a slash for a change of plane: MU9181/MU5780.
  flightNo: z.string().min(2).max(25),
  fromAirport: z.string().min(1),
  toAirport: z.string().min(1),
  departs: z.string().regex(/^\d{2}:\d{2}$/u),
  arrives: z.string().regex(/^\d{2}:\d{2}$/u),
  arriveDayOffset: z.number().int().min(0).max(2),
  durationMinutes: z.number().int().positive(),
  cabin: z.string().min(1),
  price: z.number().nonnegative(),
  seatsLeft: z.number().int().nonnegative().nullable(),
  charges: z.number().nonnegative().nullable(),
  stopCity: z.string().min(1).nullable(),
  codeshare: z.boolean(),
});

/** One leg to, between or back from the trip's cities (1.2106). */
const transferLegSchema: z.ZodType<TransferLeg> = z.strictObject({
  kind: z.enum(["outbound", "between", "return"]),
  day: z.number().int().positive(),
  from: z.string().min(1).nullable(),
  to: z.string().min(1).nullable(),
  estimate: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("estimated"), distanceKm: z.number().nonnegative(), durationMinutes: z.number().int().nonnegative(), path: pathSchema }),
    z.strictObject({ status: z.literal("origin_missing") }),
    z.strictObject({ status: z.literal("origin_uncertain") }),
    z.strictObject({ status: z.literal("same_city") }),
    z.strictObject({ status: z.literal("not_found"), place: z.string().min(1) }),
    z.strictObject({ status: z.literal("no_route") }),
    z.strictObject({ status: z.literal("not_looked_up") }),
  ]),
  trains: z.strictObject({
    queriedDate: z.iso.date(),
    reference: z.boolean(),
    checkedAt: z.iso.datetime(),
    options: z.array(trainOptionSchema.extend({
      change: z.strictObject({
        city: z.string().min(1),
        waitMinutes: z.number().int().nonnegative(),
        sameStation: z.boolean(),
        first: trainOptionSchema,
        second: trainOptionSchema,
      }).optional(),
    })).max(5),
  }).optional(),
  recommendation: z.strictObject({
    mode: z.enum(["train", "drive", "flight", "air_rail"]),
    trainCode: z.string().min(1).nullable(),
    flightNo: z.string().min(1).nullable().optional(),
    airRailCode: z.string().min(1).nullable().optional(),
    reason: z.string().max(200),
    // `traveller` (1.2115): switched on the plan page between a train and a flight already found.
    by: z.enum(["agent", "code", "traveller"]),
  }).optional(),
  // `off` (1.2113 step 1): train search is switched off on this server, so nothing was looked up.
  trainsMissing: z.enum(["none", "no_station", "unavailable", "off"]).optional(),
  flights: z.strictObject({
    queriedDate: z.iso.date(),
    checkedAt: z.iso.datetime(),
    options: z.array(flightOptionSchema.extend({
      change: z.strictObject({
        city: z.string().min(1),
        waitMinutes: z.number().int().nonnegative(),
        sameAirport: z.boolean(),
        first: flightOptionSchema,
        second: flightOptionSchema,
      }).optional(),
    })).max(5),
  }).optional(),
  flightsMissing: z.enum(["none", "no_airport", "unavailable", "off"]).optional(),
  // 1.2114: a flight to a city near the destination, then a train on.
  airRail: z.strictObject({
    checkedAt: z.iso.datetime(),
    options: z.array(z.strictObject({
      code: z.string().min(3).max(25),
      city: z.string().min(1),
      flight: flightOptionSchema,
      train: trainOptionSchema,
      waitMinutes: z.number().int().nonnegative(),
      departs: z.string().regex(/^\d{2}:\d{2}$/u),
      arrives: z.string().regex(/^\d{2}:\d{2}$/u),
      arriveDayOffset: z.number().int().min(0).max(3),
      durationMinutes: z.number().int().positive(),
      price: z.number().nonnegative().nullable(),
    })).max(5),
  }).optional(),
});

const extremeSchema = z.strictObject({ temp: z.number(), place: z.string().min(1) });
const outfitReasonSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("cold"), temp: z.number(), place: z.string().min(1) }),
  z.strictObject({ kind: z.literal("mild"), temp: z.number(), place: z.string().min(1) }),
  z.strictObject({ kind: z.literal("warm"), temp: z.number(), place: z.string().min(1) }),
  z.strictObject({ kind: z.literal("rain"), mm: z.number().nonnegative(), chance: z.number().min(0).max(100).nullable() }),
  z.strictObject({ kind: z.literal("storm"), mm: z.number().nonnegative() }),
  z.strictObject({ kind: z.literal("gale"), gustKmh: z.number().nonnegative() }),
  z.strictObject({ kind: z.literal("snow"), cm: z.number().nonnegative() }),
  z.strictObject({ kind: z.literal("altitude"), metres: z.number(), place: z.string().min(1) }),
  z.strictObject({ kind: z.literal("sun"), high: z.number() }),
  z.strictObject({ kind: z.literal("walking") }),
]);
export const dayOutfitSchema: z.ZodType<DayOutfit> = z.strictObject({
  day: z.number().int().positive(),
  date: z.iso.date(),
  coldest: extremeSchema,
  warmest: extremeSchema,
  items: z.array(z.strictObject({ id: z.enum(outfitItemIds as [string, ...string[]]), reasons: z.array(outfitReasonSchema) })),
  extras: z.array(z.strictObject({ name: z.string().min(1).max(20), slot: z.enum(outfitSlots), reason: z.string().min(1).max(200) })),
  tip: z.string().min(1).max(300).nullable(),
  bigSwing: z.boolean(),
}) as z.ZodType<DayOutfit>;

const geoSchema = z.strictObject({ longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) });
const photoUrl = z.url({ protocol: /^https$/u, hostname: /^image-cdn\.rollinggo\.cn$/u });
const hotelSchema = z.strictObject({
  id: z.number().int().positive(),
  name: z.string().min(1),
  brand: z.string().min(1).nullable(),
  address: z.string(),
  point: geoSchema,
  star: z.number().min(0).max(5).nullable(),
  distanceM: z.number().int().nonnegative().nullable(),
  pricePerNight: z.strictObject({ amount: z.number().nonnegative(), currency: z.string().min(1) }).nullable(),
  image: photoUrl.nullable(),
  tags: z.array(z.string()),
  amenities: z.array(z.string()),
});
const hotelDetailSchema = z.strictObject({
  phone: z.string().nullable(), district: z.string().nullable(), checkIn: z.string().nullable(), checkOut: z.string().nullable(),
  facilities: z.array(z.string()), images: z.array(photoUrl),
});
const stayBlockShape = {
  province: z.string().min(1), city: z.string().min(1), firstDay: z.number().int().positive(), checkIn: z.iso.date(),
  nights: z.number().int().positive(), lastDay: z.number().int().positive(),
  near: z.strictObject({ name: z.string().min(1), kind: z.enum(["spot", "city"]) }),
};
export const cityStaySchema: z.ZodType<CityStay> = z.discriminatedUnion("status", [
  z.strictObject({
    ...stayBlockShape,
    status: z.literal("found"),
    tiers: z.array(z.strictObject({ tier: z.enum(stayTiers), hotel: hotelSchema, detail: hotelDetailSchema.nullable() })),
    recommended: z.strictObject({ hotel: hotelSchema, detail: hotelDetailSchema.nullable(), reason: z.string().min(1).max(200) }).nullable(),
    checkedAt: z.string(),
  }),
  z.strictObject({ ...stayBlockShape, status: z.literal("none") }),
  z.strictObject({ ...stayBlockShape, status: z.literal("unavailable") }),
]) as z.ZodType<CityStay>;

export const planDraftSchema: z.ZodType<PlanDraft> = z.strictObject({
  mode: z.enum(["preview", "full"]),
  totalDays: z.number().int().positive().nullable(),
  route: planRouteSchema,
  days: z.array(planDaySchema),
  conflicts: z.array(z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("requested_unscheduled"), spotId: z.string().min(1) }),
    z.strictObject({ kind: z.literal("not_enough_candidates"), day: z.number().int().positive() }),
    z.strictObject({ kind: z.literal("closed_on_day"), day: z.number().int().positive(), spotId: z.string().min(1) }),
  ])),
  unverified: z.array(z.strictObject({ spotId: z.string().min(1), fields: z.array(z.enum(spotFacts)) })),
  checks: z.array(stopCheckSchema).optional(),
  legs: z.array(z.strictObject({
    day: z.number().int().positive(),
    fromSpotId: z.string().min(1),
    toSpotId: z.string().min(1),
    mode: z.enum(["walk", "drive", "none"]).optional(),
    distanceKm: z.number().nonnegative(),
    durationMinutes: z.number().int().nonnegative(),
    path: z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(2).max(200),
    offRoadStartMeters: z.number().int().nonnegative().optional(),
    offRoadEndMeters: z.number().int().nonnegative().optional(),
  })).optional(),
  transfers: z.array(transferLegSchema).optional(),
  outfits: z.array(dayOutfitSchema).optional(),
  stays: z.array(cityStaySchema).optional(),
});

// The page renders this URL, so it passes the same checks as every other place photo.
export const placeImageSchema: z.ZodType<PlaceImage, unknown> = z.unknown().transform((value, context) => {
  const image = parsePlaceImage(value);
  if (image) return image;
  context.addIssue({ code: "custom", message: "Invalid place image." });
  return z.NEVER;
});

/**
 * A finished plan as the page shows it and a plan version stores it: the draft with its
 * route, the cards it refers to, so the page can name each stop and show its sources,
 * and each city's research status.
 */
export const readyPlanSchema = z.strictObject({
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
  /** How the traveller chose to travel, when they filled it in on the plan page (1.2107). */
  travelChoice: z.enum(travelChoices).optional(),
  /** Stopped when a Tianditu call failed: the remaining spots stayed unchecked. */
  mapCheck: z.enum(["complete", "stopped"]),
});

export type ReadyPlan = z.output<typeof readyPlanSchema>;
