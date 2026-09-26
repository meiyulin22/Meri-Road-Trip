export type TripUserAction = {
  readonly id: string;
  readonly tripId: string;
  readonly type: "request_destination_recommendations";
  readonly createdAt: string;
};

export function validateTripUserAction(value: unknown): TripUserAction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("TripUserAction must be an object.");
  }
  const action = value as Record<string, unknown>;
  if (Object.keys(action).length !== 4 ||
    typeof action.id !== "string" || action.id.trim() === "" ||
    typeof action.tripId !== "string" || action.tripId.trim() === "" ||
    action.type !== "request_destination_recommendations" ||
    typeof action.createdAt !== "string" ||
    Number.isNaN(Date.parse(action.createdAt))) {
    throw new Error("TripUserAction has an invalid shape.");
  }
  return {
    id: action.id,
    tripId: action.tripId,
    type: action.type,
    createdAt: new Date(action.createdAt).toISOString(),
  };
}
