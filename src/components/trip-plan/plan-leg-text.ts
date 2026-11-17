import type { TransportPreference } from "@/domain/trip-draft/trip-draft";
import type { Locale } from "@/domain/locale/locale";
import { type DriveLeg, legReach } from "@/domain/plan/plan-draft";

const metres = (value: number) => Math.round(value / 50) * 50;

/** The names of the two stops a leg joins, for saying which one is a large area. */
export type LegNames = { readonly from: string; readonly to: string };

/**
 * The line before a stop saying how to get there from the stop before (1.2103). A walk says
 * walk; a road leg says drive for a self-driver, taxi for someone not driving, and "by road"
 * otherwise. Where the map has no road for part of the way, or none at all, it says so and
 * names the usual ways across without claiming one: the map cannot tell a ferry from a cable car.
 * Where an end is a large area such as a lake, no time is given at all (1.2105).
 */
export function legText(leg: DriveLeg, transport: TransportPreference | null, locale: Locale, names: LegNames): string {
  const zh = locale === "zh";
  const reach = legReach(leg);
  if (reach.kind === "none") {
    return zh
      ? `地图上找不到路，直线约 ${leg.distanceKm} 公里（可能要坐船、索道或步行）`
      : `No way on the map, ${leg.distanceKm} km as the crow flies (a boat, cable car or footpath may be needed)`;
  }
  if (reach.kind === "area") return areaText(reach.fromIsArea, reach.toIsArea, leg.mode === "walk", names, zh);
  const how = leg.mode === "walk"
    ? (zh ? "步行约" : "About")
    : transport === "self_drive" ? (zh ? "开车约" : "About")
      : transport === "no_self_drive" || transport === "public_transport" ? (zh ? "打车约" : "About")
        : (zh ? "车程约" : "About");
  const by = leg.mode === "walk" ? "on foot"
    : transport === "self_drive" ? "by car"
      : transport === "no_self_drive" || transport === "public_transport" ? "by taxi" : "by road";
  const base = zh ? `${how} ${leg.durationMinutes} 分钟 · ${leg.distanceKm} 公里` : `${how} ${leg.durationMinutes} min ${by} · ${leg.distanceKm} km`;
  const notes: string[] = [];
  if (reach.startGapMeters > 0) notes.push(zh ? `出发处约 ${metres(reach.startGapMeters)} 米地图上没有路` : `the first ${metres(reach.startGapMeters)} m has no road on the map`);
  if (reach.endGapMeters > 0) notes.push(zh ? `最后约 ${metres(reach.endGapMeters)} 米地图上没有路` : `the last ${metres(reach.endGapMeters)} m has no road on the map`);
  if (notes.length === 0) return base;
  return zh
    ? `${base}，${notes.join("，")}（可能要坐船、索道或步行）`
    : `${base}; ${notes.join("; ")} (a boat, cable car or footpath may be needed)`;
}

/** No minutes and no kilometres: both were measured from an arbitrary point inside the area. */
function areaText(fromIsArea: boolean, toIsArea: boolean, walk: boolean, names: LegNames, zh: boolean): string {
  const time = walk ? "步行时间" : "车程";
  if (fromIsArea && toIsArea) {
    return zh
      ? `${names.from}和${names.to}都是一大片区域，${time}要看具体从哪里到哪里，无法估算`
      : `${names.from} and ${names.to} are large areas, so the time depends on exactly where you go and can't be estimated`;
  }
  if (fromIsArea) {
    return zh
      ? `${names.from}是一大片区域，${time}要看具体从哪里出发，无法估算`
      : `${names.from} is a large area, so the time depends on where you start and can't be estimated`;
  }
  return zh
    ? `${names.to}是一大片区域，${time}要看具体到哪里，无法估算`
    : `${names.to} is a large area, so the time depends on where you arrive and can't be estimated`;
}
