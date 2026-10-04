import type { Locale } from "@/domain/locale/locale";

/**
 * The sentences Meri writes itself, from code rather than the model, in each language
 * the visitor can choose on the landing page. That choice alone decides them: code
 * does not guess the language of what the user typed — following a user who writes
 * in the other language is the model's part of the reply.
 *
 * Besides the sentences, the two languages differ in how sentences meet (Chinese runs
 * them together, English puts a space between), how a list is joined and how a name
 * is quoted, so those live here too. Place names are data and are never translated.
 */
export interface MeriReplies {
  readonly join: (sentences: readonly string[]) => string;
  readonly list: (items: readonly string[]) => string;
  readonly quoted: (text: string) => string;

  readonly planReady: string;
  readonly planReadyInviting: (missing: readonly string[]) => string;
  readonly missing: { readonly origin: string; readonly startDate: string; readonly days: string };
  readonly captured: { readonly both: string; readonly dates: string; readonly duration: string };

  readonly added: (places: string) => string;
  readonly offered: (answering: string) => string;
  readonly removedConfirmable: string;
  readonly ambiguousRemoval: (names: string) => string;
  readonly notInDestination: (names: string) => string;
  readonly lookupFailedFor: (names: string) => string;
  readonly lookupFailed: string;
  readonly notFoundToo: (names: string) => string;
  readonly notFound: (names: string) => string;
  readonly searchAfterOffer: string;
  readonly searchAfterMiss: string;

  readonly leadInFallback: string;
  readonly destinationIs: (destination: string) => string;
  readonly pickedAdded: (places: string) => string;
  readonly reverifySaved: string;
  readonly alreadyInJourney: string;

  readonly recommendationsListed: string;
  readonly noRecommendations: string;
  readonly noRecommendationsElsewhere: string;
}

const zhPlanReady = "现在已经可以开始生成旅行计划。你可以直接告诉我开始生成，或者点击 Generate plan";
const enPlanReady = "You can now generate a travel plan. Just tell me to start, or tap Generate plan";

const zh: MeriReplies = {
  join: (sentences) => sentences.join(""),
  list: (items) => items.join("、"),
  quoted: (text) => `「${text}」`,

  planReady: `${zhPlanReady}。`,
  planReadyInviting: (missing) => missing.length === 0 ? `${zhPlanReady}。`
    : `${zhPlanReady}；如果愿意，也可以继续补充${missing.join("、")}。`,
  missing: { origin: "出发地", startDate: "出发时间", days: "行程天数" },
  captured: { both: "时间和行程时长也已经记下。", dates: "时间也已经有了。", duration: "行程时长也已经记下。" },

  added: (places) => `已加入${places}。`,
  offered: (answering) => `找到「${answering}」相关的地点了，点击添加后才会记入旅程。`,
  removedConfirmable: "已移除能确认的地点。",
  ambiguousRemoval: (names) => `${names}对应多个已保存地点，请说得更具体一些。`,
  notInDestination: (names) => `当前旅程里没有找到${names}。`,
  lookupFailedFor: (names) => `${names}查询暂时不可用。`,
  lookupFailed: "地点查询暂时不可用，目的地没有改变。请稍后重试。",
  notFoundToo: (names) => `${names}暂时没找到。`,
  notFound: (names) => `暂时没找到${names}的可靠地点，目的地没有因此改变。`,
  searchAfterOffer: "都不是的话，可以在「目的地」的「添加」里自己搜索。",
  searchAfterMiss: "也可以在「目的地」的「添加」里自己搜索。",

  leadInFallback: "好，我挑几个地方给你看看。",
  destinationIs: (destination) => `好，目的地现在是${destination}。`,
  pickedAdded: (places) => `好，已加入${places}。`,
  reverifySaved: "之前保存的地点还需要重新搜索确认。",
  alreadyInJourney: "这些地点已经在旅程里了。",

  recommendationsListed: "我按省份列了几个可以去的地方，你想去哪些都可以选上，选好之后我们再往下定。",
  noRecommendations: "这次没有筛出合适的目的地。你可以调整一下偏好，我们再找找其他方向。",
  noRecommendationsElsewhere: "这次没有在其他省份筛出合适的地方。你可以说说想要什么样的风景，我们再找找。",
};

const en: MeriReplies = {
  join: (sentences) => sentences.filter((sentence) => sentence !== "").join(" "),
  list: (items) => items.join(", "),
  quoted: (text) => `“${text}”`,

  planReady: `${enPlanReady}.`,
  planReadyInviting: (missing) => missing.length === 0 ? `${enPlanReady}.`
    : `${enPlanReady}; if you like, you can also add ${missing.join(", ")}.`,
  missing: { origin: "where you're starting from", startDate: "when you're leaving", days: "how many days" },
  captured: { both: "Your dates and trip length are noted too.", dates: "Your dates are noted too.",
    duration: "Your trip length is noted too." },

  added: (places) => `Added ${places}.`,
  offered: (answering) => `I found places for “${answering}” — they're only added to the journey once you tap Add.`,
  removedConfirmable: "I removed the places I could confirm.",
  ambiguousRemoval: (names) => `${names} matches more than one saved place — could you be more specific?`,
  notInDestination: (names) => `${names} isn't in the current journey.`,
  lookupFailedFor: (names) => `Looking up ${names} isn't working right now.`,
  lookupFailed: "Place lookup isn't working right now, so the destination hasn't changed. Please try again shortly.",
  notFoundToo: (names) => `${names} wasn't found.`,
  notFound: (names) => `I couldn't find a reliable match for ${names}, so the destination hasn't changed.`,
  searchAfterOffer: "If none of these is right, you can search yourself under Destination → Add.",
  searchAfterMiss: "You can also search yourself under Destination → Add.",

  leadInFallback: "OK, here are a few places to look at.",
  destinationIs: (destination) => `OK, your destination is now ${destination}.`,
  pickedAdded: (places) => `OK, added ${places}.`,
  reverifySaved: "The places saved earlier still need to be searched and confirmed again.",
  alreadyInJourney: "These places are already in the journey.",

  recommendationsListed: "I've listed a few places by province — pick as many as you like, and we'll go on from there once you've chosen.",
  noRecommendations: "I couldn't find suitable destinations this time. Adjust your preferences and we'll look in other directions.",
  noRecommendationsElsewhere: "I couldn't find good places in other provinces this time. Tell me what kind of scenery you'd like and we'll look again.",
};

export const meriReplies: Readonly<Record<Locale, MeriReplies>> = { zh, en };
