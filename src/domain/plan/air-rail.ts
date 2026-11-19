import type { AirRailOption, FlightOption, TrainOption } from "./transfer-legs";

/**
 * The least time from landing to the train leaving (1.2114): the plane, the walk out, and a ride from
 * the airport to the station, which differs from city to city and is not looked up, so it is generous.
 */
export const minAirRailChangeMinutes = 120;
/** A longer wait is not a journey worth offering. */
export const maxAirRailChangeMinutes = 6 * 60;
const keptJourneys = 3;

const minutesOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const clockOf = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const dayMinutes = 24 * 60;

const cheapestSeat = (train: TrainOption) => train.seats.reduce<number | null>(
  (low, { price }) => price === null ? low : low === null ? price : Math.min(low, price), null);

/**
 * Flights to `city` joined to trains from it (1.2114), the trains asked `trainDay` days after the
 * flights. A train counts only if it leaves at least two hours after the plane lands and within six;
 * each flight keeps its earliest-arriving train, and the quickest journeys are kept. The price adds
 * the fare and the cheapest seat, or is unknown when the train shows none.
 */
export function joinAirRail(
  flights: readonly FlightOption[],
  trains: readonly TrainOption[],
  trainDay: number,
  city: string,
): AirRailOption[] {
  const journeys = flights.flatMap((flight): AirRailOption[] => {
    const start = minutesOf(flight.departs);
    const landing = start + flight.durationMinutes;
    const best = trains.flatMap((train) => {
      const leaves = trainDay * dayMinutes + minutesOf(train.departs);
      const wait = leaves - landing;
      if (wait < minAirRailChangeMinutes || wait > maxAirRailChangeMinutes) return [];
      return [{ train, wait, end: leaves + train.durationMinutes }];
    }).sort((left, right) => left.end - right.end)[0];
    if (!best) return [];
    const seat = cheapestSeat(best.train);
    return [{
      code: `${flight.flightNo}/${best.train.code}`,
      city,
      flight,
      train: best.train,
      waitMinutes: best.wait,
      departs: flight.departs,
      arrives: clockOf(best.end),
      arriveDayOffset: Math.floor(best.end / dayMinutes),
      durationMinutes: best.end - start,
      price: seat === null ? null : flight.price + seat,
    }];
  });
  return journeys.sort((left, right) => left.durationMinutes - right.durationMinutes).slice(0, keptJourneys);
}
