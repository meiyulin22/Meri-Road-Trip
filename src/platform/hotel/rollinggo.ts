import { join } from "node:path";

import type { MCPClient } from "@mastra/mcp";
import { z } from "zod";

import type { HotelDetail, HotelOption } from "@/domain/plan/stays";
import { createDailyBudget, type DailyBudget } from "@/platform/http/daily-budget";
import { logger } from "@/platform/observability/logger";
import { providerLimits } from "@/platform/provider-limits";

import { hotelPhotoHost } from "./hotel-photos";

/**
 * RollingGo's hotel MCP (agreed 2026-11-20), query only: our key lists four tools and none books.
 * It says free with no call cap, but "目前阶段免费使用" and its terms link is empty, so it stays
 * behind this adapter, switched on with HOTEL_PROVIDER=rollinggo, capped by our own
 * ROLLINGGO_MAX_CALLS_PER_DAY, one call a second, and paused ten minutes after a failure.
 * Booking links carry its partner tracking and are never kept (no commission, merlin).
 */
export const hotelLimits = { intervalMs: 1_000, dailyUnits: providerLimits.rollinggoCallsPerDay, pauseMs: 10 * 60 * 1_000 } as const;
const endpoint = "https://mcp.rollinggo.cn/mcp";

export const sharedHotelBudget = createDailyBudget(hotelLimits, {
  file: join(process.cwd(), ".cache", "rollinggo-calls.json"),
  label: { provider: "RollingGo", units: (count) => `${count} calls` },
});

export type HotelToolCaller = (name: string, input: Record<string, unknown>) => Promise<unknown>;

export function hotelEnabled(): boolean {
  return process.env.HOTEL_PROVIDER?.trim() === "rollinggo" && Boolean(process.env.ROLLINGGO_API_KEY?.trim());
}

let starting: Promise<HotelToolCaller> | null = null;
let client: MCPClient | null = null;

/** Connected the first time a hotel is looked up; the key goes in the Authorization header, never a log. */
export async function rollinggoTools(): Promise<HotelToolCaller> {
  if (starting) return starting;
  starting = (async () => {
    const key = process.env.ROLLINGGO_API_KEY?.trim().replace(/^["']|["']$/gu, "") ?? "";
    const { MCPClient: Client } = await import("@mastra/mcp");
    client = new Client({ id: "meri-hotel", servers: { hotel: { url: new URL(endpoint), requestInit: { headers: { Authorization: `Bearer ${key}` } }, timeout: 30_000 } } });
    process.once("exit", () => { void client?.disconnect(); });
    const tools = (await client.listToolsets()).hotel ?? {};
    return async (name, input) => {
      const tool = tools[name];
      if (!tool?.execute) throw new Error(`RollingGo tool ${name} is not available.`);
      return tool.execute(input, {} as never);
    };
  })();
  starting.catch(() => {
    starting = null;
    void client?.disconnect();
    client = null;
  });
  return starting;
}

/** The tool's answer as an object: the structured result, or its text content read as JSON. */
function answerOf(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const content = (raw as { content?: { text?: string }[] }).content;
  if (Array.isArray(content) && typeof content[0]?.text === "string") {
    try {
      return JSON.parse(content[0].text);
    } catch {
      return null;
    }
  }
  return raw;
}

const httpsUrl = z.string().refine((url) => {
  try {
    return new URL(url).protocol === "https:" && new URL(url).hostname === hotelPhotoHost;
  } catch {
    return false;
  }
});
const loose = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

const hotelSchema = z.object({
  hotelId: z.number().int().positive(),
  name: z.string().min(1),
  brand: z.string().nullable().optional(),
  address: z.string().default(""),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  distanceInMeters: z.number().nonnegative().nullable().optional(),
  starRating: z.number().min(0).max(5).nullable().optional(),
  price: z.object({ hasPrice: z.boolean(), currency: z.string().nullable().optional(), lowestPrice: z.number().nullable().optional() }).nullable().optional(),
  imageUrl: z.unknown().optional(),
  tags: z.unknown().optional(),
  hotelAmenities: z.unknown().optional(),
});
const searchSchema = z.object({ success: z.boolean(), code: z.number().optional(), hotelInformationList: z.array(z.unknown()).nullable().optional() });

/** searchHotels' answer as hotels, each checked on its own; null when the answer is not a search result. */
export function parseHotelSearch(raw: unknown): HotelOption[] | null {
  const parsed = searchSchema.safeParse(answerOf(raw));
  if (!parsed.success || !parsed.data.success) return null;
  return (parsed.data.hotelInformationList ?? []).flatMap((item) => {
    const hotel = hotelSchema.safeParse(item);
    if (!hotel.success) return [];
    const { data } = hotel;
    const image = httpsUrl.safeParse(data.imageUrl);
    const price = data.price?.hasPrice && typeof data.price.lowestPrice === "number" && data.price.lowestPrice > 0
      ? { amount: Math.round(data.price.lowestPrice), currency: data.price.currency ?? "CNY" } : null;
    return [{
      id: data.hotelId,
      name: data.name.trim(),
      brand: data.brand?.trim() || null,
      address: data.address.trim(),
      point: { longitude: data.longitude, latitude: data.latitude },
      star: typeof data.starRating === "number" && data.starRating > 0 ? data.starRating : null,
      distanceM: typeof data.distanceInMeters === "number" ? Math.round(data.distanceInMeters) : null,
      pricePerNight: price,
      image: image.success ? image.data : null,
      tags: loose(data.tags).slice(0, 8),
      amenities: loose(data.hotelAmenities).slice(0, 12),
    }];
  });
}

const staticSchema = z.object({
  success: z.boolean(),
  hotelStaticInfo: z.object({
    basic: z.object({ phone: z.string().nullable().optional() }).partial().optional(),
    location: z.object({ businessDistrict: z.string().nullable().optional() }).partial().optional(),
    policy: z.object({ checkinFrom: z.string().nullable().optional(), checkoutTo: z.string().nullable().optional() }).partial().optional(),
    facilities: z.unknown().optional(),
    images: z.array(z.object({ url: z.unknown() })).optional(),
  }),
});

const hhmm = (value: string | null | undefined) => (value && /^\d{2}:\d{2}/u.test(value) ? value.slice(0, 5) : null);

/** getHotelStaticInfo's answer as what the plan shows; null when it is not one. */
export function parseHotelDetail(raw: unknown): HotelDetail | null {
  const parsed = staticSchema.safeParse(answerOf(raw));
  if (!parsed.success || !parsed.data.success) return null;
  const info = parsed.data.hotelStaticInfo;
  return {
    phone: info.basic?.phone?.trim() || null,
    district: info.location?.businessDistrict?.trim() || null,
    checkIn: hhmm(info.policy?.checkinFrom),
    checkOut: hhmm(info.policy?.checkoutTo),
    facilities: loose(info.facilities).slice(0, 10),
    images: (info.images ?? []).flatMap(({ url }) => {
      const checked = httpsUrl.safeParse(url);
      return checked.success ? [checked.data] : [];
    }).slice(0, 5),
  };
}

export type HotelSearch = {
  /** The traveller's request in words, which the tool asks for. */
  readonly query: string;
  readonly place: string;
  readonly placeType: "景点" | "城市";
  readonly checkIn: string;
  readonly nights: number;
};

export type HotelSearchAnswer =
  | { readonly status: "found"; readonly hotels: readonly HotelOption[] }
  | { readonly status: "unavailable"; readonly reason: "disabled" | "daily_limit" | "paused" | "failed" };

export type HotelDependencies = {
  readonly enabled: () => boolean;
  readonly tools: () => Promise<HotelToolCaller>;
  readonly budget: DailyBudget;
};

/** How far from a sight hotels are searched; a city search has no radius. */
const nearSpotMeters = 3_000;
const searchSize = 10;

/** The hotel port: a search near a place, and one hotel's own details. Never throws, never retries. */
export function createRollingGoHotels(deps: HotelDependencies) {
  async function call(name: string, input: Record<string, unknown>): Promise<{ ok: true; raw: unknown } | { ok: false; reason: "disabled" | "daily_limit" | "paused" | "failed" }> {
    if (!deps.enabled()) return { ok: false, reason: "disabled" };
    try {
      const tools = await deps.tools();
      const asked = await deps.budget.run(1, () => tools(name, input));
      return asked.ok ? { ok: true, raw: asked.value } : { ok: false, reason: asked.reason };
    } catch (error) {
      deps.budget.pause();
      logger.warn({ provider: "RollingGo", tool: name, error: error instanceof Error ? error.name : "unknown" }, "RollingGo lookup failed; paused with no retry");
      return { ok: false, reason: "failed" };
    }
  }

  return {
    async search(search: HotelSearch): Promise<HotelSearchAnswer> {
      const asked = await call("searchHotels", {
        originQuery: search.query,
        place: search.place,
        placeType: search.placeType,
        checkInParam: { checkInDate: search.checkIn, stayNights: Math.min(Math.max(search.nights, 1), 28), adultCount: 2 },
        ...(search.placeType === "景点" ? { filterOptions: { distanceInMeter: nearSpotMeters } } : {}),
        size: searchSize,
      });
      if (!asked.ok) return { status: "unavailable", reason: asked.reason };
      const hotels = parseHotelSearch(asked.raw);
      if (hotels === null) {
        deps.budget.pause();
        logger.warn({ provider: "RollingGo", place: search.place }, "RollingGo search answer was not a hotel list; paused with no retry");
        return { status: "unavailable", reason: "failed" };
      }
      return { status: "found", hotels };
    },
    async detail(hotelId: number): Promise<HotelDetail | null> {
      const asked = await call("getHotelStaticInfo", { hotelId, categories: ["basic", "location", "policy", "facilities", "images"] });
      return asked.ok ? parseHotelDetail(asked.raw) : null;
    },
  };
}

export type RollingGoHotels = ReturnType<typeof createRollingGoHotels>;
