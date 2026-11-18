import type { TrainOption } from "./transfer-legs";

/**
 * The least time to change trains (1.2110): on one platform-to-platform walk within a station, or
 * across a city between two of its stations, which means a metro or taxi ride.
 */
export const minChangeMinutes = { sameStation: 40, otherStation: 90 } as const;
/** A longer wait is not a connection worth offering; another day's train would be. */
export const maxChangeMinutes = 6 * 60;
/** Journeys with a change a leg keeps: the quickest few. */
const keptConnections = 3;

const minutesOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const clockOf = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const dayMinutes = 24 * 60;

/**
 * Journeys with one change, joined by code from two direct searches through `city` (1.2110): the
 * second search asked `secondDay` days after the first. A second train counts only if it leaves at
 * least the change time after the first arrives (longer when the stations differ) and within the
 * longest wait. Each first train keeps its best second; the quickest journeys overall are kept.
 * Times are minutes from the first train's day, so a night train's next-day arrival joins right.
 */
export function joinConnections(
  firsts: readonly TrainOption[],
  seconds: readonly TrainOption[],
  secondDay: number,
  city: string,
): TrainOption[] {
  const journeys = firsts.flatMap((first) => {
    const start = minutesOf(first.departs);
    const arrival = start + first.durationMinutes;
    const best = seconds.flatMap((second) => {
      const leaves = secondDay * dayMinutes + minutesOf(second.departs);
      const sameStation = first.to === second.from;
      const wait = leaves - arrival;
      const least = sameStation ? minChangeMinutes.sameStation : minChangeMinutes.otherStation;
      if (wait < least || wait > maxChangeMinutes) return [];
      const end = leaves + second.durationMinutes;
      return [{ second, sameStation, wait, end }];
    }).sort((left, right) => left.end - right.end)[0];
    if (!best) return [];
    const journey: TrainOption = {
      code: `${first.code}/${best.second.code}`,
      from: first.from,
      to: best.second.to,
      departs: first.departs,
      arrives: clockOf(best.end),
      arriveDayOffset: Math.floor(best.end / dayMinutes),
      durationMinutes: best.end - start,
      seats: [],
      change: { city, waitMinutes: best.wait, sameStation: best.sameStation, first, second: best.second },
    };
    return [journey];
  });
  return journeys.sort((left, right) => left.durationMinutes - right.durationMinutes).slice(0, keptConnections);
}
