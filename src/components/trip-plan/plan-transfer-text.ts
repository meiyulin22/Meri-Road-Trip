import type { Locale } from "@/domain/locale/locale";
import { longDriveMinutes, type TransferKind, type TransferLeg, type TravelChoice } from "@/domain/plan/transfer-legs";
import type { TransportPreference } from "@/domain/trip-draft/trip-draft";

const kindLabel = {
  zh: { outbound: "启程", between: "转场", return: "回程" },
  en: { outbound: "Setting off", between: "Changing city", return: "Heading home" },
} as const satisfies Record<Locale, Record<TransferKind, string>>;

export function transferLabel(kind: TransferKind, locale: Locale): string {
  return kindLabel[locale][kind];
}

/** The two ends of a leg, with a word for an origin not written yet. */
export function transferEnds(leg: TransferLeg, locale: Locale): { readonly from: string; readonly to: string } {
  const home = locale === "zh" ? "出发地" : "Home";
  return { from: leg.from ?? home, to: leg.to ?? home };
}

/**
 * A drive's length as people say it: minutes under an hour, otherwise hours and the minutes
 * rounded to ten, since it is a rough estimate (2 小时 40 分钟, 2 h 40 min).
 */
export function driveDuration(minutes: number, locale: Locale): string {
  if (minutes < 60) return locale === "zh" ? `${minutes} 分钟` : `${minutes} min`;
  const rounded = Math.round(minutes / 10) * 10;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (locale === "zh") return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * What a leg card says (1.2106): a rough drive between the two places, worded for a self-driver
 * or as "by road" otherwise, with a word that a long one may suit a train or flight; or, when
 * there is no time, why, in plain words. It never names a train or a flight it has not found.
 */
export function transferText(
  leg: TransferLeg, transport: TransportPreference | null, locale: Locale, travelChoice: TravelChoice | null = null,
): string {
  const zh = locale === "zh";
  const { estimate } = leg;
  // A train or flight was chosen but is not looked up yet (1.2108): said first, the drive as a reference.
  const chosen = travelChoice === "train" || travelChoice === "flight"
    ? (zh ? `你选了${travelChoice === "train" ? "高铁" : "飞机"}，${travelChoice === "train" ? "车次" : "航班"}查询下一步接上；先给开车参考：`
      : `You chose to ${travelChoice === "train" ? "take the train" : "fly"}; ${travelChoice === "train" ? "trains" : "flights"} are looked up next. For reference: `)
    : "";
  switch (estimate.status) {
    case "estimated": {
      const time = driveDuration(estimate.durationMinutes, locale);
      const base = zh
        ? `${transport === "self_drive" ? "开车" : "车程"}约 ${time} · ${estimate.distanceKm} 公里（估算）`
        : `About ${time} ${transport === "self_drive" ? "by car" : "by road"} · ${estimate.distanceKm} km (estimate)`;
      if (chosen || estimate.durationMinutes <= longDriveMinutes) return chosen + base;
      return zh ? `${base}，路程较远，可以考虑火车或飞机` : `${base}; a long way, so a train or flight may suit better`;
    }
    case "origin_missing":
      return leg.kind === "return"
        ? (zh ? "出发地还没写，在上面的启程卡里填写后一起估算" : "No starting point yet; fill it in on the setting-off card above")
        : (zh ? "出发地还没写，这段暂不估算" : "No starting point yet, so this leg isn't estimated");
    case "origin_uncertain":
      return zh ? `出发地还不确定（${leg.kind === "return" ? leg.to : leg.from}），这段暂不估算`
        : `The starting point is only roughly known (${leg.kind === "return" ? leg.to : leg.from}), so this leg isn't estimated`;
    case "same_city":
      return zh ? "就在同一座城，不用转场" : "Same city, no transfer needed";
    case "not_found":
      return zh ? `地图上没找到「${estimate.place}」，这段暂不估算` : `“${estimate.place}” isn't on the map, so this leg isn't estimated`;
    case "no_route":
      return zh ? "地图上找不到开车的路" : "No road between them on the map";
    case "not_looked_up":
      return zh ? "车程还没查到" : "Drive time not looked up yet";
  }
}
