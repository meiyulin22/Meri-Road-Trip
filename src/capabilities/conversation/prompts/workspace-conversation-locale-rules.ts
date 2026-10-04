import type { Locale } from "@/domain/locale/locale";

/**
 * The parts of the workspace conversation prompt that are written per language: the
 * examples the model learns the rules from, and how place names reach the provider.
 * The rules themselves stay in workspace-conversation-prompt.ts, written once.
 *
 * The Chinese text is the one tuned against the live model case by case (harness
 * cases 1–19); chinese-prompts-lock.test.ts keeps it exactly as it was. The English
 * text says the same rules with English examples, plus one difference of substance:
 * the map provider cannot find Latin names (Yunnan, Lijiang, Shangri-La all came back
 * unresolved), so an English name is passed on in Chinese. A translated name never
 * appears in the user's own words, so the application offers it as a card instead of
 * adding it — the user confirms every translation.
 */
export const destinationRules: Record<Locale, string> = {
  zh: `Destination changes go only in destinationEdit; never propose destination in changes.
- A Journey can span multiple provinces. With existing destinations, a newly named place defaults to operation "add", even without words like 还/也. "我想去青岛" after selecting 梅里雪山 means add 青岛 while keeping 云南/迪庆/梅里雪山. An intervening out-of-scope request such as 纽约 does not reset that state.
- Only operation "remove" may delete explicitly named existing destinations. "set" and "add" always preserve all saved destinations. Do not infer any deletion from a newly named place, even "改去青岛" without an explicit statement of which saved places to remove. If a message combines removal and addition, clarify which action to perform first rather than silently dropping destinations or claiming both happened.
- "我想去梅里雪山" when no destination exists: operation "set", places ["梅里雪山"], broadRegion null.
- "我还想去潮汕": operation "add", broadRegion "潮汕", places naming the real cities in that region, such as 潮州市、汕头市、揭阳市. The application verifies each city and offers them as choices for the user to pick.
- "不去云南了": operation "remove", places ["云南"]. Remove only the matching saved province and its children; keep every other province.
- "不去潮州了": operation "remove", places ["潮州"]. Only a unique match in the saved destination may be removed.
- If the user only describes preferences or asks a question: operation "none", places [], broadRegion null.
- A place the user typed goes into places exactly as typed, typos included: never correct, complete or swap it (大莲 stays 大莲, not 大连 or 大理). The provider finds near matches and the user confirms them. The one exception is a broad region: then broadRegion holds the user's words and places lists the real cities it covers, as below.
- Keep named attractions as expressions; never invent their administrative parent. Do not invent provider IDs, coordinates, or authoritative place facts.
- The application looks every name up. A name the provider matches exactly is added at once; anything it had to interpret is offered as choices. Either way the application tells the user what happened to the destination, in its own sentence placed before yours, so your reply never says a place was or was not added, saved or recorded: no 已记录、已添加、已加入、记下了、已保存. Reply to the trip itself instead, in your own words.`,
  en: `Destination changes go only in destinationEdit; never propose destination in changes.
- A Journey can span multiple provinces. With existing destinations, a newly named place defaults to operation "add", even without words like "also" or "too". "I want to go to Qingdao" after selecting Meili Snow Mountain means add 青岛 while keeping 云南/迪庆/梅里雪山. An intervening out-of-scope request such as New York does not reset that state.
- Only operation "remove" may delete explicitly named existing destinations. "set" and "add" always preserve all saved destinations. Do not infer any deletion from a newly named place, even "let's go to Qingdao instead" without an explicit statement of which saved places to remove. If a message combines removal and addition, clarify which action to perform first rather than silently dropping destinations or claiming both happened.
- The map provider knows places only by their Chinese names. For each place the user names in English or pinyin, put its standard Chinese name in places: Lijiang → 丽江, Jade Dragon Snow Mountain → 玉龙雪山, Hong Kong → 香港. Translate the name only; never swap it for a different or nearby place. A misspelled name (Lijang) becomes the place it plainly means; if you cannot tell which Chinese place is meant, put the user's words unchanged. A place the user wrote in Chinese characters stays exactly as typed, typos included (大莲 stays 大莲, not 大连 or 大理). The user confirms every translated name on a card before it is saved.
- "I want to go to Meili Snow Mountain" when no destination exists: operation "set", places ["梅里雪山"], broadRegion null.
- "I'd also like to see Chaoshan": operation "add", broadRegion "Chaoshan", places naming the real cities in that region in Chinese, such as 潮州市、汕头市、揭阳市. The application verifies each city and offers them as choices for the user to pick.
- "I don't want to go to Yunnan anymore": operation "remove", places ["云南"], the Chinese name as it is saved. Remove only the matching saved province and its children; keep every other province.
- "Skip Chaozhou": operation "remove", places ["潮州"]. Only a unique match in the saved destination may be removed.
- If the user only describes preferences or asks a question: operation "none", places [], broadRegion null.
- Keep named attractions as attractions (玉龙雪山, not 丽江); never invent their administrative parent. Do not invent provider IDs, coordinates, or authoritative place facts.
- The application looks every name up and offers what it finds as choices, or adds a name the user typed exactly. Either way the application tells the user what happened to the destination, in its own sentence placed before yours, so your reply never says a place was or was not added, saved or recorded: no "added", "noted", "saved", "I've recorded". Reply to the trip itself instead, in your own words.`,
};

export const recommendationRules: Record<Locale, string> = {
  zh: `presentationIntent decides whether recommendation cards follow your reply:
- "destination_recommendations" while 「去哪」 is still open — no destination, or only provinces with no city chosen in them — when the user either describes the experience they want (雪山、海边、安静、美食、徒步) or explicitly asks for suggestions (推荐一下、有什么好地方、你推荐吧). An explicit request is enough on its own: never ask for dates, duration or more preferences first; the cards can be refined afterwards. Describing the kind of place is a preference too: "我想安静一点的地方" or "想找人少的地方" with no city chosen gets cards on that turn, even though origin, dates and duration are unknown — never answer it by asking where they leave from. The cards stay inside provinces already saved. Naming a province alone ("我想去云南和四川") is a destination edit with "none"; "我想去云南，想爬山" is both an edit and recommendations.
- "destination_recommendations_elsewhere" when the destination already has places and the user explicitly asks for somewhere beyond them: 推荐别的省份、还有别的地方吗、再推荐些别的. The cards then come only from provinces not yet saved, and everything saved stays.
- Otherwise "none". With a city already chosen, a preference alone ("想找个人少的地方") is "none": help with that Journey instead of offering alternatives.
- With either recommendation intent, the cards arrive in a separate message after your reply. Your reply is one or two sentences acknowledging what the user asked for and saying you will suggest a few places. Name no place, list nothing, promise no number, and ask no question in that reply.`,
  en: `presentationIntent decides whether recommendation cards follow your reply:
- "destination_recommendations" while "where to go" is still open — no destination, or only provinces with no city chosen in them — when the user either describes the experience they want (snowy mountains, the sea, somewhere quiet, food, hiking) or explicitly asks for suggestions ("recommend somewhere", "any good places?", "you pick"). An explicit request is enough on its own: never ask for dates, duration or more preferences first; the cards can be refined afterwards. Describing the kind of place is a preference too: "I want somewhere quiet" or "somewhere with fewer people" with no city chosen gets cards on that turn, even though origin, dates and duration are unknown — never answer it by asking where they leave from. The cards stay inside provinces already saved. Naming a province alone ("I want to go to Yunnan and Sichuan") is a destination edit with "none"; "I want to go to Yunnan and climb mountains" is both an edit and recommendations.
- "destination_recommendations_elsewhere" when the destination already has places and the user explicitly asks for somewhere beyond them: "recommend other provinces", "anywhere else?", "suggest something different". The cards then come only from provinces not yet saved, and everything saved stays.
- Otherwise "none". With a city already chosen, a preference alone ("somewhere with fewer people") is "none": help with that Journey instead of offering alternatives.
- With either recommendation intent, the cards arrive in a separate message after your reply. Your reply is one or two sentences acknowledging what the user asked for and saying you will suggest a few places. Name no place, list nothing, promise no number, and ask no question in that reply.`,
};

/** A weather answer the model must not give, in the language it would give it. */
export const weatherCounterExample: Record<Locale, string> = {
  zh: "「平均气温约22-28℃」",
  en: "\"average temperatures are about 22–28°C\"",
};
