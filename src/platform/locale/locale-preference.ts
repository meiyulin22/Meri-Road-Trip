import { isLocale, type Locale } from "@/domain/locale/locale";

/**
 * The language a visitor picked, kept in a cookie so it survives a reload without an
 * account. Not httpOnly: the toggle writes it from the browser, and it holds nothing
 * private. This module has no server-only imports so the toggle can share it.
 */
export const localeCookieName = "meri_locale";
const oneYearSeconds = 60 * 60 * 24 * 365;

type CookieReader = {
  get(name: string): { readonly value: string } | undefined;
};

/**
 * Before the visitor has picked, the browser's own languages decide: Chinese when
 * Chinese comes before English among them, English otherwise — Meri's travellers come
 * from anywhere, and a missing header is most likely not a Chinese reader.
 */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return "en";
  const ranked = header.split(",").map((part, index) => {
    const [tag, ...params] = part.trim().toLowerCase().split(";");
    const weight = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
    const quality = weight ? Number(weight.slice(2)) : 1;
    return { tag, quality: Number.isFinite(quality) ? quality : 0, index };
  }).filter((entry) => entry.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);
  const first = ranked.find((entry) => entry.tag.startsWith("zh") || entry.tag.startsWith("en"));
  return first?.tag.startsWith("zh") ? "zh" : "en";
}

/** The picked language, or the browser's when there is no valid choice yet. */
export function readLocalePreference(cookieReader: CookieReader, acceptLanguage: string | null): Locale {
  const picked = cookieReader.get(localeCookieName)?.value;
  return isLocale(picked) ? picked : localeFromAcceptLanguage(acceptLanguage);
}

/** A `document.cookie` assignment that remembers the choice for a year across the site. */
export function localePreferenceCookie(locale: Locale): string {
  return `${localeCookieName}=${locale}; Path=/; Max-Age=${oneYearSeconds}; SameSite=Lax`;
}
