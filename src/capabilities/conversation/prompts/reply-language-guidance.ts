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
 * language is the model's judgment alone.
 * The rule covers prose only: an English sentence may call 海南 Hainan. How a place
 * reaches destinationEdit is the destination rules' business — as typed in Chinese,
 * translated into Chinese in English.
 */
export function replyLanguageGuidance(locale: Locale): string {
  const language = promptLanguageName(locale);
  return `Reply language: the user chose ${language} on Meri's home page, so write the reply in ${language}. If the user's current message is clearly written in another language, reply in that language instead; a place name or a single borrowed word does not make a message another language. ${placesNote[locale]} Any trip name you propose is written in ${language}, whatever language the message uses.`;
}
