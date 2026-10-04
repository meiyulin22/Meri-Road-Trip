import { randomUUID } from "node:crypto";

import type { Locale } from "../src/domain/locale/locale";
import type { TripState } from "../src/domain/trip-state/trip-state";
import type { StructuredOutputConversationMessage } from "../src/platform/llm/kimi-client";
import { interpretWorkspaceConversation } from "@/capabilities/conversation/workspace-conversation-interpreter";

/**
 * Every unit test mocks the model, so a prompt rewrite goes green while Meri's
 * actual behaviour changes. These turns are the ones the destination rules decide:
 * whether an open destination still gets cards, whether a settled one stops getting them, and whether the model keeps off the two sentences it must not write
 * — the itinerary, and whether a plan is ready.
 *
 * Each case says what to look for, so two runs can be compared by eye. A case runs
 * with the Chinese interface unless it names another locale: cases 20–27 check that
 * the reply starts in the language chosen on the home page and that following a user
 * who writes in the other one stays the model's call.
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
    state: "known", source: "user",
    areas: [{ province: "海南省", places: [] }],
  },
};

/** A place inside the province settled: 「去哪」 now has an answer. */
const placeSettled: TripState = {
  ...empty,
  destination: {
    state: "known", source: "user",
    areas: [{ province: "海南省", places: [{ name: "三亚市", spots: [] }] }],
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
    expect: 'destinationEdit set on destination, presentationIntent none; reply must NOT claim it was added — the application says that',
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
    expect: 'none; may describe the season in general (dry/warm), but NO temperatures or other numbers; suggests checking a forecast',
    tripState: placeSettled, message: "三亚十一月天气怎么样？", conversationHistory: [],
  },
  "11": {
    expect: 'destinationEdit set with broadRegion and 2–3 concrete places + none',
    tripState: empty, message: "我想去潮汕", conversationHistory: [],
  },
  "12": {
    expect: 'destination update keeping both provinces, presentationIntent none',
    tripState: empty, message: "我想去云南和四川", conversationHistory: [],
  },
  "13": {
    expect: 'destination update on 云南 AND destination_recommendations in the same turn — the province narrows the cards instead of closing them',
    tripState: empty, message: "我想去云南，想爬山", conversationHistory: [],
  },
  "14": {
    expect: 'destination_recommendations at once; reply names no place, lists nothing, asks no question; no China-scope line',
    tripState: empty, message: "你给我推荐一些地方吧，我想安静一点的地方", conversationHistory: [],
  },
  "15": {
    expect: 'destination_recommendations_elsewhere; reply names no place and asks no question; no China-scope line',
    tripState: placeSettled, message: "想让你推荐下别的地方 别的省份", conversationHistory: [],
  },
  "16": {
    expect: 'none + destinationEdit none; briefly says Meri plans trips within China only, without 国内/国外',
    tripState: empty, message: "我想去纽约", conversationHistory: [],
  },
  "17": {
    expect: 'destination_recommendations — an explicit request is enough, even with no preference; no question about dates first',
    tripState: empty, message: "你推荐一下呗", conversationHistory: [],
  },
  "18": {
    expect: 'destinationEdit add with places ["大莲"] exactly as typed — never corrected to 大连 or 大理',
    tripState: provinceOnly, message: "我还想去大莲", conversationHistory: [],
  },
  "19": {
    expect: 'destination_recommendations on the first ask — describing the kind of place is a preference; must NOT ask for origin instead',
    tripState: empty, message: "我想安静一点的地方", conversationHistory: [],
  },
  "20": {
    expect: 'EN interface: destination_recommendations; reply in English, names no place, asks no question',
    locale: "en", tripState: empty, message: "I love hiking and high mountains", conversationHistory: [],
  },
  "21": {
    expect: 'EN interface: none; reply in English; seasonal character only, NO temperatures or numbers; suggests a forecast',
    locale: "en", tripState: placeSettled, message: "What's the weather like in Sanya in November?", conversationHistory: [],
  },
  "22": {
    expect: 'EN interface: none; reply in English; must NOT say whether the Journey is ready to generate',
    locale: "en", tripState: everythingKnown, message: "Everything is set, can you generate the plan now?", conversationHistory: [],
  },
  "23": {
    expect: 'EN interface, user writes Chinese: destinationEdit set ["海南"] as typed, none; reply in Chinese or English — the model\'s call, either is right',
    locale: "en", tripState: empty, message: "我想去海南", conversationHistory: [],
  },
  "24": {
    expect: 'ZH interface, user writes English: destination_recommendations; reply in English or Chinese — the model\'s call; names no place',
    tripState: empty, message: "Can you recommend some quiet places?", conversationHistory: [],
  },
  "25": {
    expect: 'EN interface: destinationEdit set with the Chinese names ["云南","四川"], none; reply in English',
    locale: "en", tripState: empty, message: "I want to go to Yunnan and Sichuan", conversationHistory: [],
  },
  "26": {
    expect: 'EN interface: destinationEdit add ["丽江"] (Chinese name), none; reply in English and does not say it was added',
    locale: "en", tripState: provinceOnly, message: "I'd also like to visit Lijiang", conversationHistory: [],
  },
  "27": {
    expect: 'EN interface: destinationEdit set ["玉龙雪山"] — the attraction itself in Chinese, not 丽江; none',
    locale: "en", tripState: empty, message: "I want to see Jade Dragon Snow Mountain", conversationHistory: [],
  },
} as const satisfies Record<string, {
  readonly expect: string; readonly locale?: Locale; readonly tripState: TripState; readonly message: string;
  readonly conversationHistory: readonly StructuredOutputConversationMessage[];
}>;

async function run(id: keyof typeof cases): Promise<void> {
  const testCase: { readonly locale?: Locale } & (typeof cases)[typeof id] = cases[id];
  const { expect, tripState, message, conversationHistory } = testCase;
  const locale = testCase.locale ?? "zh";
  const interpretation = await interpretWorkspaceConversation({
    message,
    conversationHistory,
    tripState,
    requestId: randomUUID(),
    referenceDate: new Date().toISOString().slice(0, 10),
    timezone: "Asia/Shanghai",
    locale,
  });
  process.stdout.write(`\n=== ${id} [${locale}] 「${message}」\n`);
  process.stdout.write(`expect: ${expect}\n`);
  process.stdout.write(`presentationIntent: ${interpretation.presentationIntent}\n`);
  process.stdout.write(`changes: ${JSON.stringify(interpretation.changes)}\n`);
  process.stdout.write(`destinationEdit: ${JSON.stringify(interpretation.destinationEdit)}\n`);
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
