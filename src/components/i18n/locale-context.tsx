"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Locale } from "@/domain/locale/locale";

import { messages, type Messages } from "./messages";

/**
 * The visitor's language, decided once on the server from their cookie and handed to
 * every client component. English outside a provider, which only happens in tests.
 */
const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { readonly locale: Locale; readonly children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useMessages(): Messages {
  return messages[useContext(LocaleContext)];
}
