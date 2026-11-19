import type { FlightOption } from "./transfer-legs";

/**
 * The least time to change planes (1.2113): an hour and a half in one airport, as airlines sell it
 * (VariFlight's own 上海 → 迪庆 connection changes in 成都天府 in 1 h 50 min); three and a half across
 * a city to its other airport (成都天府 to 双流, 上海浦东 to 虹桥 take about an hour by road).
 */
export const minFlightChangeMinutes = { sameAirport: 90, otherAirport: 210 } as const;
/** A longer wait is not a connection worth offering. */
export const maxFlightChangeMinutes = 6 * 60;
const keptConnections = 3;

const minutesOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const clockOf = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const dayMinutes = 24 * 60;

/**
 * Journeys with one change of plane, joined by code from two fare searches through `city` (1.2113),
 * the second asked `secondDay` days after the first, like train connections (1.2110). A second flight
 * counts only if it leaves at least the change time after the first lands (longer at another airport)
 * and within the longest wait. Each first flight keeps its best second; the quickest few are kept.
 * The fare is the two cheapest cabins added, and so are the charges: two tickets, not a through fare.
 */
export function joinFlights(
  firsts: readonly FlightOption[],
  seconds: readonly FlightOption[],
  secondDay: number,
  city: string,
): FlightOption[] {
  const journeys = firsts.flatMap((first): FlightOption[] => {
    const start = minutesOf(first.departs);
    const landing = start + first.durationMinutes;
    const best = seconds.flatMap((second) => {
      const leaves = secondDay * dayMinutes + minutesOf(second.departs);
      const sameAirport = first.toAirport === second.fromAirport;
      const wait = leaves - landing;
      const least = sameAirport ? minFlightChangeMinutes.sameAirport : minFlightChangeMinutes.otherAirport;
      if (wait < least || wait > maxFlightChangeMinutes) return [];
      return [{ second, sameAirport, wait, end: leaves + second.durationMinutes }];
    }).sort((left, right) => left.end - right.end || left.second.price - right.second.price)[0];
    if (!best) return [];
    const charges = (first.charges ?? 0) + (best.second.charges ?? 0);
    return [{
      flightNo: `${first.flightNo}/${best.second.flightNo}`,
      fromAirport: first.fromAirport,
      toAirport: best.second.toAirport,
      departs: first.departs,
      arrives: clockOf(best.end),
      arriveDayOffset: Math.floor(best.end / dayMinutes),
      durationMinutes: best.end - start,
      cabin: first.cabin === best.second.cabin ? first.cabin : `${first.cabin}/${best.second.cabin}`,
      price: first.price + best.second.price,
      // The fewer seats of the two is how many such journeys can be bought.
      seatsLeft: first.seatsLeft === null || best.second.seatsLeft === null ? null : Math.min(first.seatsLeft, best.second.seatsLeft),
      charges: charges > 0 ? charges : null,
      stopCity: null,
      codeshare: first.codeshare || best.second.codeshare,
      change: { city, waitMinutes: best.wait, sameAirport: best.sameAirport, first, second: best.second },
    }];
  });
  return journeys.sort((left, right) => left.durationMinutes - right.durationMinutes || left.price - right.price).slice(0, keptConnections);
}
