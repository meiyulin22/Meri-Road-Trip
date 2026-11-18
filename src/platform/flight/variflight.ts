import { join } from "node:path";

import type { MCPClient } from "@mastra/mcp";
import { z } from "zod";

import type { FlightOption, LegFlights } from "@/domain/plan/transfer-legs";
import { createDailyBudget, type DailyBudget } from "@/platform/http/daily-budget";
import { logger } from "@/platform/observability/logger";

import { parseLabelledLiteral } from "./python-literal";

/**
 * VariFlight costs money per call (¥0.25 for a fare search, prepaid, 2026-11-18), so it is asked
 * one call at a time, at most 40 a Beijing day across restarts, and paused half an hour after any
 * failure. An empty balance answers 403 and stops flights until the next day.
 */
export const flightLimits = { intervalMs: 1_000, dailyRequests: 40, pauseMs: 30 * 60 * 1_000 } as const;
const emptyBalancePauseMs = 12 * 60 * 60 * 1_000;
const endpoint = "https://ai.variflight.com/servers/aviation/mcp";

export const sharedFlightBudget = createDailyBudget(flightLimits, { file: join(process.cwd(), ".cache", "flight-calls.json") });

/** A VariFlight tool called by name; the answer is its text, and a tool error throws. */
export type FlightToolCaller = (name: string, input: Record<string, unknown>) => Promise<string>;

/** Whether this server may ask VariFlight: only with FLIGHT_PROVIDER=variflight and a key (1.2111). */
export function flightEnabled(): boolean {
  return process.env.FLIGHT_PROVIDER?.trim() === "variflight" && Boolean(process.env.VARIFLIGHT_API_KEY?.trim());
}

let starting: Promise<FlightToolCaller> | null = null;
let client: MCPClient | null = null;

/**
 * VariFlight's remote Aviation MCP, connected the first time a flight is looked up (1.2111). The key
 * goes in the X-API-Key header and never into a log. Listing tools is free; only tool calls cost.
 */
export async function variflightTools(): Promise<FlightToolCaller> {
  if (starting) return starting;
  starting = (async () => {
    const key = process.env.VARIFLIGHT_API_KEY?.trim().replace(/^["']|["']$/gu, "") ?? "";
    const { MCPClient: Client } = await import("@mastra/mcp");
    client = new Client({ id: "meri-flight", servers: { flight: { url: new URL(endpoint), requestInit: { headers: { "X-API-Key": key } }, timeout: 30_000 } } });
    process.once("exit", () => { void client?.disconnect(); });
    const tools = (await client.listToolsets()).flight ?? {};
    return async (name, input) => {
      const tool = tools[name];
      if (!tool?.execute) throw new Error(`VariFlight tool ${name} is not available.`);
      const result = await tool.execute(input, {} as never) as { content?: { text?: string }[] } | null;
      return (result?.content ?? []).map(({ text }) => text ?? "").join("\n");
    };
  })();
  starting.catch(() => {
    starting = null;
    void client?.disconnect();
    client = null;
  });
  return starting;
}

export type FlightSearch = {
  /** IATA city codes the agent gave: SHA, LJG. */
  readonly fromCode: string;
  readonly toCode: string;
  /** The cities the leg joins, short names as VariFlight writes them: 上海, 丽江. */
  readonly fromCity: string;
  readonly toCity: string;
  readonly date: string;
};

export type FlightAnswer =
  | { readonly status: "found"; readonly flights: LegFlights }
  | { readonly status: "none" }
  /** The codes named other cities than the leg's: the flights were dropped, and the agent told. */
  | { readonly status: "city_mismatch"; readonly got: { readonly from: string; readonly to: string } }
  | { readonly status: "bad_code" }
  | { readonly status: "unavailable"; readonly reason: "disabled" | "daily_limit" | "paused" | "failed" | "balance" };

export type FlightDependencies = {
  readonly enabled: () => boolean;
  readonly tools: () => Promise<FlightToolCaller>;
  readonly budget: DailyBudget;
  readonly now: () => Date;
};

const number = z.union([z.number(), z.string().regex(/^\d+(?:\.\d+)?$/u).transform(Number)]);
// The fields Meri reads from getFlightPriceByCities (probe 2026-11-18, SHA → LJG); others are ignored.
const flightSchema = z.object({
  flightno: z.string().min(2),
  depaptcname: z.string(),
  arraptcname: z.string(),
  depaptccity: z.string(),
  arraptccity: z.string(),
  flightdeptimeplandate: number,
  flightarrtimeplandate: number,
  depdate: z.string(),
  oilfee: number.or(z.literal("")).optional(),
  tax: number.or(z.literal("")).optional(),
  stopflag: number.optional(),
  stopcityname: z.string().optional(),
  shareflag: number.optional(),
  cabins: z.array(z.object({ classname: z.string(), price: number, seatnum: number.nullable().optional() })).min(1),
});
const answerSchema = z.object({ code: z.number(), data: z.array(z.unknown()).nullable().optional() });

const beijing = (seconds: number) => new Date(seconds * 1_000 + 8 * 60 * 60 * 1_000);
const clock = (date: Date) => date.toISOString().slice(11, 16);
const day = (date: Date) => date.toISOString().slice(0, 10);
const dayMs = 24 * 60 * 60 * 1_000;

/** One VariFlight row as Meri keeps it: Beijing times, the cheapest cabin, charges, stop and codeshare. */
export function flightOf(row: z.infer<typeof flightSchema>): FlightOption {
  const departs = beijing(row.flightdeptimeplandate);
  const arrives = beijing(row.flightarrtimeplandate);
  const cheapest = [...row.cabins].sort((left, right) => left.price - right.price)[0];
  const charges = (typeof row.oilfee === "number" ? row.oilfee : 0) + (typeof row.tax === "number" ? row.tax : 0);
  return {
    flightNo: row.flightno,
    fromAirport: row.depaptcname,
    toAirport: row.arraptcname,
    departs: clock(departs),
    arrives: clock(arrives),
    arriveDayOffset: Math.round((Date.parse(day(arrives)) - Date.parse(day(departs))) / dayMs),
    durationMinutes: Math.round((row.flightarrtimeplandate - row.flightdeptimeplandate) / 60),
    cabin: cheapest.classname,
    price: cheapest.price,
    seatsLeft: typeof cheapest.seatnum === "number" ? cheapest.seatnum : null,
    charges: charges > 0 ? charges : null,
    stopCity: row.stopflag ? row.stopcityname?.trim() || null : null,
    codeshare: row.shareflag === 1,
  };
}

/**
 * Flights between two cities on a day, from VariFlight's fare search, query only (1.2111). The agent
 * gives IATA codes; code checks every row's airport cities against the leg's cities and drops the
 * rest, so a wrong code costs one call but never shows a wrong flight. One call per search, through
 * the daily budget; a failure pauses VariFlight, an empty balance until the next day, no retry.
 */
export function createVariflightSearch(deps: FlightDependencies): (search: FlightSearch) => Promise<FlightAnswer> {
  return async (search) => {
    if (!deps.enabled()) return { status: "unavailable", reason: "disabled" };
    if (!/^[A-Z]{3}$/u.test(search.fromCode) || !/^[A-Z]{3}$/u.test(search.toCode) || search.fromCode === search.toCode) {
      return { status: "bad_code" };
    }
    try {
      const tools = await deps.tools();
      const asked = await deps.budget.run(1, () => tools("getFlightPriceByCities", {
        dep_city: search.fromCode, arr_city: search.toCode, dep_date: search.date,
      }));
      if (!asked.ok) return { status: "unavailable", reason: asked.reason };
      const answer = answerSchema.parse(parseLabelledLiteral(asked.value));
      const rows = (answer.data ?? []).flatMap((row) => {
        const parsed = flightSchema.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      });
      if (rows.length === 0) return { status: "none" };
      const ours = rows.filter((row) => row.depaptccity.startsWith(search.fromCity) && row.arraptccity.startsWith(search.toCity));
      if (ours.length === 0) return { status: "city_mismatch", got: { from: rows[0].depaptccity, to: rows[0].arraptccity } };
      const options = ours.map(flightOf).sort((left, right) => left.departs.localeCompare(right.departs));
      return { status: "found", flights: { queriedDate: search.date, checkedAt: deps.now().toISOString(), options } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const empty = /\b403\b|balance|余额/u.test(message);
      deps.budget.pause(empty ? emptyBalancePauseMs : undefined);
      logger.warn({ from: search.fromCode, to: search.toCode, error: message.slice(0, 120) },
        empty ? "VariFlight balance used up; flights paused until tomorrow" : "VariFlight lookup failed; paused with no retry");
      return { status: "unavailable", reason: empty ? "balance" : "failed" };
    }
  };
}
