import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import type { CityResearch, SpotCard } from "@/domain/plan/spot-card";
import type { TripState } from "@/domain/trip-state/trip-state";
import { createMoonshotChatModel } from "@/platform/llm/moonshot-chat-model";

/** Shared by the Plan Agent and plan workflow tests: a Yunnan trip, research cards and a scripted model. */
export function handoff(places: readonly string[], duration: TripState["duration"]): PlanHandoff {
  return {
    tripState: {
      name: { state: "missing" },
      origin: { state: "missing" },
      destination: { state: "known", source: "user", areas: [
        { province: "云南省", places: places.map((name) => ({ name, spots: [] })) },
      ] },
      startDate: { state: "missing" },
      endDate: { state: "missing" },
      duration,
      transportPreference: { state: "missing" },
    },
    referenceDate: "2026-11-12",
    timezone: "Asia/Shanghai",
    locale: "zh",
    preferenceStatus: "ready",
    preferences: [{ id: "p1", label: "少爬台阶", kind: "walking", pace: null, quote: "少走台阶", source: "conversation",
      messageId: "message", createdAt: "2026-11-12T08:00:00.000Z" }],
  };
}

export const sevenDays = { state: "known", value: "7天", source: "user" } as const;
export const fiveDays = { state: "known", value: "5天", source: "user" } as const;

export function card(name: string, requested = false, index = 0): SpotCard {
  return {
    id: JSON.stringify(["云南省", "丽江市", name]), province: "云南省", city: "丽江市", name, requested,
    location: { url: "https://example.com", title: name, publishedAt: null, checkedAt: "2026-11-12T08:00:00.000Z", quote: name + "位于丽江市" },
    opening: null, reservation: null, setting: null, walking: null, suggestedDuration: null,
    mapCheck: index % 2 === 0 ? { status: "located", district: "古城区" } : { status: "not_located" },
  };
}

// Requested spots come first, as research builds them; s1 is 黑龙潭.
const spotNames = ["黑龙潭", "玉龙雪山", "丽江古城", "蓝月谷", "束河古镇", "拉市海", "白沙古镇", "玉水寨"];
export const lijiang: CityResearch = {
  province: "云南省", city: "丽江市", status: "ready", searchCalls: 2,
  spots: spotNames.map((name, index) => card(name, index === 0, index)),
};

export const dali: CityResearch = {
  province: "云南省", city: "大理白族自治州", status: "ready", searchCalls: 2,
  spots: ["洱海", "崇圣寺三塔", "喜洲古镇"].map((name, index) => ({
    ...card(name, false, index), id: JSON.stringify(["云南省", "大理白族自治州", name]), city: "大理白族自治州",
    mapCheck: { status: "located" as const, district: "大理市" },
  })),
};

export const diqing: CityResearch = {
  province: "云南省", city: "迪庆藏族自治州", status: "ready", searchCalls: 2,
  spots: ["独克宗古城", "松赞林寺"].map((name, index) => ({
    ...card(name, false, index), id: JSON.stringify(["云南省", "迪庆藏族自治州", name]), city: "迪庆藏族自治州",
    mapCheck: { status: "located" as const, district: "香格里拉市" },
  })),
};

export type ProposedDay = { day: number; stops: { spotId: string; slot: string; anchor: null }[] };

export type RouteAnswer = { cities: { id: string; days: number; reason: string }[];
  days: { day: number; focus: string | null; theme: string | null }[]; omitted: { id: string; reason: string }[];
  question?: { text: string; options: { label: string; kind: string; pace?: string | null; leaveOut?: string | null }[] } | null };

function answer(content: unknown) {
  return Response.json({
    id: "chat-test", model: "test", created: 1,
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  });
}

/**
 * Answers the route calls with the given routes in turn (none left: the call fails), and
 * each day-selection call with the next set of days. Prompts are recorded per kind.
 */
export function modelAnswering(options: {
  days?: readonly ProposedDay[][];
  routes?: readonly RouteAnswer[];
  dayPrompts?: unknown[];
  routePrompts?: unknown[];
  routeSystems?: string[];
} = {}) {
  let call = 0;
  let routeCall = 0;
  return () => createMoonshotChatModel({
    apiKey: "test",
    baseUrl: "https://model.test/v1",
    model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        messages: { role: string; content: string }[]; response_format?: { json_schema?: { name?: string } };
      };
      const prompt = JSON.parse(request.messages.at(-1)?.content ?? "null");
      if (request.response_format?.json_schema?.name === "plan_route") {
        options.routePrompts?.push(prompt);
        options.routeSystems?.push(request.messages.find(({ role }) => role === "system")?.content ?? "");
        const route = options.routes?.[routeCall];
        routeCall += 1;
        return route ? answer(route) : new Response("unavailable", { status: 503 });
      }
      options.dayPrompts?.push(prompt);
      const days = options.days?.[call];
      call += 1;
      if (!days) return new Response("unavailable", { status: 503 });
      return answer({ days });
    },
  });
}

export function day(dayNumber: number, ...ids: string[]): ProposedDay {
  return { day: dayNumber, stops: ids.map((spotId) => ({ spotId, slot: "morning", anchor: null })) };
}

/** A transfer day's stops start after the arrival. */
export function afternoon(proposed: ProposedDay): ProposedDay {
  return { ...proposed, stops: proposed.stops.map((stop) => ({ ...stop, slot: "afternoon" })) };
}
