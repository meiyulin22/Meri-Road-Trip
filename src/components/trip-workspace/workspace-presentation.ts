import type { TripState, TripStateField } from "@/domain/trip-state/trip-state";
import type { TransportPreference } from "@/domain/trip-draft/trip-draft";

import { tripDatesSummary } from "./trip-dates-model";

export const transportLabels: Record<TransportPreference, string> = {
  self_drive: "自驾",
  no_self_drive: "不自驾",
  public_transport: "公共交通",
  flexible: "灵活出行",
};

export function journeyFieldLabel(field: TripStateField, missingLabel: string): string {
  return field.state === "missing" ? missingLabel : field.value;
}

/** The header's date line, written the same way as the brief's 何时 row. */
export function journeyDateLabel(state: TripState, today: Date = new Date()): string {
  const { text } = tripDatesSummary(state, today);
  return text === "—" ? "日期待定" : text;
}
