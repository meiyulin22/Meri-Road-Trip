import assert from "node:assert/strict";
import test from "node:test";

import { localeFromAcceptLanguage, localePreferenceCookie, readLocalePreference } from "./locale-preference";

const cookies = (value?: string) => ({ get: (name: string) =>
  name === "meri_locale" && value !== undefined ? { value } : undefined });

test("the browser's languages decide until the visitor picks one", () => {
  assert.equal(localeFromAcceptLanguage("zh-CN,zh;q=0.9,en;q=0.8"), "zh");
  assert.equal(localeFromAcceptLanguage("en-GB,en;q=0.9,zh-CN;q=0.8"), "en");
  assert.equal(localeFromAcceptLanguage("de-DE,de;q=0.9,zh-TW;q=0.7,en;q=0.5"), "zh");
  assert.equal(localeFromAcceptLanguage("en;q=0.4,zh-HK;q=0.6"), "zh");
  assert.equal(localeFromAcceptLanguage("fr-FR,fr;q=0.9"), "en");
  assert.equal(localeFromAcceptLanguage("zh;q=0,en;q=0.5"), "en");
  assert.equal(localeFromAcceptLanguage(null), "en");
});

test("a picked language wins over the browser's, and a broken cookie is ignored", () => {
  assert.equal(readLocalePreference(cookies("en"), "zh-CN"), "en");
  assert.equal(readLocalePreference(cookies("zh"), "en-US"), "zh");
  assert.equal(readLocalePreference(cookies("fr"), "zh-CN"), "zh");
  assert.equal(readLocalePreference(cookies(), "en-US"), "en");
});

test("the choice is remembered across the whole site for a year", () => {
  assert.equal(localePreferenceCookie("zh"), "meri_locale=zh; Path=/; Max-Age=31536000; SameSite=Lax");
});
