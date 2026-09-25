import type { TripState, TripStateField } from "@/domain/trip-state/trip-state";
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

export function journeyDateLabel(state: TripState): string {
  if (state.startDate.state === "missing") return "日期待定";
  if (state.endDate.state === "missing") return state.startDate.value;
  return `${state.startDate.value} — ${state.endDate.value}`;
}
