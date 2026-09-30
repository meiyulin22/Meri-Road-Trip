import {
  matchingDestinationRemovals,
  removeFromDestination,
  type DestinationArea,
} from "@/domain/trip-state/destination-areas";
import type { DestinationEdit } from "@/domain/trip-state/destination-edit";
import { maxDestinationChoices, type DestinationChoice, type DestinationChoicesPresentation } from "@/domain/trip-message/trip-message";
import type { DestinationField } from "@/domain/trip-state/trip-state";

import type { IdentifiedPick, PlaceResolution } from "./resolve-destination-place";

/**
 * Everything a destination edit did, as facts: the destination it left, the choices
 * it needs the user to make, and each name it could not act on and why. The reply is
 * worded from these, never from what the model assumed would happen.
 */
export interface DestinationEditResult {
  readonly destination: DestinationField;
  readonly changed: boolean;
  /** Places to pick from, and the words they answer: 「潮汕」, or an ambiguous 「朝阳」. */
  readonly choices: { readonly presentation: DestinationChoicesPresentation; readonly answering: string } | null;
  /** Names the provider could not place anywhere. */
  readonly unresolved: readonly string[];
  /** Names that could not be looked up because the provider was unavailable. */
  readonly lookupFailed: readonly string[];
  /** Names the user asked to remove that are not in the destination. */
  readonly notInDestination: readonly string[];
  readonly ambiguousRemovals: readonly string[];
}

export type ResolvePlace = (expression: string) => Promise<PlaceResolution>;

export async function applyDestinationEdit(
  current: DestinationField,
  edit: DestinationEdit,
  resolvePlace: ResolvePlace,
): Promise<DestinationEditResult> {
  const unchanged: DestinationEditResult = {
    destination: current, changed: false, choices: null, unresolved: [], lookupFailed: [], notInDestination: [],
    ambiguousRemovals: [],
  };
  const currentAreas = current.state === "missing" ? [] : current.areas;
  switch (edit.operation) {
    case "none":
      return unchanged;
    case "remove":
      return removePlaces(current, currentAreas, edit.places);
  }

  const resolutions = await Promise.all(edit.places.map(async (expression) =>
    ({ expression, resolution: await resolvePlace(expression) })));
  const failures = {
    unresolved: resolutions.filter((item) => item.resolution.status === "unresolved").map((item) => item.expression),
    lookupFailed: resolutions.filter((item) => item.resolution.status === "provider_error").map((item) => item.expression),
  };
  const mode = edit.operation === "set" ? "replace" : "add";

  // A broad region is answered with the 市 it covers, for the user to pick from.
  if (edit.broadRegion !== null) {
    const offered = resolutions.flatMap(({ resolution }) => resolution.status === "resolved" ? [resolution.pick]
      : resolution.status === "ambiguous" ? resolution.options : []);
    return { ...unchanged, ...failures, choices: choicesFrom(offered, mode, edit.broadRegion, current) };
  }

  const offered = resolutions.flatMap(({ resolution }) => resolution.status === "resolved" ? [resolution.pick]
    : resolution.status === "ambiguous" ? resolution.options : []);
  return {
    ...unchanged,
    ...failures,
    choices: choicesFrom(offered, mode, edit.places.join("、"), current),
  };
}

function removePlaces(
  current: DestinationField,
  currentAreas: readonly DestinationArea[],
  expressions: readonly string[],
): DestinationEditResult {
  let areas = currentAreas;
  const notInDestination: string[] = [];
  const ambiguousRemovals: string[] = [];
  for (const expression of expressions) {
    const matches = matchingDestinationRemovals(areas, expression);
    if (matches.length === 0) notInDestination.push(expression);
    else if (matches.length > 1) ambiguousRemovals.push(expression);
    else areas = removeFromDestination(areas, matches[0]);
  }
  const legacyText = current.state === "known" ? current.legacyText : undefined;
  const destination: DestinationField = areas.length === 0 && !legacyText
    ? { state: "missing" }
    : { state: "known", source: current.state === "known" ? current.source : "user", areas,
      ...(legacyText ? { legacyText } : {}) };
  return {
    destination, changed: areas !== currentAreas, choices: null,
    unresolved: [], lookupFailed: [], notInDestination, ambiguousRemovals,
  };
}

function choicesFrom(
  picks: readonly IdentifiedPick[],
  mode: "add" | "replace",
  answering: string,
  current: DestinationField,
): DestinationEditResult["choices"] {
  const choices: DestinationChoice[] = [];
  const seen = new Set<string>();
  for (const pick of picks) {
    if (seen.has(pick.id)) continue;
    seen.add(pick.id);
    choices.push({ id: pick.id, name: pick.spot ?? pick.place ?? pick.province, province: pick.province,
      ...(pick.place === null ? {} : { city: pick.place }),
      ...(pick.spot === null ? {} : { spot: pick.spot }),
      ...(pick.detail ? { detail: pick.detail } : {}) });
  }
  return choices.length === 0 ? null : {
    presentation: { type: "destination_choices", mode, choices: choices.slice(0, maxDestinationChoices),
      ...(mode === "replace" ? { baseDestination: JSON.stringify(current) } : {}) },
    answering,
  };
}
