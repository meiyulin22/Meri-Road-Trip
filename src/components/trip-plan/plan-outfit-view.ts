import type { Locale } from "@/domain/locale/locale";
import { type DayOutfit, type OutfitItemId, outfitCatalog, outfitItemNames, type OutfitReason, type OutfitSlot, outfitSlots } from "@/domain/plan/outfit";

/** One thing in a slot of the equipment screen: a basic with its own art, or a Meri addition. */
export type SlotEntry =
  | { readonly kind: "item"; readonly key: string; readonly id: OutfitItemId; readonly name: string; readonly reasons: readonly string[] }
  | { readonly kind: "extra"; readonly key: string; readonly name: string; readonly reasons: readonly string[] };

const copy = {
  zh: {
    slots: { head: "头", face: "脸", neck: "脖子", top: "内搭", mid: "保暖层", outer: "外套", hands: "手", legs: "下装", feet: "鞋", bag: "背包" },
    reason: (reason: OutfitReason): string => {
      switch (reason.kind) {
        case "cold": return `${reason.place}最低 ${reason.temp}°`;
        case "mild": return `${reason.place}最低 ${reason.temp}°，早晚偏凉`;
        case "warm": return `${reason.place}最低也有 ${reason.temp}°`;
        case "rain": return reason.mm >= 1 ? `降水 ${reason.mm} mm`
          : reason.chance !== null ? `降水概率 ${reason.chance}%` : `约 ${reason.hours ?? 0} 小时有雨`;
        case "storm": return `雷阵雨或大雨，降水 ${reason.mm} mm，伞不顶用`;
        case "gale": return `${reason.estimated ? "阵风约" : "阵风"} ${reason.gustKmh} km/h（8 级以上），伞撑不住`;
        case "snow": return reason.cm > 0 ? `${reason.estimated ? "下雪约" : "下雪"} ${reason.cm} cm` : "有雪";
        case "altitude": return `${reason.place}海拔 ${reason.metres} m，紫外线强`;
        case "sun": return `晴，最高 ${reason.high}°`;
        case "walking": return "一整天在外面走";
      }
    },
    swing: (outfit: DayOutfit) => `最冷 ${outfit.coldest.temp}°（${outfit.coldest.place}），最暖 ${outfit.warmest.temp}°（${outfit.warmest.place}）。`
      + "出门一整天回不去换衣服，外套选好穿脱的，带个装得下它的包。",
    allDay: "出门一整天，穿好了再出发。",
  },
  en: {
    slots: { head: "Head", face: "Face", neck: "Neck", top: "Base", mid: "Warm layer", outer: "Outer", hands: "Hands", legs: "Legs", feet: "Feet", bag: "Bag" },
    reason: (reason: OutfitReason): string => {
      switch (reason.kind) {
        case "cold": return `${reason.temp}° at its coldest, ${reason.place}`;
        case "mild": return `${reason.temp}° at ${reason.place}; cool morning and evening`;
        case "warm": return `${reason.temp}° even at its coldest, ${reason.place}`;
        case "rain": return reason.mm >= 1 ? `${reason.mm} mm of rain`
          : reason.chance !== null ? `${reason.chance}% chance of rain` : `Rain for about ${reason.hours ?? 0} hours`;
        case "storm": return `Thunderstorm or heavy rain, ${reason.mm} mm; an umbrella won't do`;
        case "gale": return `Gusts of ${reason.estimated ? "about " : ""}${reason.gustKmh} km/h (Beaufort 8+); an umbrella won't hold`;
        case "snow": return reason.cm > 0 ? `${reason.estimated ? "About " : ""}${reason.cm} cm of snow` : "Snow";
        case "altitude": return `${reason.place} at ${reason.metres} m: strong sun`;
        case "sun": return `Sunny, up to ${reason.high}°`;
        case "walking": return "Out walking all day";
      }
    },
    swing: (outfit: DayOutfit) => `Coldest ${outfit.coldest.temp}° (${outfit.coldest.place}), warmest ${outfit.warmest.temp}° (${outfit.warmest.place}). `
      + "You're out all day with no chance to change, so wear a layer you can take off and a bag that holds it.",
    allDay: "You're out all day: dress before you leave.",
  },
} as const;

export const slotLabel = (slot: OutfitSlot, locale: Locale) => copy[locale].slots[slot];
export const itemName = (id: OutfitItemId, locale: Locale) => outfitItemNames[id][locale];
export const reasonText = (reason: OutfitReason, locale: Locale) => copy[locale].reason(reason);

/** Every slot of the equipment screen, in order, with what the day puts in it. */
export function slotEntries(outfit: DayOutfit, locale: Locale): { readonly slot: OutfitSlot; readonly entries: readonly SlotEntry[] }[] {
  return outfitSlots.map((slot) => ({
    slot,
    entries: [
      ...outfit.items.filter(({ id }) => outfitCatalog[id] === slot).map(({ id, reasons }): SlotEntry => ({
        kind: "item", key: id, id, name: itemName(id, locale), reasons: [...new Set(reasons.map((reason) => reasonText(reason, locale)))],
      })),
      ...outfit.extras.filter((extra) => extra.slot === slot).map((extra, index): SlotEntry => ({
        kind: "extra", key: `extra-${slot}-${index}`, name: extra.name, reasons: [extra.reason],
      })),
    ],
  }));
}

/** The words under the equipment screen: the layers reminder when the day swings, then Meri's tip. */
export function outfitNotes(outfit: DayOutfit, locale: Locale): string[] {
  return [outfit.bigSwing ? copy[locale].swing(outfit) : copy[locale].allDay, ...(outfit.tip ? [outfit.tip] : [])];
}

/** The day card's one line: the outer layer first, then what stands out, at most four names. */
export function outfitLine(outfit: DayOutfit, locale: Locale): string {
  const order: OutfitSlot[] = ["outer", "head", "hands", "face", "feet", "bag", "mid", "neck", "top", "legs"];
  const names = order.flatMap((slot) => [
    ...outfit.items.filter(({ id }) => outfitCatalog[id] === slot && id !== "trousers" && id !== "walking_shoes").map(({ id }) => itemName(id, locale)),
    ...outfit.extras.filter((extra) => extra.slot === slot).map(({ name }) => name),
  ]);
  return names.slice(0, 4).join(" · ");
}

/** Where a temperature sits on the thermometer, from −20° to 35°, as a fraction. */
export function thermometerAt(temp: number): number {
  return Math.min(1, Math.max(0, (temp + 20) / 55));
}
