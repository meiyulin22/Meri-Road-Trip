import type { TransportPreference } from "@/domain/trip-draft/trip-draft";
import type { Locale } from "@/domain/locale/locale";
import { type DriveLeg, offRoadNoticeMeters } from "@/domain/plan/plan-draft";

const metres = (value: number) => Math.round(value / 50) * 50;

/**
 * The line before a stop saying how to get there from the stop before (1.2103). A walk says
 * walk; a road leg says drive for a self-driver, taxi for someone not driving, and "by road"
 * otherwise. Where the map has no road for part of the way, or none at all, it says so and
 * names the usual ways across without claiming one: the map cannot tell a ferry from a cable car.
 */
export function legText(leg: DriveLeg, transport: TransportPreference | null, locale: Locale): string {
  const zh = locale === "zh";
  if (leg.mode === "none") {
    return zh
      ? `地图上找不到路，直线约 ${leg.distanceKm} 公里（可能要坐船、索道或步行）`
      : `No way on the map, ${leg.distanceKm} km as the crow flies (a boat, cable car or footpath may be needed)`;
  }
  const how = leg.mode === "walk"
    ? (zh ? "步行约" : "About")
    : transport === "self_drive" ? (zh ? "开车约" : "About")
      : transport === "no_self_drive" || transport === "public_transport" ? (zh ? "打车约" : "About")
        : (zh ? "车程约" : "About");
  const by = leg.mode === "walk" ? "on foot"
    : transport === "self_drive" ? "by car"
      : transport === "no_self_drive" || transport === "public_transport" ? "by taxi" : "by road";
  const base = zh ? `${how} ${leg.durationMinutes} 分钟 · ${leg.distanceKm} 公里` : `${how} ${leg.durationMinutes} min ${by} · ${leg.distanceKm} km`;
  const start = leg.offRoadStartMeters ?? 0;
  const end = leg.offRoadEndMeters ?? 0;
  const notes: string[] = [];
  if (start > offRoadNoticeMeters) notes.push(zh ? `出发处约 ${metres(start)} 米地图上没有路` : `the first ${metres(start)} m has no road on the map`);
  if (end > offRoadNoticeMeters) notes.push(zh ? `最后约 ${metres(end)} 米地图上没有路` : `the last ${metres(end)} m has no road on the map`);
  if (notes.length === 0) return base;
  return zh
    ? `${base}，${notes.join("，")}（可能要坐船、索道或步行）`
    : `${base}; ${notes.join("; ")} (a boat, cable car or footpath may be needed)`;
}
