import type { FlightOption, TrainOption, TransferLeg } from "./transfer-legs";
import { longTrainMinutes } from "./transport-question";

/**
 * Switching setting off or heading home between the train and the flight already found for it
 * (1.2115), the plan page's side of the 1.2112 question, which a plan page cannot pause to ask.
 * It is offered only where both were found and the quickest train takes over 12 hours; it changes
 * this plan alone, never the trip's locked way of travelling, and looks nothing up again.
 */
export type LegMode = "flight" | "train";

const quickestTrain = (options: readonly TrainOption[]) => [...options].sort((left, right) => left.durationMinutes - right.durationMinutes)[0];
const quickestFlight = (options: readonly FlightOption[]) => [...options].sort((left, right) =>
  left.durationMinutes - right.durationMinutes || left.price - right.price)[0];

/** The mode the traveller may switch this leg to, or null when there is no such choice. */
export function legModeOffer(leg: TransferLeg): LegMode | null {
  if (leg.kind === "between" || !leg.recommendation) return null;
  const train = leg.trains?.options.length ? quickestTrain(leg.trains.options) : null;
  const flight = leg.flights?.options.length ? quickestFlight(leg.flights.options) : null;
  if (!train || !flight || train.durationMinutes <= longTrainMinutes) return null;
  if (leg.recommendation.mode === "train") return "flight";
  if (leg.recommendation.mode === "flight") return "train";
  return null;
}

/** The leg on the switched mode, its quickest option first; null when the switch is not on offer. */
export function switchLegMode(leg: TransferLeg, mode: LegMode, locale: "zh" | "en"): TransferLeg | null {
  if (legModeOffer(leg) !== mode) return null;
  const zh = locale === "zh";
  if (mode === "flight" && leg.flights) {
    const flight = quickestFlight(leg.flights.options);
    return {
      ...leg,
      flights: { ...leg.flights, options: [flight, ...leg.flights.options.filter((option) => option !== flight)] },
      recommendation: { mode: "flight", trainCode: null, flightNo: flight.flightNo, by: "traveller",
        reason: zh ? "你在计划页改坐飞机，这是用时最短的一班" : "You switched to flying on the plan page; this is the quickest" },
    };
  }
  if (mode === "train" && leg.trains) {
    const train = quickestTrain(leg.trains.options);
    return {
      ...leg,
      trains: { ...leg.trains, options: [train, ...leg.trains.options.filter((option) => option !== train)] },
      recommendation: { mode: "train", trainCode: train.code, flightNo: null, by: "traveller",
        reason: zh ? "你在计划页改坐火车，这是用时最短的一趟" : "You switched to the train on the plan page; this is the quickest" },
    };
  }
  return null;
}
