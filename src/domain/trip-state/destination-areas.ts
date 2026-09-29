/**
 * A destination is not one point. These trips are regional: 川西 is 甘孜州 plus
 * 阿坝州, and a 云南 + 四川 trip crosses two provinces. So a destination is a list
 * of provinces, each holding the places chosen inside it.
 *
 * A province holding no places is a real answer, not an empty one: it is what a
 * user has given when they say 「我想去海南」 before they know where in 海南. The
 * places inside it are named later, by picking them from what Meri recommends.
 */
export interface DestinationArea {
  readonly province: string;
  readonly places: readonly string[];
}

const areaSeparator = " · ";
const placeSeparator = "、";

/** The full text of a destination, used as the field's own displayed value. */
export function destinationAreasText(areas: readonly DestinationArea[]): string {
  return areas
    .map((area) => area.places.length === 0
      ? area.province
      : `${area.province} ${area.places.join(placeSeparator)}`)
    .join(areaSeparator);
}

/** Provinces alone, for a narrow field that cannot hold every place. */
export function destinationProvinceText(areas: readonly DestinationArea[]): string {
  return areas.map((area) => area.province).join(placeSeparator);
}

/**
 * A Journey is named after the smallest thing that still identifies the trip: one
 * place is the trip, and several places across one province make it that
 * province's trip.
 */
export function destinationAreasTitle(areas: readonly DestinationArea[]): string {
  const places = areas.flatMap((area) => area.places);
  return places.length === 1 ? places[0] : destinationProvinceText(areas);
}

/**
 * Places chosen from a recommendation arrive in the order they were offered, each
 * carrying the province it was offered under. They are grouped back into those
 * provinces, because that is the shape a destination has.
 */
export function groupDestinationAreas(
  places: readonly { readonly province: string; readonly name: string }[],
): readonly DestinationArea[] {
  const byProvince = new Map<string, string[]>();
  for (const place of places) {
    const chosen = byProvince.get(place.province);
    if (chosen === undefined) byProvince.set(place.province, [place.name]);
    else if (!chosen.includes(place.name)) chosen.push(place.name);
  }
  return [...byProvince].map(([province, names]) => ({ province, places: names }));
}

/**
 * Two destinations are the same choice when they name the same places, whatever
 * order they were picked or grouped in: 「舟山市、台州市」 and 「台州市、舟山市」 are one
 * answer, and a repeated click must recognise its own earlier work.
 */
export function sameDestinationAreas(
  left: readonly DestinationArea[],
  right: readonly DestinationArea[],
): boolean {
  if (left.length !== right.length) return false;
  const places = new Map(left.map((area) => [area.province, new Set(area.places)]));
  return right.every((area) => {
    const chosen = places.get(area.province);
    return chosen !== undefined && chosen.size === area.places.length &&
      area.places.every((place) => chosen.has(place));
  });
}

/**
 * Returns null rather than throwing, so the TripState validator keeps ownership of
 * its own error type.
 */
export function parseDestinationAreas(value: unknown): readonly DestinationArea[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const areas: DestinationArea[] = [];
  for (const area of value) {
    if (typeof area !== "object" || area === null || Array.isArray(area)) return null;
    const record = area as Record<string, unknown>;
    if (Object.keys(record).length !== 2 ||
      !isPresentText(record.province) || !Array.isArray(record.places) ||
      record.places.some((place) => !isPresentText(place)) ||
      new Set(record.places).size !== record.places.length) {
      return null;
    }
    areas.push({ province: record.province, places: [...record.places as string[]] });
  }
  return new Set(areas.map((area) => area.province)).size === areas.length ? areas : null;
}

function isPresentText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
