import {
  addToDestination,
  destinationContains,
  matchingDestinationRemovals,
  removeFromDestination,
  type DestinationArea,
  type DestinationPick,
} from "@/domain/trip-state/destination-areas";
import type { DestinationEdit } from "@/domain/trip-state/destination-edit";
import { destinationPreferenceId } from "@/domain/trip-message/destination-choice-identity";
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
  /** Places the user named that the provider matched exactly, already written in. */
  readonly added: readonly DestinationPick[];
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

/**
 * `userWords` is what the user actually typed. The model writes the names it hands
 * over, and it has rewritten a typo into a different real place (大莲 → 大理), which
 * then matched exactly; a name the user never wrote is the model's guess, so it is
 * offered for a click however exactly the provider matched it.
 */
export async function applyDestinationEdit(
  current: DestinationField,
  edit: DestinationEdit,
  resolvePlace: ResolvePlace,
  userWords: string,
): Promise<DestinationEditResult> {
  const unchanged: DestinationEditResult = {
    destination: current, changed: false, added: [], choices: null, unresolved: [], lookupFailed: [], notInDestination: [],
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
  // Naming a destination never authorizes deleting saved places, even if the
  // model calls it set. Deletions go through the explicit remove branch above.
  const mode = "add";

  // A broad region is answered with the 市 it covers, for the user to pick from.
  if (edit.broadRegion !== null) {
    const offered = resolutions.flatMap(({ resolution }) => resolution.status === "resolved" ? [resolution.pick]
      : resolution.status === "ambiguous" ? resolution.options : []);
    return { ...unchanged, ...failures, choices: choicesFrom(offered, mode, edit.broadRegion, current) };
  }

  // A name the user typed that the provider matched exactly is their own choice,
  // stated in their own words: a card holding that one place would only ask them to
  // repeat it. Anything the provider had to interpret is still offered for a click.
  const said = compact(userWords);
  const isCertain = ({ expression, resolution }: (typeof resolutions)[number]) =>
    resolution.status === "resolved" && resolution.exact && said.includes(compact(expression));
  const exact = resolutions.flatMap((item) =>
    item.resolution.status === "resolved" && isCertain(item) ? [item.resolution.pick] : []);
  const uncertain = resolutions.filter((item) =>
    item.resolution.status === "ambiguous" || (item.resolution.status === "resolved" && !isCertain(item)));
  const offered = uncertain.flatMap(({ resolution }) => resolution.status === "resolved" ? [resolution.pick]
    : resolution.status === "ambiguous" ? resolution.options : []);
  const added = exact.filter((pick) => !destinationContains(currentAreas, pick));
  const areas = added.reduce<readonly DestinationArea[]>((result, pick) => addToDestination(result, pick), currentAreas);
  const destination: DestinationField = added.length === 0 ? current : {
    state: "known", source: "user", areas,
    ...(current.state === "known" && current.legacyText ? { legacyText: current.legacyText } : {}),
  };
  return {
    ...unchanged,
    ...failures,
    destination,
    changed: added.length > 0,
    added: added.map(({ province, place, spot }) => ({ province, place, spot })),
    choices: choicesFrom(offered, mode, uncertain.map((item) => item.expression).join("、"), destination),
  };
}

function compact(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "");
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
    destination, changed: areas !== currentAreas, added: [], choices: null,
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
    const id = pick.place === null ? pick.id : destinationPreferenceId(pick.province, pick.place, pick.spot);
    if (seen.has(id)) continue;
    seen.add(id);
    choices.push({ id, name: pick.place ?? pick.province, province: pick.province,
      ...(pick.place === null ? {} : { city: pick.place }),
      ...(pick.spot === null ? {} : { spot: pick.spot }),
    });
  }
  return choices.length === 0 ? null : {
    presentation: { type: "destination_choices", mode, choices: choices.slice(0, maxDestinationChoices),
      ...(mode === "replace" ? { baseDestination: JSON.stringify(current) } : {}) },
    answering,
  };
}
