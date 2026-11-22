import { join } from "node:path";

import type { MCPClient } from "@mastra/mcp";
import { z } from "zod";

import type { FlightOption, LegFlights } from "@/domain/plan/transfer-legs";
import { createDailyBudget, type DailyBudget } from "@/platform/http/daily-budget";
import { logger } from "@/platform/observability/logger";
import { paidCallsEnabled, providerLimits } from "@/platform/provider-limits";

import { parseLabelledLiteral } from "./python-literal";

/**
 * VariFlight costs money per call, prepaid (2026-11-18), so the budget counts money in fen (¥0.01,
 * one VariFlight credit) since 1.2113: one call at a time, at most ¥20 a Beijing day (by default;
 * VARIFLIGHT_MAX_YUAN_PER_DAY) across
 * restarts, and paused half an hour after any failure. An empty balance answers 403 and stops
 * flights until the next day.
 */
export const flightLimits = { intervalMs: 1_000, dailyUnits: providerLimits.variflightFenPerDay, pauseMs: 30 * 60 * 1_000 } as const;
/** What each tool Meri calls costs, in fen, from VariFlight's price list. */
export const variflightFen = { getFlightPriceByCities: 25, getFlightTransferInfo: 25, searchTrainTickets: 25 } as const;
/** Fen as the logs and the agent read it: ¥0.25. */
export const yuan = (fen: number) => `¥${(fen / 100).toFixed(2)}`;
const emptyBalancePauseMs = 12 * 60 * 60 * 1_000;
const endpoint = "https://ai.variflight.com/servers/aviation/mcp";

// A new file: the 1.2111 one counted calls, not fen.
export const sharedFlightBudget = createDailyBudget(flightLimits, {
  file: join(process.cwd(), ".cache", "flight-credits.json"),
  label: { provider: "VariFlight", units: yuan },
});

/** A VariFlight tool called by name; the answer is its text, and a tool error throws. */
export type FlightToolCaller = (name: string, input: Record<string, unknown>) => Promise<string>;

/** Whether this server may ask VariFlight: only with FLIGHT_PROVIDER=variflight and a key (1.2111). */
export function flightEnabled(): boolean {
  // PAID_CALLS_ENABLED=false switches flights off with every other paid call (step 2).
  return process.env.FLIGHT_PROVIDER?.trim() === "variflight" && Boolean(process.env.VARIFLIGHT_API_KEY?.trim()) && paidCallsEnabled();
}

/** VariFlight's two remote MCP servers: flights on Aviation, trains on Tripmatch (2026-11-22). Same key. */
const servers = {
  aviation: endpoint,
  tripmatch: "https://ai.variflight.com/servers/tripmatch/mcp",
} as const;
const starting = new Map<keyof typeof servers, Promise<FlightToolCaller>>();
const clients = new Map<keyof typeof servers, MCPClient>();

/**
 * One of VariFlight's remote MCP servers, connected the first time it is needed (1.2111; Tripmatch for
 * trains since 2026-11-22). The key goes in the X-API-Key header and never into a log. Listing tools
 * is free; only tool calls cost.
 */
function connect(server: keyof typeof servers): Promise<FlightToolCaller> {
  const running = starting.get(server);
  if (running) return running;
  const started = (async () => {
    const key = process.env.VARIFLIGHT_API_KEY?.trim().replace(/^["']|["']$/gu, "") ?? "";
    const { MCPClient: Client } = await import("@mastra/mcp");
    const client = new Client({ id: `meri-${server}`, servers: { [server]: { url: new URL(servers[server]), requestInit: { headers: { "X-API-Key": key } }, timeout: 30_000 } } });
    clients.set(server, client);
    process.once("exit", () => { void client.disconnect(); });
    const tools = (await client.listToolsets())[server] ?? {};
    return async (name: string, input: Record<string, unknown>) => {
      const tool = tools[name];
      if (!tool?.execute) throw new Error(`VariFlight tool ${name} is not available.`);
      const result = await tool.execute(input, {} as never) as { content?: { text?: string }[] } | null;
      return (result?.content ?? []).map(({ text }) => text ?? "").join("\n");
    };
  })();
  starting.set(server, started);
  started.catch(() => {
    starting.delete(server);
    void clients.get(server)?.disconnect();
    clients.delete(server);
  });
  return started;
}

/** VariFlight's Aviation server: fares, change cities (1.2111). */
export function variflightTools(): Promise<FlightToolCaller> {
  return connect("aviation");
}

/** VariFlight's Tripmatch server: train tickets (2026-11-22). */
export function variflightTrainTools(): Promise<FlightToolCaller> {
  return connect("tripmatch");
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
      const asked = await deps.budget.run(variflightFen.getFlightPriceByCities, () => tools("getFlightPriceByCities", {
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
      return { status: "unavailable", reason: failed(deps, search, error) };
    }
  };
}

/** A failed call pauses VariFlight, an empty balance until the next day; no retry. */
function failed(deps: FlightDependencies, search: FlightSearch, error: unknown): "balance" | "failed" {
  const message = error instanceof Error ? error.message : "";
  const empty = /\b403\b|balance|余额/u.test(message);
  deps.budget.pause(empty ? emptyBalancePauseMs : undefined);
  logger.warn({ from: search.fromCode, to: search.toCode, error: message.slice(0, 120) },
    empty ? "VariFlight balance used up; flights paused until tomorrow" : "VariFlight lookup failed; paused with no retry");
  return empty ? "balance" : "failed";
}

/** A city a connection changes in, as VariFlight names it: CTU, 成都. */
export type FlightHub = { readonly code: string; readonly city: string };

export type HubAnswer =
  | { readonly status: "found"; readonly hubs: readonly FlightHub[] }
  | { readonly status: "none" }
  | { readonly status: "bad_code" }
  | { readonly status: "unavailable"; readonly reason: "disabled" | "daily_limit" | "paused" | "failed" | "balance" };

// The fields Meri reads from getFlightTransferInfo (probe 2026-11-18, SHA → DIG). It has no fares,
// and it repeats the same pair for the next days, so only the hubs of the day asked are kept.
const segmentSchema = z.object({
  DepTime: z.string(),
  DepCityZh: z.string(),
  ArrCityZh: z.string(),
  ArrCityCode: z.string().regex(/^[A-Z]{3}$/u),
});
const transferAnswerSchema = z.object({ code: z.number(), data: z.array(z.unknown()).nullable().optional() });
/** Hubs worth offering the agent; each costs it two fare searches to try. */
const maxHubs = 3;

/**
 * Where VariFlight's connections between two cities change (1.2113), for the agent to try with
 * fares when the hub it chose did not join: getFlightTransferInfo has no fares of its own, so only
 * the change cities are read. A connection counts when it has two flights, leaves the leg's start
 * city on the leg's day and reaches its end city.
 */
export function createVariflightHubs(deps: FlightDependencies): (search: FlightSearch) => Promise<HubAnswer> {
  return async (search) => {
    if (!deps.enabled()) return { status: "unavailable", reason: "disabled" };
    if (!/^[A-Z]{3}$/u.test(search.fromCode) || !/^[A-Z]{3}$/u.test(search.toCode) || search.fromCode === search.toCode) {
      return { status: "bad_code" };
    }
    try {
      const tools = await deps.tools();
      const asked = await deps.budget.run(variflightFen.getFlightTransferInfo, () => tools("getFlightTransferInfo", {
        depcity: search.fromCode, arrcity: search.toCode, depdate: search.date,
      }));
      if (!asked.ok) return { status: "unavailable", reason: asked.reason };
      const answer = transferAnswerSchema.parse(parseLabelledLiteral(asked.value));
      const hubs = (answer.data ?? []).flatMap((itinerary): FlightHub[] => {
        const parsed = z.array(segmentSchema).length(2).safeParse(itinerary);
        if (!parsed.success) return [];
        const [first, second] = parsed.data;
        if (!first.DepTime.startsWith(search.date)) return [];
        if (!first.DepCityZh.startsWith(search.fromCity) || !second.ArrCityZh.startsWith(search.toCity)) return [];
        return [{ code: first.ArrCityCode, city: first.ArrCityZh }];
      }).filter((hub, at, all) => all.findIndex(({ code }) => code === hub.code) === at).slice(0, maxHubs);
      return hubs.length > 0 ? { status: "found", hubs } : { status: "none" };
    } catch (error) {
      return { status: "unavailable", reason: failed(deps, search, error) };
    }
  };
}
