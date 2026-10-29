import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

const nodeRequire = createRequire(import.meta.url);
nodeRequire.extensions[".css"] = (module) => {
  module.exports = { default: new Proxy({}, { get: (_target, key) => String(key) }) };
};

const photo = {
  region: "丽江市",
  image: {
    url: "/photos/yulong-321.jpg",
    caption: "玉龙雪山",
    credit: "Photo: Example Creator / Wikimedia Commons, CC BY-SA 4.0",
  },
};

const copies = {
  en: {
    start: "Start a journey",
    credits: "Photo credits",
    viewSource: "View photo source",
    resized: "Resized copy",
    soon: "Coming soon",
    futureTitles: ["Check what matters", "A journey, day by day"],
    steps: [
      "Tell Meri what kind of trip you want",
      "Meri suggests destinations. You choose.",
      "Add your dates and where you are starting from",
      "Build a day-by-day plan, with feasibility checked item by item",
      "Want a change? Say it. Your plan follows.",
    ],
  },
  zh: {
    start: "开始一段旅程",
    credits: "照片署名",
    viewSource: "查看照片来源",
    resized: "已缩小尺寸",
    soon: "即将推出",
    futureTitles: ["替你核实", "按天成计划"],
    steps: [
      "说一句你想要的旅行",
      "Meri 推荐目的地，你来选",
      "补齐日期和出发地",
      "生成按天的计划，可行性逐项核实",
      "不满意？直接说，计划跟着改",
    ],
  },
} as const;

for (const locale of ["en", "zh"] as const) {
  test(`Intro offers a localized journey entry, five tutorial choices, planned features and photo credits in ${locale}`, async () => {
    const { IntroPage } = await import("./intro-page");
    const { LocaleProvider } = await import("@/components/i18n/locale-context");
    const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
    const router = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} };
    const markup = renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>
      <LocaleProvider locale={locale}><IntroPage photos={[photo]} /></LocaleProvider>
    </AppRouterContext.Provider>);
    const copy = copies[locale];

    const homeForms = markup.match(/<form\b[^>]*>[\s\S]*?<\/form>/g) ?? [];
    assert.equal(homeForms.length, 2);
    for (const form of homeForms) {
      const opening = form.slice(0, form.indexOf(">") + 1);
      assert.ok(opening.includes('action="/"'));
      assert.ok(opening.includes('method="get"'));
      const submissions = form.match(/<button\b[^>]*type="submit"[^>]*>[\s\S]*?<\/button>/g) ?? [];
      assert.equal(submissions.length, 1);
      assert.ok(submissions[0].includes(`>${copy.start}<`));
      assert.doesNotMatch(submissions[0], /\sdisabled(?:\s|=|>)/);
      assert.doesNotMatch(form, /<input\b|<select\b|<textarea\b|\sname=/);
    }
    assert.ok(markup.includes(`href="/photo-credits">${copy.credits}</a>`));

    const buttons = markup.match(/<button\b[^>]*>/g) ?? [];
    for (const [index, step] of copy.steps.entries()) {
      const controls = buttons.filter((button) => button.includes(`aria-label="${step}"`));
      assert.equal(controls.length, 1, step);
      assert.ok(controls[0].includes(`aria-pressed="${index === 0}"`), step);
      assert.ok(controls[0].includes('type="button"'), step);
      assert.ok(!controls[0].includes("disabled"), step);
    }

    const articles = markup.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) ?? [];
    for (const title of copy.futureTitles) {
      const feature = articles.find((article) => article.includes(`<h3>${title}</h3>`));
      assert.ok(feature, title);
      assert.ok(feature.includes(`>${copy.soon}</span>`), title);
    }

    assert.ok(markup.includes('alt="玉龙雪山"'));
    assert.ok(markup.includes("yulong-321.jpg"));
    assert.ok(markup.includes(`>${photo.image.credit} · ${copy.resized}</button>`));
    const credit = buttons.find((button) => button.includes(`aria-label="${copy.viewSource}: ${photo.image.credit}"`));
    assert.ok(credit);
    assert.ok(credit.includes('aria-haspopup="dialog"'));
    assert.doesNotMatch(markup, /\/companion\/|home-v2-companion|companion-bear/);
  });
}

test("Intro opens only by choice: the home page's Meet Meri button is the only way in, with no redirect", () => {
  const root = join(process.cwd(), "src");
  const pointsAtIntro: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) &&
        /["'`]\/intro["'`]/u.test(readFileSync(path, "utf8"))) {
        // relative() yields backslashes on Windows, so compare in one separator.
        pointsAtIntro.push(relative(root, path).split("\\").join("/"));
      }
    }
  };
  visit(root);
  // Links a visitor clicks: Intro's own, its credits page's way back, and Meet Meri on the home page.
  assert.deepEqual(pointsAtIntro.sort(),
    ["app/photo-credits/page.tsx", "components/intro/intro-page.tsx", "components/meri-shell/meri-app-shell.tsx"]);
  const shell = readFileSync(join(root, "components/meri-shell/meri-app-shell.tsx"), "utf8");
  assert.match(shell, /<Link className=\{styles\.meetButton\} href="\/intro">/u);
  assert.doesNotMatch(shell + readFileSync(join(root, "app/page.tsx"), "utf8") + readFileSync(join(root, "app/layout.tsx"), "utf8"),
    /router\.replace|location\.replace|redirect\(/u);
});
