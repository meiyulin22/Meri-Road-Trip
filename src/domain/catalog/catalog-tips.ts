/**
 * Meri's travel tips from the catalog (RAG step 5, agreed with merlin 2026-11-27): a tip tied to a
 * spot shows under that stop when the stop is in the plan; a tip for the whole city, and every
 * festival, shows on the city's 「Meri 的提示」 card. Festivals keep their own wording of when (often
 * the lunar calendar, 端午节前后) and are not matched to the trip's dates: the traveller reads them.
 *
 * The tips are the catalog's own wording, written at extraction; checked 2026-11-27, no advice shares
 * even eight consecutive characters with the guide pages it cites.
 */
export type CatalogTip = {
  readonly id: string;
  readonly name: string;
  readonly advice: string;
  /** When or where it applies, in the catalog's words (传统时间为农历三月十五至二十, 前往玉龙雪山的高海拔游览区). */
  readonly appliesIn: string;
  /** The catalog spots it is about (applies_to); empty for a city-wide tip. */
  readonly spotIds: readonly string[];
};

export type TipNote = { readonly name: string; readonly advice: string; readonly appliesIn: string };
export type CityTip = TipNote & { readonly kind: "city" | "festival" };

const festivalWords = /农历|节期|节庆|传统时间|传统日期|赛马|火把节|三朵节|泼水节|那达慕|庙会|歌会|七月会|三月街/u;

export function isFestival(tip: Pick<CatalogTip, "name" | "appliesIn">): boolean {
  return festivalWords.test(tip.name) || festivalWords.test(tip.appliesIn);
}

const note = ({ name, advice, appliesIn }: CatalogTip): TipNote => ({ name, advice, appliesIn });

/**
 * Tips by catalog spot id for the spots the city's research took, and the city card's tips:
 * festivals first, then city-wide ones. A spot tip whose spots were not taken is left out.
 */
export function splitTips(tips: readonly CatalogTip[], takenSpotIds: ReadonlySet<string>): {
  readonly bySpot: ReadonlyMap<string, readonly TipNote[]>;
  readonly city: readonly CityTip[];
} {
  const bySpot = new Map<string, TipNote[]>();
  const festivals: CityTip[] = [];
  const cityWide: CityTip[] = [];
  for (const tip of tips) {
    if (isFestival(tip)) {
      festivals.push({ ...note(tip), kind: "festival" });
      continue;
    }
    if (tip.spotIds.length === 0) {
      cityWide.push({ ...note(tip), kind: "city" });
      continue;
    }
    for (const spotId of tip.spotIds.filter((id) => takenSpotIds.has(id))) {
      bySpot.set(spotId, [...(bySpot.get(spotId) ?? []), note(tip)]);
    }
  }
  return { bySpot, city: [...festivals, ...cityWide] };
}
