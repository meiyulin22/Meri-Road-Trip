import type { LocationCandidate } from "@/domain/location/location";
import { z } from "zod";

import { picksFromSearch, type IdentifiedPick } from "./resolve-destination-place";

const searchQuery = z.string().trim().min(2).max(80);
export const destinationSelectionSchema = z.union([
  z.object({ query: searchQuery, id: z.string().trim().min(1) }).strict(),
  z.object({ query: searchQuery, region: z.string().trim().min(1).max(200).nullable() }).strict(),
]);

/** Input tips have no reliable POI ID. Recheck the full name and area before saving. */
export function pickFromSuggestion(
  candidates: readonly LocationCandidate[],
  name: string,
  region: string | null,
): IdentifiedPick | null {
  const matches = candidates.filter((candidate) => {
    if (normalize(candidate.name) !== normalize(name)) return false;
    if (region === null) return true;
    // A city's tip and lookup can locate its centre in different districts. Those
    // districts are not part of the selected city preference; for a spot they are.
    const parts = normalize(candidate.name) === normalize(candidate.province ?? "") ? [candidate.province]
      : normalize(candidate.name) === normalize(candidate.city ?? "") ? [candidate.province, candidate.city]
      : [candidate.province, candidate.city, candidate.district];
    const area = normalize([...new Set(parts
      .filter((part): part is string => Boolean(part)))].join(""));
    const suggestedArea = normalize(region);
    return area !== "" && (area.startsWith(suggestedArea) || suggestedArea.startsWith(area));
  });
  const picks = picksFromSearch(matches);
  const preferences = new Set(picks.map((pick) => JSON.stringify([pick.province, pick.place, pick.spot])));
  // Repeated provider POIs can describe one saved preference, but different destinations
  // must never be silently reduced to whichever happens to appear first.
  return preferences.size === 1 ? picks[0] : null;
}

/** Suffixes that turn the user's words into an administrative name: 大连 + 市, 大理 + 白族自治州. */
const areaEndings = ["省", "市", "区", "县", "州", "盟", "旗"];

/**
 * Endings of a place worth travelling to. Tianditu files 大连上升 (a shop inside a geopark)
 * and 大连CS (a company) under the same scenic category as 大连老虎滩, so the category cannot
 * tell them apart and only the name can.
 */
const placeEndings = [
  "景区", "风景区", "景点", "公园", "乐园", "广场", "博物馆", "美术馆", "纪念馆", "展览馆",
  "古城", "古镇", "古街", "海滩", "海滨", "沙滩", "浴场", "温泉", "森林", "湿地", "峡谷",
  "动物园", "植物园", "海洋馆", "水族馆", "世界", "寺", "庙", "塔", "宫", "园", "馆",
  "山", "湖", "岛", "湾", "港", "滩", "泉", "岭", "峰", "洞", "桥", "街", "城", "村", "镇",
  // Named zones and natural features are places too: 青岛奥帆海洋文化旅游区, 黄山花谷.
  "区", "县", "市", "谷", "溪", "河", "江", "岩", "林", "原",
];

function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, "");
}

/**
 * An administrative name is the user's words plus a short suffix. A tourist zone keeps the
 * same endings (青岛奥帆海洋文化旅游区) but its suffix is long and names tourism, so it is not
 * treated as the area that makes namesakes redundant.
 */
function isAdministrativeName(name: string, query: string): boolean {
  if (name === query || !name.startsWith(query)) return false;
  const rest = name.slice(query.length);
  if (rest.length > 6 || /旅游|风景|景区|文化/u.test(rest)) return false;
  return areaEndings.some((ending) => name.endsWith(ending));
}

/**
 * A manual search that names an administrative area already has its answer. Searching 大连
 * returned 大连市 beside 大连上升, 大连CS and 大连啤酒节 — names that merely begin with the words.
 * When the candidates hold the area itself, only the area, a place whose name is exactly the
 * user's word, and a name that ends like a place to travel to stay. Without an area answer
 * nothing is hidden, because there a namesake may be the point.
 *
 * The cost is honest: a real sight whose name ends in something not listed (大连老虎滩) is
 * hidden too, but only when the user typed an administrative name — and the area card that
 * replaced it is the answer they asked for.
 */
export function withoutAreaNamesakes(
  candidates: readonly LocationCandidate[],
  query: string,
): readonly LocationCandidate[] {
  const words = normalize(query);
  if (words.length < 2) return candidates;
  const hasArea = candidates.some((candidate) => isAdministrativeName(normalize(candidate.name), words));
  if (!hasArea) return candidates;
  return candidates.filter((candidate) => {
    const name = normalize(candidate.name);
    if (isAdministrativeName(name, words) || name === words) return true;
    if (!name.startsWith(words)) return true;
    const rest = name.slice(words.length);
    // A Latin tail is a company or a product, never a place name.
    if (!/\p{Script=Han}/u.test(rest)) return false;
    return placeEndings.some((ending) => rest.endsWith(ending));
  });
}
