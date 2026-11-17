import type { TiandituClient, TiandituFailure } from "./tianditu-fetch";
import type { LonLat } from "./tianditu-drive";
import { tiandituPoint } from "./tianditu-location-provider";

/** A city or other administrative area as Tianditu answers its name: its centre and its code. */
export type CityPoint = {
  readonly name: string;
  /** The 9-digit GB code, such as 156530700 for 丽江市. */
  readonly adminCode: string;
  readonly point: LonLat;
};

export type CityPointAnswer =
  | { readonly status: "found"; readonly city: CityPoint }
  | { readonly status: "not_found" }
  | { readonly status: "failure"; readonly reason: TiandituFailure | "api_error" };

const chinaBound = "73,3,136,54";
/**
 * What follows a place's short name in its administrative name: 上海 → 上海市, 大理 →
 * 大理白族自治州, 新疆 → 新疆维吾尔自治区. Only peoples' names may come before 自治…, so a
 * different city never matches: 丽 is not 丽江市.
 */
const adminSuffix = /^(?:(?:[\p{Script=Han}]{1,4}族)+(?:自治州|自治县|自治旗|自治区)|维吾尔自治区|特别行政区|自治区|地区|省|市|州|盟|县|区|旗)$/u;

/**
 * Whether Tianditu's administrative answer is the place asked for: the same name, or the
 * name with only an administrative ending after it. 大理 matches 大理白族自治州; 大理 does
 * not match 大理石厂 and 丽 does not match 丽江市, and a different city never matches.
 */
export function isAdminNameOf(words: string, areaName: string): boolean {
  if (areaName === words) return true;
  return areaName.startsWith(words) && adminSuffix.test(areaName.slice(words.length));
}

/**
 * Where a city is (1.2106): one keyword search, read only when Tianditu answers with an
 * administrative area (`resultType` 3) whose name is the one asked for. Its `lonlat` is the
 * area's centre, the seat of its government, which is on land: a city's own spots can sit in a
 * lake. A list of POIs, or an area with another name, is "not found", never a guess. Abroad is
 * outside the search's bounds and is not found too. Never throws and never retries.
 */
export function createTiandituCityPoint(client: TiandituClient): (name: string) => Promise<CityPointAnswer> {
  return async (name) => {
    const words = name.normalize("NFKC").trim();
    if (words === "") return { status: "not_found" };
    const answer = await client.get("/v2/search", {
      type: "query",
      postStr: JSON.stringify({ keyWord: words, queryType: "1", start: "0", count: "1", level: "12", mapBound: chinaBound, show: "1" }),
    });
    if (!answer.ok) return { status: "failure", reason: answer.reason };
    return cityPointOf(answer.body, words);
  };
}

/** The search's body read as a city's centre; exported for tests with recorded answers. */
export function cityPointOf(body: Record<string, unknown>, words: string): CityPointAnswer {
  const status = typeof body.status === "object" && body.status !== null ? (body.status as Record<string, unknown>).infocode : undefined;
  // 3001 is Tianditu's "no data found": an answer, not an outage.
  if (status === 3001) return { status: "not_found" };
  if (status !== 1000) return { status: "failure", reason: "api_error" };
  const area = typeof body.area === "object" && body.area !== null ? body.area as Record<string, unknown> : null;
  if (area === null) return { status: "not_found" };
  const areaName = typeof area.name === "string" ? area.name.trim() : "";
  const adminCode = String(area.adminCode ?? "");
  const point = tiandituPoint(area.lonlat);
  if (!point || !/^156\d{6}$/u.test(adminCode) || !isAdminNameOf(words, areaName)) return { status: "not_found" };
  return { status: "found", city: { name: areaName, adminCode, point } };
}
