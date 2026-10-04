import type { Locale } from "@/domain/locale/locale";

/**
 * Every fixed piece of interface text, once per language. English sets the shape and
 * Chinese must match it, so a sentence missing in one language fails the type check
 * instead of showing up blank. Text that needs a value is a function of it.
 *
 * Words Meri says in the conversation do not belong here: they are decided on the
 * server with the reply. Place and Journey names are data and are never translated.
 */
const en = {
  home: {
    profile: "Profile",
    profileUnavailable: "Profile is not available yet",
    headline: "Where do you want to go?",
    startJourney: "Start a Journey",
    composerPlaceholder: "Tell Meri anything about your trip...",
    sendIdea: "Send trip idea",
    understanding: "Meri is reading your idea…",
    draftFailed: "Meri couldn't make sense of this trip idea just now. Your text is still here — please try again in a moment.",
    journeySaved: "Your journey and your original idea are saved.",
    openingMissing: "Meri hasn't finished its first reply yet.",
    openingRetryFailed: "Meri still can't reply. Your journey is saved — try again later, or open it first.",
    retryingOpening: "Retrying…",
    retryOpening: "Retry Meri's reply",
    openJourneyFirst: "Open the journey first",
  },
  recentJourneys: {
    title: "Continue exploring",
    previous: "Previous journey",
    next: "Next journey",
    choose: "Choose a recent journey",
    goTo: (position: number, count: number) => `Go to journey ${position} of ${count}`,
    open: (name: string) => `Open ${name}`,
    select: (name: string) => `Select ${name}`,
    destinationNotSet: "Destination not set",
    flexibleDates: "Flexible dates",
    from: (date: string) => `From ${date}`,
    until: (date: string) => `Until ${date}`,
    actions: "Journey actions",
    deleteMenu: "Delete Journey",
    deleteTitle: (name: string) => `Delete “${name}”?`,
    deleteDescription: "This journey and its conversation will be permanently deleted.",
    cancel: "Cancel",
    confirmDelete: "Delete",
    deleting: "Deleting…",
    deleteFailed: "Could not delete this Journey. Please try again.",
  },
};

export type Messages = typeof en;

const zh: Messages = {
  home: {
    profile: "个人资料",
    profileUnavailable: "个人资料暂未开放",
    headline: "你想去哪里？",
    startJourney: "开始一个旅程",
    composerPlaceholder: "跟 Meri 说说你的旅行想法…",
    sendIdea: "发送旅行想法",
    understanding: "Meri 正在理解你的想法…",
    draftFailed: "Meri 暂时无法理解这段旅行想法。你的输入还在，请稍后重试。",
    journeySaved: "旅程和你的原始想法已保存。",
    openingMissing: "Meri 暂时没能完成第一条回复。",
    openingRetryFailed: "Meri 仍暂时无法回复。旅程已经保存，你可以稍后再试或先进入旅程。",
    retryingOpening: "正在重试…",
    retryOpening: "重试 Meri 回复",
    openJourneyFirst: "先进入旅程",
  },
  recentJourneys: {
    title: "继续探索",
    previous: "上一个旅程",
    next: "下一个旅程",
    choose: "选择最近的旅程",
    goTo: (position, count) => `第 ${position} 个旅程，共 ${count} 个`,
    open: (name) => `打开 ${name}`,
    select: (name) => `选择 ${name}`,
    destinationNotSet: "目的地未定",
    flexibleDates: "日期待定",
    from: (date) => `${date} 起`,
    until: (date) => `至 ${date}`,
    actions: "旅程操作",
    deleteMenu: "删除旅程",
    deleteTitle: (name) => `删除「${name}」？`,
    deleteDescription: "这个旅程和它的对话将被永久删除。",
    cancel: "取消",
    confirmDelete: "删除",
    deleting: "删除中…",
    deleteFailed: "没能删除这个旅程，请重试。",
  },
};

export const messages: Readonly<Record<Locale, Messages>> = { en, zh };
