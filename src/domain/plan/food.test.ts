import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { LocationSearchResult } from "@/platform/location-provider/location-provider";

import { checkedFood, type FoodSource, isPromotional, placeRestaurant, restaurantKey, restaurantWitnesses, siteOf } from "./food";

// Recorded 2026-11-21: two Kimi searches for 丽江 food, and Tianditu's answer for 渣渣米线.
const fixtures = join(import.meta.dirname, "../../agents/planner/fixtures");
const searches = JSON.parse(readFileSync(join(fixtures, "food-search-lijiang-2026-11-21.json"), "utf8")) as Record<string, { url: string; title: string; snippet?: string }[]>;
const tianditu = JSON.parse(readFileSync(join(fixtures, "tianditu-zhazha-mixian-2026-11-21.json"), "utf8")) as LocationSearchResult;
const results = Object.values(searches).flat();

test("advertorials are dropped: the 'TOP5 品牌推荐' piece, the one naming a registered company, and a 探店 post", () => {
  const promotional = results.filter((result) => isPromotional({ title: result.title, snippet: result.snippet ?? "" })).map(({ url }) => siteOf(url));
  // The ctrip page is a review list where one reviewer calls it 探店, the word sponsored food posts use: dropped, to be safe.
  assert.deepEqual(promotional, ["sina.cn", "smzdm.com", "ctrip.com"]);
  assert.equal(isPromotional({ title: "丽江美食+路线全攻略", snippet: "腊排骨火锅" }), false);
});

test("pages of one site count once", () => {
  assert.equal(siteOf("https://m.ctrip.com/restaurant/detail/32/1.html"), "ctrip.com");
  assert.equal(siteOf("https://tw.trip.com/moments/detail/x"), "trip.com");
  assert.equal(siteOf("https://k.sina.cn/a"), siteOf("https://www.sina.cn/b"));
  assert.equal(siteOf("https://news.sina.com.cn/x"), "sina.com.cn");
  assert.equal(restaurantKey("渣渣米线(古城店)"), "渣渣米线");
});

const source = (id: number, url: string, title: string, snippet: string): FoodSource =>
  ({ id, url, title, snippet, site: siteOf(url), checkedAt: "2026-11-21T08:00:00.000Z" });
const sources = [
  source(1, "https://www.amap.com/ranking/lijiang", "丽江市2025高德状元榜·美食", "渣渣米线(古城店) 全年综合分4.86 他们家的过桥米线上桌像一场仪式"),
  source(2, "https://tw.trip.com/moments/x", "麗江古城美食推薦", "像西哥土雞米線湯底鮮、早晚都穩；渣渣米线的过桥米线也值得排队"),
  source(3, "https://www.sina.cn/a", "丽江美食全攻略", "腊排骨火锅——高原风干腊排骨配酸菜熬煮，越煮越香"),
];

test("a dish needs its quote in its source; a restaurant keeps its quotes that name it, one a site", () => {
  const { dishes, restaurants } = checkedFood({
    dishes: [
      { name: "腊排骨火锅", note: "纳西特色", sourceId: 3, quote: "腊排骨火锅——高原风干腊排骨配酸菜熬煮" },
      { name: "鸡豆凉粉", note: "made up", sourceId: 3, quote: "鸡豆凉粉清凉爽口" },
      { name: "过桥米线", note: "wrong dish", sourceId: 3, quote: "腊排骨火锅——高原风干腊排骨配酸菜熬煮" },
    ],
    restaurants: [
      { name: "渣渣米线(古城店)", dish: "过桥米线", mentions: [{ sourceId: 1, quote: "渣渣米线(古城店) 全年综合分4.86" }, { sourceId: 2, quote: "渣渣米线的过桥米线也值得排队" }] },
      { name: "西哥土雞米線", dish: null, mentions: [{ sourceId: 2, quote: "西哥土雞米線湯底鮮" }] },
      { name: "久哥米线", dish: null, mentions: [{ sourceId: 1, quote: "久哥米线全年综合分4.80" }, { sourceId: 2, quote: "久哥米线" }] },
    ],
  }, sources);
  assert.deepEqual(dishes.map(({ name }) => name), ["腊排骨火锅"]);
  // 久哥's quotes are not in the sources; 西哥 has one site, for the map to decide.
  assert.deepEqual(restaurants.map(({ name, evidence }) => [name, evidence.map(({ site }) => site)]),
    [["渣渣米线(古城店)", ["amap.com", "trip.com"]], ["西哥土雞米線", ["trip.com"]]]);
  assert.deepEqual(checkedFood({ dishes: "x", restaurants: 3 }, sources), { dishes: [], restaurants: [] });
});

test("a restaurant counts on the map only in its own city and near the stops", () => {
  const city = { province: "云南省", city: "丽江市" };
  const oldTown = { name: "丽江古城", point: { longitude: 100.234, latitude: 26.872 } };
  // The recorded answer: 渣渣米线炸串 in 张家口 only.
  assert.ok(tianditu.status === "success");
  if (tianditu.status !== "success") return;
  assert.equal(placeRestaurant("渣渣米线", tianditu.candidates, city, [oldTown]), null);

  const nearby = { ...tianditu.candidates[0], name: "渣渣米线(古城店)", province: "云南省", city: "丽江市", address: "七一街 8 号", longitude: 100.236, latitude: 26.873 };
  const far = { ...nearby, longitude: 100.30, latitude: 26.90 };
  assert.deepEqual(placeRestaurant("渣渣米线", [far, nearby], city, [oldTown]),
    { address: "七一街 8 号", point: { longitude: 100.236, latitude: 26.873 }, distanceM: 227, near: "丽江古城" });
  assert.equal(placeRestaurant("渣渣米线", [far], city, [oldTown]), null);
});

test("two independent witnesses: two sites, or one site and the map", () => {
  assert.equal(restaurantWitnesses(1, true), "shown");
  assert.equal(restaurantWitnesses(2, true), "shown");
  assert.equal(restaurantWitnesses(2, false), "mentioned");
  assert.equal(restaurantWitnesses(1, false), "dropped");
});
