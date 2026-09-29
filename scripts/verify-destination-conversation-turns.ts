import { randomUUID } from "node:crypto";

import type { TripState } from "../src/domain/trip-state/trip-state";
import { interpretWorkspaceConversation } from "@/capabilities/conversation/workspace-conversation-interpreter";

/**
 * Every unit test mocks the model, so a prompt rewrite goes green while Meri's
 * actual behaviour changes. These twelve turns are the ones the destination rules
 * decide: whether an open destination still gets cards, whether a settled one stops
 * getting them, and whether the model keeps off the two sentences it must not write
 * — the itinerary, and whether a plan is ready.
 *
 * Each case says what to look for, so two runs can be compared by eye.
 */
const empty: TripState = {
  name: { state: "known", value: "假期旅行", source: "user" },
  origin: { state: "missing" },
  destination: { state: "missing" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

/** 「我想去海南」 saved: a province, with nobody having chosen a place inside it yet. */
const provinceOnly: TripState = {
  ...empty,
  destination: {
    state: "approximate", value: "海南省", source: "user",
    areas: [{ province: "海南省", places: [] }],
  },
};

/** A place inside the province settled: 「去哪」 now has an answer. */
const placeSettled: TripState = {
  ...empty,
  destination: {
    state: "known", value: "海南省 三亚市", source: "user",
    areas: [{ province: "海南省", places: ["三亚市"] }],
  },
};

const everythingKnown: TripState = {
  ...placeSettled,
  origin: { state: "known", value: "上海", source: "user" },
  startDate: { state: "known", value: "2026-11-20", source: "user" },
  duration: { state: "known", value: "5天", source: "user" },
};

const cases = {
  "1": {
    expect: 'destination_recommendations — preferences with no destination',
    tripState: empty, message: "我喜欢徒步，喜欢高山", conversationHistory: [],
  },
  "2": {
    expect: 'destination_recommendations — preferences with no destination',
    tripState: empty, message: "想要海边、轻松一点、适合周末", conversationHistory: [],
  },
  "3": {
    expect: 'none + one question about the experience — no usable preference',
    tripState: empty, message: "我想出去玩", conversationHistory: [],
  },
  "4": {
    expect: 'destination_recommendations, staying inside 海南省 — THE 海南 TRAP; the old prompt said none here',
    tripState: provinceOnly, message: "想看海边小城", conversationHistory: [
      { role: "user" as const, content: "我想去海南" },
      { role: "assistant" as const, content: "海南记下了。" },
    ],
  },
  "5": {
    expect: 'trip_state_update on destination, presentationIntent none',
    tripState: empty, message: "我想去海南", conversationHistory: [],
  },
  "6": {
    expect: 'none — a place is settled, so help with that Journey instead of offering alternatives',
    tripState: placeSettled, message: "想找个人少的地方", conversationHistory: [],
  },
  "7": {
    expect: 'none, no itinerary, no day-by-day; asks for origin first. Must NOT say the Journey is or is not ready',
    tripState: placeSettled, message: "帮我安排一下行程吧", conversationHistory: [],
  },
  "8": {
    expect: 'none; must NOT answer whether it is ready to generate — the application owns that sentence',
    tripState: everythingKnown, message: "都定好了，可以生成计划了吗？", conversationHistory: [],
  },
  "9": {
    expect: 'none — short, warm, one question leading back to the trip; no lecture',
    tripState: empty, message: "今天天气不错", conversationHistory: [],
  },
  "10": {
    expect: 'question and none; says research is not connected rather than guessing weather',
    tripState: placeSettled, message: "三亚十一月天气怎么样？", conversationHistory: [],
  },
  "11": {
    expect: 'destination update + destinationDisambiguation with 2–3 concrete places + none',
    tripState: empty, message: "我想去潮汕", conversationHistory: [],
  },
  "12": {
    expect: 'destination update keeping both provinces, presentationIntent none',
    tripState: empty, message: "我想去云南和四川", conversationHistory: [],
  },
} as const;

async function run(id: keyof typeof cases): Promise<void> {
  const { expect, tripState, message, conversationHistory } = cases[id];
  const interpretation = await interpretWorkspaceConversation({
    message,
    conversationHistory,
    tripState,
    requestId: randomUUID(),
    referenceDate: new Date().toISOString().slice(0, 10),
    timezone: "Asia/Shanghai",
  });
  process.stdout.write(`\n=== ${id} 「${message}」\n`);
  process.stdout.write(`expect: ${expect}\n`);
  process.stdout.write(`intent: ${interpretation.intent} / presentationIntent: ${interpretation.presentationIntent}\n`);
  process.stdout.write(`changes: ${JSON.stringify(interpretation.changes)}\n`);
  if (interpretation.destinationDisambiguation) {
    process.stdout.write(`disambiguation: ${JSON.stringify(interpretation.destinationDisambiguation)}\n`);
  }
  process.stdout.write(`reply: ${interpretation.reply}\n`);
}

function isCaseId(value: string | undefined): value is keyof typeof cases {
  return value !== undefined && Object.hasOwn(cases, value);
}

async function main(): Promise<void> {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    process.stderr.write("TLS certificate verification is disabled; enable it before running this check.\n");
    process.exitCode = 1;
    return;
  }

  const selected = process.argv[2];
  if (selected !== "all" && !isCaseId(selected)) {
    process.stderr.write(`Usage: NODE_TLS_REJECT_UNAUTHORIZED=1 node --env-file=.env.local --import tsx scripts/verify-destination-conversation-turns.ts <all|${Object.keys(cases).join("|")}>\n`);
    process.exitCode = 1;
    return;
  }

  for (const id of selected === "all" ? (Object.keys(cases) as (keyof typeof cases)[]) : [selected]) {
    await run(id);
  }
}

void main().catch(() => {
  // The normal server logger has details. Do not print errors that may contain URLs or keys.
  process.stderr.write("Destination conversation verification failed.\n");
  process.exitCode = 1;
});
