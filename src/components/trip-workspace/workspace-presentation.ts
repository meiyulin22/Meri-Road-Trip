import { destinationProvinceText } from "@/domain/trip-state/destination-areas";
import type { DestinationField, TripState, TripStateField } from "@/domain/trip-state/trip-state";
import type { TransportPreference } from "@/domain/trip-draft/trip-draft";

export const transportLabels: Record<TransportPreference, string> = {
  self_drive: "自驾",
  no_self_drive: "不自驾",
  public_transport: "公共交通",
  flexible: "灵活出行",
};

export function journeyFieldLabel(field: TripStateField, missingLabel: string): string {
  return field.state === "missing" ? missingLabel : field.value;
}

export interface DestinationSummaryLabel {
  /** The one line that always fits: the provinces, or the whole value when it is short. */
  readonly text: string;
  /** Every place, for the reveal. Null when `text` already says everything. */
  readonly detail: string | null;
  /** How many places the reveal adds, so the affordance can say there is more. */
  readonly placeCount: number;
}

/**
 * A destination naming several 市 across several provinces does not fit a summary
 * line, and the provinces are the part that identifies the trip: 「云南省、四川省」 says
 * where this Journey goes, while which cities inside them is detail the user chose
 * themselves and can look at again on demand.
 */
export function destinationSummaryLabel(
  destination: DestinationField,
  missingLabel: string,
): DestinationSummaryLabel {
  if (destination.state === "missing") return { text: missingLabel, detail: null, placeCount: 0 };
  const areas = destination.areas ?? [];
  const placeCount = areas.reduce((total, area) => total + area.places.length, 0);
  const provinces = destinationProvinceText(areas);
  return placeCount === 0 || provinces === destination.value
    ? { text: destination.value, detail: null, placeCount: 0 }
    : { text: provinces, detail: destination.value, placeCount };
}

export function journeyDateLabel(state: TripState): string {
  if (state.startDate.state === "missing") return "日期待定";
  if (state.endDate.state === "missing") return state.startDate.value;
  return `${state.startDate.value} — ${state.endDate.value}`;
}
