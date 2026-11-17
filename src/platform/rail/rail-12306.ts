import { z } from "zod";

import { type LegTrains, railQueryDate, type TrainOption } from "@/domain/plan/transfer-legs";
import { logger } from "@/platform/observability/logger";

import type { RailBudget } from "./rail-budget";
import { type RailToolCaller, railStartupRequests } from "./rail-mcp";

export type TrainSearch = {
  /** 12306's short city names, such as 丽江 and 大理. */
  readonly fromCity: string;
  readonly toCity: string;
  /** The leg's day, YYYY-MM-DD; beyond the presale window a reference day is asked instead. */
  readonly date: string;
  /** Departure window in whole hours, 0–24. */
  readonly earliestHour: number;
  readonly latestHour: number;
};

export type RailAnswer =
  | { readonly status: "found"; readonly trains: LegTrains }
  /** 12306 answered with no train for these two cities that day. */
  | { readonly status: "none"; readonly queriedDate: string; readonly reference: boolean }
  /** One of the cities has no station 12306 knows. */
  | { readonly status: "no_station"; readonly place: string }
  /** Not asked: turned off, the day's requests spent, paused after a failure, or this request failed. */
  | { readonly status: "unavailable"; readonly reason: "disabled" | "past_date" | "daily_limit" | "paused" | "failed" };

export type RailDependencies = {
  readonly enabled: () => boolean;
  readonly tools: () => Promise<RailToolCaller>;
  readonly budget: RailBudget;
  readonly now: () => Date;
};

// The JSON 12306-mcp 0.3.10 writes for get-tickets with format "json" (probe 2026-11-17).
const ticketSchema = z.object({
  start_train_code: z.string().min(1),
  start_date: z.string(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/u),
  lishi: z.string().regex(/^\d{2}:\d{2}$/u),
  from_station: z.string().min(1),
  to_station: z.string().min(1),
  prices: z.array(z.object({ seat_name: z.string().min(1), num: z.string(), price: z.number().nullable().optional() })),
});
const ticketsSchema = z.array(ticketSchema);
const cityCodesSchema = z.record(z.string(), z.union([
  z.object({ station_code: z.string(), station_name: z.string() }),
  z.object({ error: z.string() }),
]));
const stationsSchema = z.array(z.object({ station_code: z.string(), station_name: z.string() }));

const minutesOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const clockOf = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * One 12306 row as Meri keeps it, or null when it is not a train between the two cities asked:
 * 12306 mixes in the city's other stations' neighbours, so both stations must be the cities' own.
 * The arrival is departure plus duration, computed here: 12306-mcp got the date wrong across
 * midnight (its open issue, 2026-10).
 */
export function trainOf(row: z.infer<typeof ticketSchema>, fromStations: ReadonlySet<string>, toStations: ReadonlySet<string>): TrainOption | null {
  if (!fromStations.has(row.from_station) || !toStations.has(row.to_station)) return null;
  const departs = minutesOf(row.start_time);
  const durationMinutes = minutesOf(row.lishi);
  if (durationMinutes <= 0) return null;
  const arrival = departs + durationMinutes;
  return {
    code: row.start_train_code,
    from: row.from_station,
    to: row.to_station,
    departs: row.start_time,
    arrives: clockOf(arrival),
    arriveDayOffset: Math.floor(arrival / (24 * 60)),
    durationMinutes,
    seats: row.prices.map(({ seat_name, num, price }) => ({ name: seat_name, price: price ?? null, left: num })),
  };
}

const beijingDate = (now: Date) => new Date(now.getTime() + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);

/**
 * Trains between two cities on one day, through 12306-mcp, query only (1.2108). Station names come
 * from the server's own table (no request); only the ticket search reaches 12306, two requests
 * each, through the shared budget. A failed request pauses 12306 for half an hour, no retry. An
 * answer with no train data is "none", not a failure: 12306 answers so outside its presale window.
 */
export function create12306Rail(deps: RailDependencies): (search: TrainSearch) => Promise<RailAnswer> {
  let started = false;

  async function caller(): Promise<RailToolCaller | "daily_limit" | "paused"> {
    if (started) return deps.tools();
    const start = await deps.budget.run(railStartupRequests, () => deps.tools());
    if (!start.ok) return start.reason;
    started = true;
    return start.value;
  }

  return async (search) => {
    if (!deps.enabled()) return { status: "unavailable", reason: "disabled" };
    const query = railQueryDate(search.date, beijingDate(deps.now()));
    if (!query) return { status: "unavailable", reason: "past_date" };
    try {
      const call = await caller();
      if (call === "daily_limit" || call === "paused") return { status: "unavailable", reason: call };
      const codes = cityCodesSchema.parse(JSON.parse(await call("get-station-code-of-citys", { citys: `${search.fromCity}|${search.toCity}` })));
      for (const place of [search.fromCity, search.toCity]) {
        const code = codes[place];
        if (!code || "error" in code) return { status: "no_station", place };
      }
      // A city's stations, from the server's table; 12306 lists 上海虹桥 under 上海. Without the
      // list, only the city's own station counts.
      const stationsOf = async (city: string, own: string) => {
        let listed: unknown = [];
        try {
          listed = JSON.parse(await call("get-stations-code-in-city", { city }));
        } catch {
          listed = [];
        }
        const parsed = stationsSchema.safeParse(listed);
        return new Set([own, ...(parsed.success ? parsed.data.map(({ station_name }) => station_name) : [])]);
      };
      const from = codes[search.fromCity] as { station_name: string };
      const to = codes[search.toCity] as { station_name: string };
      const [fromStations, toStations] = [await stationsOf(search.fromCity, from.station_name), await stationsOf(search.toCity, to.station_name)];
      const asked = await deps.budget.run(2, async () => {
        try {
          return { text: await call("get-tickets", {
            date: query.date, fromStation: search.fromCity, toStation: search.toCity, format: "json",
            earliestStartTime: search.earliestHour, latestStartTime: search.latestHour,
          }) };
        } catch (error) {
          // 12306 answered without train data and 12306-mcp could not read it (probe 2026-11-17, a day beyond presale).
          if (error instanceof Error && error.message.includes("reading 'result'")) return { text: null };
          throw error;
        }
      });
      if (!asked.ok) return { status: "unavailable", reason: asked.reason };
      if (asked.value.text === null) return { status: "none", queriedDate: query.date, reference: query.reference };
      if (asked.value.text.startsWith("Error")) throw new Error(asked.value.text.slice(0, 80));
      const rows = ticketsSchema.parse(JSON.parse(asked.value.text));
      const options = rows.flatMap((row) => trainOf(row, fromStations, toStations) ?? []);
      if (options.length === 0) return { status: "none", queriedDate: query.date, reference: query.reference };
      return { status: "found", trains: { queriedDate: query.date, reference: query.reference, checkedAt: deps.now().toISOString(), options } };
    } catch (error) {
      deps.budget.pause();
      logger.warn({ from: search.fromCity, to: search.toCity, error: error instanceof Error ? error.message.slice(0, 120) : "unknown" },
        "12306 lookup failed; paused with no retry");
      return { status: "unavailable", reason: "failed" };
    }
  };
}
