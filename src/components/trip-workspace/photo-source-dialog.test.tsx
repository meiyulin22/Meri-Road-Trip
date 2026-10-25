import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

const nodeRequire = createRequire(import.meta.url);
nodeRequire.extensions[".css"] = (module) => {
  module.exports = { default: new Proxy({}, { get: (_target, key) => String(key) }) };
};

const pixabay = { url: "https://pixabay.com/users/wangsuishi-5722660/", artist: "wangsuishi", source: "pixabay" };
const commons = { url: "https://commons.wikimedia.org/wiki/File:Shimei_Bay_in_Wanning.jpg", artist: "Zhangmoon618", source: "wikimedia" };

test("only the two photo platforms' expected HTTPS destinations become confirmable links", async () => {
  const { parsePhotoSource } = await import("./photo-source-dialog");
  assert.deepEqual(parsePhotoSource(pixabay), pixabay);
  assert.deepEqual(parsePhotoSource(commons), commons);
  for (const source of [
    { ...pixabay, url: "javascript:alert(1)" },
    { ...pixabay, url: "http://pixabay.com/users/wangsuishi-5722660/" },
    { ...pixabay, url: "https://pixabay.com.evil.test/users/wangsuishi-5722660/" },
    { ...pixabay, url: "https://pixabay.com@evil.test/users/wangsuishi-5722660/" },
    { ...pixabay, url: "https://pixabay.com/users/wangsuishi-5722660/?redirect=https://evil.test/" },
    { ...pixabay, url: "https://pixabay.com/service/" },
    { ...commons, url: "https://commons.wikimedia.org/wiki/Special:UserLogin" },
    { ...commons, url: "https://commons.wikimedia.org/wiki/File:" },
    { ...commons, source: "unknown" },
    { ...commons, artist: "" },
  ]) assert.equal(parsePhotoSource(source), null, JSON.stringify(source));
});

test("source lookup asks the local JSON endpoint and refuses redirects before user confirmation", async () => {
  const { requestPhotoSource } = await import("./photo-source-dialog");
  let requests = 0;
  const controller = new AbortController();
  const fetcher = (async (input, init) => {
    requests++;
    assert.equal(input, "/photo-credits/source/pixabay-2437983.jpg?format=json");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.signal, controller.signal);
    return Response.json(pixabay);
  }) as typeof fetch;
  assert.deepEqual(await requestPhotoSource("/photo-credits/source/pixabay-2437983.jpg", controller.signal, fetcher), pixabay);
  await assert.rejects(() => requestPhotoSource("https://evil.test/", controller.signal, fetcher));
  assert.equal(requests, 1);
});

test("failed, malformed or unsafe source responses never return a navigation destination", async () => {
  const { requestPhotoSource } = await import("./photo-source-dialog");
  const controller = new AbortController();
  for (const answer of [
    () => new Response("Not found", { status: 404 }),
    () => new Response("not json"),
    () => Response.json({ ...commons, url: "https://evil.test/a.jpg" }),
    () => { throw new TypeError("network unavailable"); },
  ]) await assert.rejects(() => requestPhotoSource("/photo-credits/source/wikimedia-1.jpg", controller.signal, (async () => answer()) as typeof fetch));
});

test("credits initially render as local buttons without an external link, including read-only Commons credit notices", async () => {
  const { PhotoSourceCredit } = await import("./photo-source-dialog");
  const { LocaleProvider } = await import("@/components/i18n/locale-context");
  const image = { url: "/photos/shimei-bay-wanning-25170960.jpg", caption: "石梅湾",
    credit: "Photo: Zhangmoon618 / Wikimedia Commons, CC BY-SA 3.0" };
  for (const locale of ["zh", "en"] as const) {
    const markup = renderToStaticMarkup(<LocaleProvider locale={locale}>
      <PhotoSourceCredit className="placeCredit" href="/photo-credits/source/shimei-bay-wanning-25170960.jpg" image={image} />
    </LocaleProvider>);
    assert.match(markup, /<button[^>]*aria-haspopup="dialog"/);
    assert.match(markup, /type="button"/);
    assert.match(markup, /CC BY-SA 3.0/);
    assert.match(markup, locale === "zh" ? /已缩小尺寸/ : /Resized copy/);
    assert.doesNotMatch(markup, /<a\b|href=|disabled|<dialog\b/);
  }
});
