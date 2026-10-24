import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { findPlaceImage } from "@/capabilities/destination/place-images";
import { parsePlaceImage } from "@/domain/location/place-image";

import { CatalogPhotoProvider } from "./catalog-photo-provider";
import { catalogCredit, normalizePlaceName, parsePhotoCatalog, photoFromCatalog, type PhotoCatalog } from "./photo-catalog";
import type { PlacePhotoQuery } from "./place-photo-provider";

const named = (keywords: string, region: string | null): PlacePhotoQuery => ({ kind: "named", keywords, region });

const catalog: PhotoCatalog = {
  布达拉宫: { file: "potala-palace.jpg", artist: "InkMagiStudio",
    pageUrl: "https://pixabay.com/photos/potala-palace-4742065/", fetchedAt: "2026-10-23",
    aliases: ["布达拉宫景区", "布达拉宫（拉萨）"], regions: ["拉萨市", "拉萨"], scenicFor: ["拉萨市"] },
};

test("a catalogued place gets our own copy, with the photographer credited", () => {
  const image = photoFromCatalog(catalog, named("布达拉宫", "拉萨市"));
  assert.deepEqual(image, { url: "/photos/potala-palace.jpg", caption: "布达拉宫",
    credit: "Photo: InkMagiStudio / Pixabay" });
  // The domain accepts a root-relative URL: our own file on our own origin.
  assert.equal(parsePlaceImage(image)?.url, "/photos/potala-palace.jpg");
});

test("a place that is not catalogued has no photo, which is not an error", () => {
  assert.equal(photoFromCatalog(catalog, named("贡嘎山", "甘孜藏族自治州")), null);
});

test("normalization handles width and whitespace without discarding location qualifiers", () => {
  assert.equal(normalizePlaceName(" 布达拉宫 "), "布达拉宫");
  assert.equal(normalizePlaceName("玉龙雪山（丽江）"), "玉龙雪山(丽江)");
  assert.equal(photoFromCatalog(catalog, named(" 布达拉宫（拉萨） ", "拉萨"))?.caption, "布达拉宫");
  assert.equal(photoFromCatalog(catalog, named("布达拉宫（其他地方）", "拉萨市")), null);
});

test("our own photo path is accepted, while http and escaping paths are not", () => {
  assert.equal(parsePlaceImage({ url: "/photos/x.jpg", caption: "x" })?.url, "/photos/x.jpg");
  assert.equal(parsePlaceImage({ url: "http://example.com/x.jpg", caption: "x" }), null);
  assert.equal(parsePlaceImage({ url: "/photos/../etc/passwd", caption: "x" }), null);
  assert.equal(parsePlaceImage({ url: "https://cdn.example.com/x.jpg", caption: "x" })?.url,
    "https://cdn.example.com/x.jpg");
});

test("the provider answers null for a place the catalog does not hold", async () => {
  const provider = new CatalogPhotoProvider();
  assert.equal(await provider.findPhoto({ kind: "named", keywords: "不存在的景点", region: null }), null);
});

test("another city, a broad province or no region cannot match a named photo", () => {
  for (const region of ["兰州市", "西藏自治区", "西藏自治区/林芝市", "城关区", null]) {
    assert.equal(photoFromCatalog(catalog, named("布达拉宫", region)), null, String(region));
  }
});

test("only explicit aliases match; administrative suffixes and substrings are not guessed", () => {
  assert.equal(photoFromCatalog(catalog, named("布达拉宫景区", "拉萨市"))?.caption, "布达拉宫");
  for (const name of ["布达拉宫停车场", "布达拉宫风景区", "布达拉宫区"]) {
    assert.equal(photoFromCatalog(catalog, named(name, "拉萨市")), null, name);
  }
});

test("scenic queries require an explicit representative rather than a matching sight name", () => {
  assert.equal(photoFromCatalog(catalog, { kind: "scenic", region: "拉萨市" })?.caption, "布达拉宫");
  for (const region of ["布达拉宫", "林芝市", "西藏自治区", "拉萨市城关区"]) {
    assert.equal(photoFromCatalog(catalog, { kind: "scenic", region }), null, region);
  }
});

test("ambiguous aliases and representative mappings fail closed instead of choosing by order", () => {
  const collision: PhotoCatalog = { ...catalog,
    另一个地点: { ...catalog.布达拉宫, aliases: ["布达拉宫"], file: "another.jpg" } };
  assert.equal(photoFromCatalog(collision, named("布达拉宫", "拉萨市")), null);
  assert.equal(photoFromCatalog(collision, { kind: "scenic", region: "拉萨市" }), null);
});

test("invalid catalog records are skipped while valid records remain usable", () => {
  const parsed = parsePhotoCatalog({ ...catalog,
    未配置: { file: "x.jpg", artist: "x", pageUrl: "https://pixabay.com/photos/x/", fetchedAt: "2026-10-23" },
    非法路径: { ...catalog.布达拉宫, file: "../secret.jpg" },
    编码路径: { ...catalog.布达拉宫, file: "%2e%2e%2fsecret.jpg" },
    错误地区: { ...catalog.布达拉宫, regions: "拉萨市" },
    地区外代表图: { ...catalog.布达拉宫, regions: [], scenicFor: ["惠州市"] },
    空别名: { ...catalog.布达拉宫, aliases: [""] },
    空记录: null,
  });
  assert.deepEqual(Object.keys(parsed), ["布达拉宫"]);
  for (const value of [null, [], "not a catalog"]) assert.deepEqual(parsePhotoCatalog(value), {});
});

test("new candidate downloads stay inactive until their regions are configured", () => {
  const candidate = parsePhotoCatalog({ 布达拉宫: { ...catalog.布达拉宫, regions: [], scenicFor: [] } });
  assert.equal(photoFromCatalog(candidate, named("布达拉宫", "拉萨市")), null);
  assert.equal(photoFromCatalog(candidate, { kind: "scenic", region: "拉萨市" }), null);
});

test("the shipped catalog has distinct files, unique names per region and unique representatives", () => {
  const raw = JSON.parse(readFileSync(new URL("../../../public/photos/photos.json", import.meta.url), "utf8"));
  const shipped = parsePhotoCatalog(raw);
  assert.deepEqual(Object.keys(shipped), Object.keys(raw));
  const representatives = new Set<string>();
  const namesInRegion = new Set<string>();
  const images = new Set<string>();
  for (const [name, entry] of Object.entries(shipped)) {
    const file = new URL(`../../../public/photos/${entry.file}`, import.meta.url);
    assert.ok(existsSync(file), entry.file);
    const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
    assert.equal(images.has(digest), false, `Same photo assigned to different places: ${name}`);
    images.add(digest);
    for (const region of entry.scenicFor) {
      const key = normalizePlaceName(region);
      assert.equal(representatives.has(key), false, `Duplicate representative: ${region}`);
      representatives.add(key);
      assert.ok(entry.regions.includes(region), `Representative outside allowed regions: ${name}/${region}`);
    }
    for (const region of entry.regions) {
      for (const alias of [name, ...entry.aliases]) {
        const key = `${normalizePlaceName(region)}/${normalizePlaceName(alias)}`;
        assert.equal(namesInRegion.has(key), false, `Ambiguous name: ${key}`);
        namesInRegion.add(key);
      }
    }
  }
});

test("the real provider keeps Hangzhou and Huizhou West Lake separate without fetching", async (context) => {
  const fetch = context.mock.method(globalThis, "fetch", async () => { throw new Error("Network forbidden"); });
  const provider = new CatalogPhotoProvider();
  assert.equal((await provider.findPhoto(named("西湖", "杭州市")))?.url, "/photos/west-lake-hangzhou.jpg");
  for (const region of ["惠州市", "宁波市", "浙江省/宁波市", null]) {
    assert.equal(await provider.findPhoto(named("西湖", region)), null);
  }
  assert.equal(await provider.findPhoto(named("西湖（惠州）", "杭州市")), null);
  assert.equal(fetch.mock.callCount(), 0);
});

test("full scenic-area names work through the real application query path", async () => {
  const provider = new CatalogPhotoProvider();
  for (const spot of ["黄山", "黄山风景区", "黄山风景名胜区"]) {
    const image = await findPlaceImage({ province: "安徽省", place: "黄山市", spot }, provider);
    assert.equal(image?.url, "/photos/huangshan.jpg", spot);
    assert.equal(image?.caption, "黄山");
  }
  for (const spot of ["玉龙雪山", "玉龙雪山风景名胜区", "玉龙雪山国家级风景名胜区"]) {
    const image = await findPlaceImage({ province: "云南省", place: "丽江市", spot }, provider);
    assert.equal(image?.url, "/photos/jade-dragon-snow-mountain.jpg", spot);
    assert.equal(image?.caption, "玉龙雪山");
  }
});

test("aliases do not widen into a different landmark or a specific Great Wall section", async () => {
  const provider = new CatalogPhotoProvider();
  assert.equal((await provider.findPhoto(named("点苍山", "大理白族自治州")))?.caption, "苍山");
  assert.equal(await provider.findPhoto(named("苍山", "贺州市")), null);
  assert.equal(await provider.findPhoto(named("八达岭长城", "北京市")), null);
  assert.equal(await provider.findPhoto(named("喀纳斯湖", "阿勒泰地区")), null);
  assert.equal(await provider.findPhoto(named("张家界国家森林公园", "张家界市")), null);
});

test("cross-boundary sights accept their explicitly configured cities", async () => {
  const provider = new CatalogPhotoProvider();
  for (const region of ["拉萨市", "那曲市"]) {
    assert.equal((await provider.findPhoto(named("纳木措", region)))?.caption, "纳木错");
  }
  for (const region of ["丽江市", "凉山彝族自治州"]) {
    assert.equal((await provider.findPhoto(named("泸沽湖风景区", region)))?.caption, "泸沽湖");
  }
});

test("administrative places use explicit representatives and never another city in the province", async () => {
  const provider = new CatalogPhotoProvider();
  const image = await findPlaceImage({ province: "四川省", place: "甘孜藏族自治州", spot: "稻城县" }, provider);
  assert.equal(image?.url, "/photos/daocheng.jpg");
  assert.equal(image?.caption, "稻城");
  assert.equal(await findPlaceImage({ province: "广西壮族自治区", place: "柳州市", spot: null }, provider), null);
  const fallback = await findPlaceImage({ province: "云南省", place: "丽江市", spot: "未收录的景点" }, provider);
  assert.equal(fallback?.caption, "丽江古城");
});

test("reviewed replacements use new URLs while the incorrect old photos stay withdrawn", async () => {
  const provider = new CatalogPhotoProvider();
  for (const region of ["海南藏族自治州", "海北藏族自治州"]) {
    assert.equal((await provider.findPhoto(named("青海湖", region)))?.url, "/photos/qinghai-lake-2631421.jpg");
  }
  assert.equal((await provider.findPhoto(named("天山天池", "昌吉回族自治州")))?.url,
    "/photos/tianchi-xinjiang-2077003.jpg");
  assert.equal(await provider.findPhoto(named("天山天池", "白山市")), null);
  assert.equal(await provider.findPhoto(named("长白山天池", "昌吉回族自治州")), null);
  assert.equal(await provider.findPhoto(named("天池", "昌吉回族自治州")), null);
  for (const file of ["qinghai-lake.jpg", "tianchi-lake.jpg", "shangri-la-yunnan.jpg"]) {
    assert.equal(existsSync(new URL(`../../../public/photos/${file}`, import.meta.url)), false);
  }
});

test("Shangri-La uses a named local landmark as its representative, not a landmark alias", async () => {
  const provider = new CatalogPhotoProvider();
  assert.equal(await provider.findPhoto(named("香格里拉", "迪庆藏族自治州")), null);
  assert.equal((await provider.findPhoto(named("噶丹·松赞林寺", "香格里拉市")))?.caption, "松赞林寺");
  assert.equal(await provider.findPhoto(named("松赞林寺", "丽江市")), null);
  for (const spot of ["香格里拉", "香格里拉市"]) {
    const image = await findPlaceImage({ province: "云南省", place: "迪庆藏族自治州", spot }, provider);
    assert.equal(image?.url, "/photos/songzanlin-4424995.jpg");
    assert.equal(image?.caption, "松赞林寺");
    assert.equal(image?.credit, "Photo: samyo / Pixabay");
  }
});

test("a Commons photo is kept only with its licence and a Commons page, and its credit names both", () => {
  const commons = { file: "lianyungang-city-18646554.jpg", artist: "风之清扬",
    pageUrl: "https://commons.wikimedia.org/wiki/File:Lianyun_District_Birdview.JPG", fetchedAt: "2026-10-24",
    aliases: [], regions: ["连云港市"], scenicFor: ["连云港市"], source: "wikimedia",
    license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0" };
  const parsed = parsePhotoCatalog({ 连云港: commons, 无许可: { ...commons, license: undefined },
    别处页面: { ...commons, pageUrl: "https://pixabay.com/photos/x-1/" }, 坏链接: { ...commons, licenseUrl: "http://example.com/" },
    未知来源: { ...commons, source: "flickr" } });
  assert.deepEqual(Object.keys(parsed), ["连云港"]);
  assert.equal(parsed.连云港.license, "CC BY-SA 3.0");
  assert.equal(photoFromCatalog(parsed, { kind: "scenic", region: "连云港市" })?.credit,
    "Photo: 风之清扬 / Wikimedia Commons, CC BY-SA 3.0");
  // Pixabay entries read as before, with no source field.
  assert.equal(catalogCredit(catalog.布达拉宫), "Photo: InkMagiStudio / Pixabay");
  // A long author is shortened so the licence still fits in 120 characters.
  const long = catalogCredit({ ...parsed.连云港, artist: "x".repeat(100) });
  assert.ok(long.length <= 120 && long.endsWith("Wikimedia Commons, CC BY-SA 3.0"));
});

test("every Commons photo in the shipped catalog carries its licence and links", () => {
  const shipped = parsePhotoCatalog(JSON.parse(readFileSync("public/photos/photos.json", "utf8")) as unknown);
  const raw = JSON.parse(readFileSync("public/photos/photos.json", "utf8")) as Record<string, { source?: string }>;
  const commons = Object.entries(raw).filter(([, entry]) => entry.source === "wikimedia").map(([name]) => name);
  assert.ok(commons.length > 0);
  for (const name of commons) {
    assert.ok(shipped[name], `${name} was dropped by the parser`);
    assert.match(shipped[name].licenseUrl ?? "", /^https:\/\//u, name);
  }
});
