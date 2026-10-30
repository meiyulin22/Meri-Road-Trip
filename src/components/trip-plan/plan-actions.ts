import type { Localized, PlanDay, PlanStop } from "./plan-view";
import { addDays } from "./plan-view";

/**
 * What a traveller can do with a plan outside Meri: open a stop in their own map app, and
 * put the days in their phone's calendar. Pure, so the links and the file are tested.
 */

export type MapApp = "amap" | "apple" | "google";

/**
 * Links that open a stop in another map app. Only links: no key, no call from Meri.
 * Coordinates go out as they are (WGS84; Tianditu's CGCS2000 differs by centimetres) and
 * each app converts them itself — Amap is told so with coordinate=wgs84.
 * Chinese readers get Amap first, others Google first.
 */
export function navigationLinks(stop: Pick<PlanStop, "name" | "point">, locale: "zh" | "en"): readonly { readonly app: MapApp; readonly url: string }[] {
  const [lon, lat] = stop.point;
  const name = encodeURIComponent(stop.name);
  const links = {
    // Confirmed on lbs.amap.com (URI Web, marker): position is "lon,lat"; callnative tries the app on phones.
    amap: `https://uri.amap.com/marker?position=${lon},${lat}&name=${name}&coordinate=wgs84&callnative=1&src=meri`,
    // Apple's Maps links (daddr, q); not re-checked against Apple's current page yet.
    apple: `https://maps.apple.com/?daddr=${lat},${lon}&q=${name}`,
    // Confirmed on developers.google.com (Maps URLs): api=1 is required, no key needed.
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lon}&travelmode=driving`,
  } as const;
  const order: readonly MapApp[] = locale === "zh" ? ["amap", "apple", "google"] : ["google", "apple", "amap"];
  return order.map((app) => ({ app, url: links[app] }));
}

/** Forecasts reach about 16 days ahead; further out, the page shows the usual weather for the season. */
export const forecastDays = 16;

export function weatherKind(date: string, asOf: string): "forecast" | "climate" {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000;
  return days < forecastDays ? "forecast" : "climate";
}

/** iCalendar text needs its commas, semicolons and backslashes escaped, and newlines written as \n. */
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function stamp(date: string, time: string, plusMinutes = 0): string {
  const [hours, minutes] = time.split(":").map(Number);
  const total = hours * 60 + minutes + plusMinutes;
  const day = addDays(date, Math.floor(total / 1440));
  const inDay = total % 1440;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${day.replace(/-/g, "")}T${pad(Math.floor(inDay / 60))}${pad(inDay % 60)}00`;
}

/**
 * The plan as an .ics calendar: one event per stop that is not a place to sleep, in
 * China's time zone, with its opening hours and Meri's note, and its coordinates so a
 * phone can show it on a map.
 */
export function planCalendar(days: readonly PlanDay[], startDate: string, locale: keyof Localized, title: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meri//Trip plan//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(title)}`,
  ];
  for (const day of days) {
    const date = addDays(startDate, day.day - 1);
    for (const stop of day.stops) {
      if (stop.kind === "stay") continue;
      const details = [stop.hours?.text[locale], stop.note?.[locale]].filter((part): part is string => Boolean(part));
      lines.push(
        "BEGIN:VEVENT",
        `UID:${date}-${stop.id}@meri`,
        `DTSTAMP:${stamp(startDate, "00:00")}Z`,
        `DTSTART;TZID=Asia/Shanghai:${stamp(date, stop.time)}`,
        `DTEND;TZID=Asia/Shanghai:${stamp(date, stop.time, Math.max(30, stop.minutes))}`,
        `SUMMARY:${escapeText(stop.name)}`,
        `LOCATION:${escapeText(stop.name)}`,
        `GEO:${stop.point[1]};${stop.point[0]}`,
        `DESCRIPTION:${escapeText(details.join("\n"))}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
