import assert from "node:assert/strict";
import test from "node:test";

import { type CatalogMatch, scoreCatalogCities } from "./city-scores";

const match = (city: string, name: string, similarity: number, kind: CatalogMatch["kind"] = "spot"): CatalogMatch =>
  ({ province: "四川省", city, name, kind, summary: `${name}。`, similarity });

test("the best match counts most: one exact match beats three loose ones (想看大熊猫)", () => {
  const cities = scoreCatalogCities([
    match("阿坝藏族羌族自治州", "熊猫海", 0.5), match("阿坝藏族羌族自治州", "五花海", 0.46), match("阿坝藏族羌族自治州", "箭竹海", 0.46),
    match("成都市", "成都大熊猫繁育研究基地", 0.67), match("成都市", "玉垒阁", 0.45),
  ]);
  // Weighted: 成都 0.67 + 0.45/2 = 0.895; 阿坝 0.5 + 0.46/2 + 0.46/4 = 0.845. A plain sum would put 阿坝 first (1.42 to 1.12).
  assert.deepEqual(cities.map(({ city, score }) => [city, score]), [["成都市", 0.895], ["阿坝藏族羌族自治州", 0.845]]);
  assert.equal(cities[0].matches[0].name, "成都大熊猫繁育研究基地");
});

test("three matches a city at most, best first, and six cities at most", () => {
  const many = Array.from({ length: 8 }, (_, index) => match(`城${index}`, `景点${index}`, 0.6 - index * 0.01));
  const cities = scoreCatalogCities([...many, match("城0", "次一", 0.55), match("城0", "次二", 0.54), match("城0", "次三", 0.53)]);
  assert.equal(cities.length, 6);
  assert.deepEqual(cities[0].matches.map(({ name }) => name), ["景点0", "次一", "次二"]);
});

test("nothing when even the best match is below 0.5: recommendations search the web instead", () => {
  assert.deepEqual(scoreCatalogCities([match("成都市", "青城山", 0.43)]), []);
  assert.deepEqual(scoreCatalogCities([]), []);
});
