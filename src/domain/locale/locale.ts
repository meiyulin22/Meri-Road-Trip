/**
 * The languages Meri speaks. The user picks one for the interface; Meri's replies
 * start in it and follow the user when they write in the other one.
 */
export const locales = ["zh", "en"] as const;

export type Locale = (typeof locales)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** The value for `<html lang>`: screen readers and fonts pick the script from it. */
export function htmlLang(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en";
}
