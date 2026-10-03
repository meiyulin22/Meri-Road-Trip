import { z } from "zod";
import { isChinaProvince } from "./china-destination-scope";

import { normalizeRecommendationName, normalizeRecommendationRegion } from "./recommendation-identity";

/**
 * A recommended place is one a plan can actually be built for: a 市 or a 州 is the
 * finest level offered, and which 景点 inside it are worth the drive is Generate
 * plan's question, not this one. It is also the coarsest — 「云南」 is a region, and
 * recommending a region to someone who asked where to go answers nothing.
 */
const recommendedPlaceSchema = z.strictObject({
  name: z.string().trim().min(1).max(30),
  reason: z.string().trim().min(1).max(120),
});

/**
 * Provinces group the list because that is the shape the destination itself has:
 * places are picked several at a time, and 「四川 稻城 + 云南 香格里拉」 is one trip
 * whose two halves belong to different provinces.
 */
const recommendationGroupSchema = z.strictObject({
  province: z.string().trim().min(1).max(20).refine(isChinaProvince, "Province is outside Meri's China coverage."),
  places: z.array(recommendedPlaceSchema).min(1).max(6),
});

const destinationRecommendationsSchema = z.strictObject({
  provinces: z.array(recommendationGroupSchema).min(1).max(4),
});

export type RecommendedPlace = z.infer<typeof recommendedPlaceSchema>;
export type DestinationRecommendationGroup = z.infer<typeof recommendationGroupSchema>;

/**
 * The cap counts places, not groups: twelve is where a grouped list stops being one
 * screen however the provinces divide them. Places past the cap are dropped rather
 * than rejected — the ones already offered are good answers, and losing the round
 * over the thirteenth would be a worse one.
 */
const maxRecommendedPlaces = 12;

export function validateDestinationRecommendations(
  value: unknown,
): readonly DestinationRecommendationGroup[] {
  const parsed = destinationRecommendationsSchema.parse(value);
  const groups: DestinationRecommendationGroup[] = [];
  const provinces = new Set<string>();
  let remaining = maxRecommendedPlaces;
  for (const group of parsed.provinces) {
    const province = normalizeRecommendationRegion(group.province);
    if (provinces.has(province)) continue;
    provinces.add(province);
    // Names repeat legitimately across provinces (朝阳 is in both 北京 and 辽宁), so
    // the same name twice is only a duplicate inside one province.
    const names = new Set<string>();
    const places: RecommendedPlace[] = [];
    for (const place of group.places) {
      const name = normalizeRecommendationName(place.name);
      if (names.has(name) || remaining === 0) continue;
      names.add(name);
      places.push(place);
      remaining -= 1;
    }
    // A group can empty out only by running into the cap, and the cap is reached
    // only after earlier groups were kept, so the list is never left with nothing.
    if (places.length > 0) groups.push({ province: group.province, places });
  }
  return groups;
}
