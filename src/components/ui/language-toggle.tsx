"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useLocale } from "@/components/i18n/locale-context";
import type { Locale } from "@/domain/locale/locale";
import { localePreferenceCookie } from "@/platform/locale/locale-preference";

import styles from "./language-toggle.module.css";

/** Each language is named in itself, so a reader of either can find their own. */
const options: readonly { readonly locale: Locale; readonly short: string; readonly name: string; readonly lang: string }[] = [
  { locale: "zh", short: "中", name: "中文", lang: "zh-CN" },
  { locale: "en", short: "EN", name: "English", lang: "en" },
];

/** Outside the component: the cookie is the browser's, not React state. */
function rememberLocale(locale: Locale): void {
  document.cookie = localePreferenceCookie(locale);
}

/**
 * Switches the interface language. The choice is a cookie the server reads while
 * rendering, so a refresh redraws the page in the new language without a new URL.
 */
export function LanguageToggle({ className }: { readonly className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [switching, startSwitching] = useTransition();

  function choose(next: Locale): void {
    if (next === locale || switching) return;
    rememberLocale(next);
    startSwitching(() => router.refresh());
  }

  return (
    <div aria-busy={switching || undefined} aria-label="Language · 语言" className={className ? `${styles.toggle} ${className}` : styles.toggle}
      role="group">
      {options.map((option) => (
        <button aria-label={option.name} aria-pressed={option.locale === locale} className={styles.option} key={option.locale}
          lang={option.lang} onClick={() => choose(option.locale)} type="button">
          {option.short}
        </button>
      ))}
    </div>
  );
}
