import { z } from "zod";

import { railQueryDate, type TrainOption } from "@/domain/plan/transfer-legs";
import { type DailyBudget } from "@/platform/http/daily-budget";
import { logger } from "@/platform/observability/logger";
import { parseLabelledLiteral } from "@/platform/flight/python-literal";
import { type FlightToolCaller, variflightFen } from "@/platform/flight/variflight";

import type { RailAnswer, TrainSearch } from "./rail-12306";

/**
 * Trains from VariFlight's Tripmatch `searchTrainTickets` (2026-11-22): the licensed, paid source that
 * replaces 12306-mcp before launch (merlin, 2026-11-18; 12306 kept failing). Same answer shape as the
 * 12306 adapter, so the transport agent does not change. ¥0.25 a search, counted in fen against
 * VariFlight's own daily money budget (shared with flights); a failure pauses VariFlight, no retry.
 *
 * What it answers (probe 2026-11-18, 丽江 → 大理): every train leaving the from city that day with its
 * stops in the to city's whole prefecture (鹤庆, 祥云, 漾濞 for 大理), so code keeps only stations named
 * after the two cities (丽江, 大理; 上海虹桥 for 上海), and it has no departure window, so code applies
 * the leg's. Beyond the presale window it says 暂无数据 (error_code 10): "none", as with 12306.
 */
export type VariflightRailDependencies = {
  readonly enabled: () => boolean;
  readonly tools: () => Promise<FlightToolCaller>;
  readonly budget: DailyBudget;
  readonly now: () => Date;
};

const number = z.union([z.number(), z.string().regex(/^\d+(?:\.\d+)?$/u).transform(Number)]);
const rowSchema = z.object({
  trainNumber: z.string().min(1),
  fromStation: z.string().min(1),
  toStation: z.string().min(1),
  fromTime: z.string().regex(/^\d{2}:\d{2}$/u),
  toTime: z.string().regex(/^\d{2}:\d{2}$/u),
  useTime: number,
  seatLists: z.array(z.object({ seatName: z.string().min(1), seatPrice: number.nullable().optional(), ticketLeft: number.nullable().optional() })).optional(),
});
const answerSchema = z.object({
  code: z.number(),
  data: z.union([
    z.object({ code: z.number(), data: z.array(z.unknown()).nullable().optional() }),
    z.object({ error_code: z.number(), error: z.string().optional() }),
  ]),
});

const minutesOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const clockOf = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const beijingDate = (now: Date) => new Date(now.getTime() + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);

/** Whether a station is the city's own: named after it (上海虹桥 for 上海), not a county in its prefecture. */
export function stationOfCity(station: string, city: string): boolean {
  return station === city || station.startsWith(city);
}

/** One Tripmatch row as Meri keeps it, or null when it is not between the two cities or not in the window. */
export function variflightTrainOf(row: z.infer<typeof rowSchema>, search: TrainSearch): TrainOption | null {
  if (!stationOfCity(row.fromStation, search.fromCity) || !stationOfCity(row.toStation, search.toCity)) return null;
  const departs = minutesOf(row.fromTime);
  if (departs < search.earliestHour * 60 || departs >= search.latestHour * 60) return null;
  const durationMinutes = Math.round(row.useTime);
  if (durationMinutes <= 0) return null;
  const arrival = departs + durationMinutes;
  return {
    code: row.trainNumber,
    from: row.fromStation,
    to: row.toStation,
    departs: row.fromTime,
    arrives: clockOf(arrival),
    arriveDayOffset: Math.floor(arrival / (24 * 60)),
    durationMinutes,
    // Seats as 12306 words them: a number left, or 无 for none.
    seats: (row.seatLists ?? []).map(({ seatName, seatPrice, ticketLeft }) => ({
      name: seatName,
      price: typeof seatPrice === "number" ? seatPrice : null,
      left: typeof ticketLeft === "number" ? (ticketLeft > 0 ? String(ticketLeft) : "无") : "无",
    })),
  };
}

/** Tripmatch's answer read as Meri's rail answer for this search. */
export function readVariflightTrains(text: string, search: TrainSearch, query: { date: string; reference: boolean }, now: Date): RailAnswer {
  const answer = answerSchema.parse(parseLabelledLiteral(text));
  if ("error_code" in answer.data) return { status: "none", queriedDate: query.date, reference: query.reference };
  const rows = (answer.data.data ?? []).flatMap((row) => {
    const parsed = rowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  const options = rows.flatMap((row) => variflightTrainOf(row, search) ?? [])
    // One row a train: Tripmatch lists a train once per stop it makes in the prefecture.
    .filter((option, index, all) => all.findIndex(({ code, to }) => code === option.code && to === option.to) === index)
    .sort((left, right) => left.departs.localeCompare(right.departs));
  if (options.length === 0) return { status: "none", queriedDate: query.date, reference: query.reference };
  return { status: "found", trains: { queriedDate: query.date, reference: query.reference, checkedAt: now.toISOString(), options } };
}

/** The rail port on VariFlight's Tripmatch: one paid call a search, through VariFlight's money budget. */
export function createVariflightRail(deps: VariflightRailDependencies): (search: TrainSearch) => Promise<RailAnswer> {
  return async (search) => {
    if (!deps.enabled()) return { status: "unavailable", reason: "disabled" };
    const query = railQueryDate(search.date, beijingDate(deps.now()));
    if (!query) return { status: "unavailable", reason: "past_date" };
    try {
      const tools = await deps.tools();
      const asked = await deps.budget.run(variflightFen.searchTrainTickets, () => tools("searchTrainTickets", {
        from_city: search.fromCity, to_city: search.toCity, date: query.date,
      }));
      if (!asked.ok) return { status: "unavailable", reason: asked.reason };
      return readVariflightTrains(asked.value, search, query, deps.now());
    } catch (error) {
      deps.budget.pause();
      logger.warn({ provider: "VariFlight", from: search.fromCity, to: search.toCity, error: error instanceof Error ? error.message.slice(0, 120) : "unknown" },
        "VariFlight train lookup failed; paused with no retry");
      return { status: "unavailable", reason: "failed" };
    }
  };
}
