import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

const nodeRequire = createRequire(import.meta.url);
nodeRequire.extensions[".css"] = (module) => {
  module.exports = { default: new Proxy({}, { get: (_target, key) => String(key) }) };
};

test("the toggle names each language in itself and marks the current one pressed", async () => {
  const { LanguageToggle } = await import("./language-toggle");
  const { LocaleProvider } = await import("@/components/i18n/locale-context");
  const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
  const router = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} };
  const markup = renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>
    <LocaleProvider locale="zh"><LanguageToggle /></LocaleProvider>
  </AppRouterContext.Provider>);
  assert.match(markup, /role="group"/);
  assert.match(markup, /<button[^>]*aria-label="中文"[^>]*aria-pressed="true"[^>]*lang="zh-CN"[^>]*>中<\/button>/);
  assert.match(markup, /<button[^>]*aria-label="English"[^>]*aria-pressed="false"[^>]*lang="en"[^>]*>EN<\/button>/);
});
