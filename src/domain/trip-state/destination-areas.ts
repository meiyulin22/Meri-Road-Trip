/**
 * A destination is not one point. These trips are regional: 川西 is 甘孜州 plus
 * 阿坝州, and a 云南 + 四川 trip crosses two provinces. So a destination is a list
 * of provinces, each holding the 市 chosen inside it, and each 市 holding the spots
 * the user named inside it.
 *
 * A province holding no places is a real answer, not an empty one: it is what a
 * user has given when they say 「我想去海南」 before they know where in 海南, and a
 * it remains selected even while the traveler decides which city to visit.
 *
 * A spot is never a destination of its own. 「我想去梅里雪山」 is a trip to 迪庆藏族
 * 自治州 that has to include 梅里雪山, so the spot hangs off the 市 it lies in: the
 * plan can consider that preference, and removing the 市 removes the spot with it.
 */
export interface DestinationPlace {
  readonly name: string;
  readonly spots: readonly string[];
}

export interface DestinationArea {
  readonly province: string;
  readonly places: readonly DestinationPlace[];
}

/**
 * One expression resolved to where it sits: a whole province, a 市 inside one, or a
 * spot inside a 市. Every way a destination grows — chat, the editor's search, a
 * picked card — arrives as one of these.
 */
export interface DestinationPick {
  readonly province: string;
  readonly place: string | null;
  readonly spot: string | null;
}

/** What to take out of a destination: a province, a 市 inside it, or a spot inside that. */
export type DestinationRemoval =
  | { readonly province: string; readonly place: null; readonly spot: null }
  | { readonly province: string; readonly place: string; readonly spot: string | null };

const areaSeparator = " · ";
const placeSeparator = "、";

/**
 * A 直辖市 is its own province and its own 市, so it is stored as 北京市 inside
 * 北京市. Written out, that repetition says nothing.
 */
function placeText(area: DestinationArea, place: DestinationPlace): string {
  const name = place.name === area.province ? "" : place.name;
  const spots = place.spots.length ? `（${place.spots.join(placeSeparator)}）` : "";
  return `${name}${spots}`;
}

/** The full text of a destination, for display and for prompts. */
export function destinationAreasText(areas: readonly DestinationArea[]): string {
  return areas
    .map((area) => {
      const places = area.places.map((place) => placeText(area, place)).filter((text) => text !== "");
      if (places.length === 0) return area.province;
      // A 直辖市 is its own province, so its spots follow the name directly: 北京市（故宫）.
      const joined = places.join(placeSeparator);
      return joined.startsWith("（") ? `${area.province}${joined}` : `${area.province} ${joined}`;
    })
    .join(areaSeparator);
}

/** Provinces alone, for a narrow field that cannot hold every place. */
export function destinationProvinceText(areas: readonly DestinationArea[]): string {
  return areas.map((area) => area.province).join(placeSeparator);
}

/**
 * A Journey is named after the smallest thing that still identifies the trip: one
 * place is the trip, and anything wider is named by its provinces.
 */
export function destinationAreasTitle(areas: readonly DestinationArea[]): string {
  const places = areas.flatMap((area) => area.places);
  if (places.length === 1) return places[0].name;
  // Past two provinces the full list stops reading as a name: 「云南省、四川省等4省」.
  if (areas.length > 2) return `${destinationProvinceText(areas.slice(0, 2))}等${areas.length}省`;
  return destinationProvinceText(areas);
}

/**
 * What `after` holds that `before` did not: new provinces, new 市, and new spots under
 * a 市 already there. A confirmation names this, not the whole destination — read
 * out in full after every pick, a four-province trip buried the one thing just added.
 */
export function destinationAdditions(
  before: readonly DestinationArea[],
  after: readonly DestinationArea[],
): readonly DestinationArea[] {
  return after.flatMap((area) => {
    const previous = before.find((item) => item.province === area.province);
    if (previous === undefined) return [area];
    const places = area.places.flatMap((place) => {
      const existing = previous.places.find((item) => item.name === place.name);
      if (existing === undefined) return [place];
      const spots = place.spots.filter((spot) => !existing.spots.includes(spot));
      return spots.length === 0 ? [] : [{ ...place, spots }];
    });
    return places.length === 0 ? [] : [{ ...area, places }];
  });
}

export function destinationPlaceCount(areas: readonly DestinationArea[]): number {
  return areas.reduce((total, area) => total + area.places.length, 0);
}

export function destinationContains(areas: readonly DestinationArea[], pick: DestinationPick): boolean {
  const area = areas.find((item) => item.province === pick.province);
  if (area === undefined) return false;
  if (pick.place === null) return true;
  const place = area.places.find((item) => item.name === pick.place);
  if (place === undefined) return false;
  return pick.spot === null || place.spots.includes(pick.spot);
}

/**
 * Adding never loses anything already chosen. A province already present absorbs a
 * bare province pick; a 市 already present only gains the new spot.
 */
export function addToDestination(
  areas: readonly DestinationArea[],
  pick: DestinationPick,
): readonly DestinationArea[] {
  const newPlace = (name: string): DestinationPlace => ({ name, spots: pick.spot === null ? [] : [pick.spot] });
  const existingArea = areas.find((area) => area.province === pick.province);
  if (existingArea === undefined) {
    return [...areas, { province: pick.province, places: pick.place === null ? [] : [newPlace(pick.place)] }];
  }
  if (pick.place === null) return areas;

  const existingPlace = existingArea.places.find((place) => place.name === pick.place);
  const places = existingPlace === undefined
    ? [...existingArea.places, newPlace(pick.place)]
    : existingArea.places.map((place) => place !== existingPlace || pick.spot === null || place.spots.includes(pick.spot)
      ? place
      : { ...place, spots: [...place.spots, pick.spot] });
  return areas.map((area) => area === existingArea ? { ...area, places } : area);
}

/**
 * Removing a 市 keeps its province: the user still wants to go somewhere in it.
 * Removing the province is its own act.
 */
export function removeFromDestination(
  areas: readonly DestinationArea[],
  removal: DestinationRemoval,
): readonly DestinationArea[] {
  if (removal.place === null) return areas.filter((area) => area.province !== removal.province);
  return areas.map((area) => {
    if (area.province !== removal.province) return area;
    const places = removal.spot === null
      ? area.places.filter((place) => place.name !== removal.place)
      : area.places.map((place) => place.name === removal.place
        ? { ...place, spots: place.spots.filter((spot) => spot !== removal.spot) }
        : place);
    return { ...area, places };
  });
}

function normalizeName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").trim();
}

/** Match exact names first, then a unique prefix; ambiguous names remove nothing. */
export function findInDestination(
  areas: readonly DestinationArea[],
  expression: string,
): DestinationRemoval | null {
  const matches = matchingDestinationRemovals(areas, expression);
  return matches.length === 1 ? matches[0] : null;
}

export function matchingDestinationRemovals(
  areas: readonly DestinationArea[],
  expression: string,
): readonly DestinationRemoval[] {
  const said = normalizeName(expression);
  if (said.length < 2) return [];
  const entries: { name: string; removal: DestinationRemoval }[] = [];
  for (const area of areas) {
    entries.push({ name: area.province, removal: { province: area.province, place: null, spot: null } });
    for (const place of area.places) {
      if (place.name !== area.province) {
        entries.push({ name: place.name, removal: { province: area.province, place: place.name, spot: null } });
      }
      for (const spot of place.spots) {
        entries.push({ name: spot, removal: { province: area.province, place: place.name, spot } });
      }
    }
  }
  const exact = entries.filter(({ name }) => normalizeName(name) === said);
  if (exact.length > 0) return exact.map((item) => item.removal);
  const prefix = entries.filter(({ name }) => normalizeName(name).startsWith(said));
  return prefix.map((item) => item.removal);
}

/**
 * Returns null rather than throwing, so the TripState validator keeps ownership of
 * its own error type.
 */
export function parseDestinationAreas(value: unknown): readonly DestinationArea[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const areas: DestinationArea[] = [];
  for (const area of value) {
    if (!isRecord(area) || !hasExactKeys(area, ["province", "places"]) ||
      !isPresentText(area.province) || !Array.isArray(area.places)) {
      return null;
    }
    const places: DestinationPlace[] = [];
    for (const place of area.places) {
      if (!isRecord(place) || !hasExactKeys(place, ["name", "spots"]) || !isPresentText(place.name) ||
        !Array.isArray(place.spots) || !place.spots.every(isPresentText) ||
        new Set(place.spots).size !== place.spots.length) {
        return null;
      }
      places.push({ name: place.name, spots: [...place.spots] });
    }
    if (new Set(places.map((place) => place.name)).size !== places.length) return null;
    areas.push({ province: area.province, places });
  }
  return new Set(areas.map((area) => area.province)).size === areas.length ? areas : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isPresentText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
