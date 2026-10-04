import { cookies, headers } from "next/headers";

import type { Locale } from "@/domain/locale/locale";

import { readLocalePreference } from "./locale-preference";

/** The language of the request being rendered: the visitor's choice, else their browser's. */
export async function requestLocale(): Promise<Locale> {
  return readLocalePreference(await cookies(), (await headers()).get("accept-language"));
}
