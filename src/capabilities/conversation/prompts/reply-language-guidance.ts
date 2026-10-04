import type { Locale } from "@/domain/locale/locale";

const languageNames: Record<Locale, string> = {
  zh: "Simplified Chinese",
  en: "English",
};

/** The language's name as a prompt writes it. */
export function promptLanguageName(locale: Locale): string {
  return languageNames[locale];
}

/** Chinese places go to the provider as typed; English ones are translated (see the destination rules). */
const placesNote: Record<Locale, string> = {
  zh: "This rule covers the reply and any trip name only: places in destinationEdit stay exactly as the user typed them.",
  en: "This rule covers the reply and any trip name only; it does not change how places are written in destinationEdit.",
};

/**
 * The visitor's choice on the landing page is the default language of every reply.
 * When the user clearly writes in the other one, Meri follows them. Code never
 * guesses what language the user typed in; whether a message is clearly in another
 * language is the model's judgment alone. Worded as "the choice, unless the message
 * is clearly another language", the model never followed (0 of 6 live runs): the
 * choice anchored it. So the rule now starts from the message and falls back to the
 * choice.
 * The rule covers prose only: an English sentence may call 海南 Hainan. How a place
 * reaches destinationEdit is the destination rules' business — as typed in Chinese,
 * translated into Chinese in English.
 */
export function replyLanguageGuidance(locale: Locale): string {
  const language = promptLanguageName(locale);
  return `Reply language: decide it from the user's current message alone, not from TripState, the history or the language of these instructions. If that message is written in English sentences, reply in English; if it is written in Chinese sentences, reply in Chinese. Only when the message is not clearly either — a bare place name, a number, an emoji, an even mix — reply in ${language}, the language the user chose on Meri's home page. A place name or a single borrowed word inside a sentence does not change the sentence's language. ${placesNote[locale]} Any trip name you propose is written in ${language}, whatever language the message uses.`;
}
