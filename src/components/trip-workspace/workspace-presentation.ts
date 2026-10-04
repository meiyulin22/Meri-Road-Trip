import type { Messages } from "@/components/i18n/messages";
import type { TripState, TripStateField } from "@/domain/trip-state/trip-state";

import { tripDatesSummary } from "./trip-dates-model";

export function journeyFieldLabel(field: TripStateField, missingLabel: string): string {
  return field.state === "missing" ? missingLabel : field.value;
}

/** The header's date line, written the same way as the brief's 何时 row. */
export function journeyDateLabel(
  state: TripState,
  text: Messages["dates"],
  pending: string,
  today: Date = new Date(),
): string {
  const summary = tripDatesSummary(state, today, text);
  return summary.text === "—" ? pending : summary.text;
}
