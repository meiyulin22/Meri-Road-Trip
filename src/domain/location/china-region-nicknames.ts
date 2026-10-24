import type { chinaProvinces } from "./china-destination-scope";

type ChinaProvince = (typeof chinaProvinces)[number];

/**
 * Everyday names for a group of provinces. 江浙沪 is 江苏、浙江、上海 to any Chinese
 * traveller, but to a map search it is only a string, and the first page held a shop of
 * that name in 石家庄, which then matched the user's words exactly.
 *
 * The model decides what such a name means (the conversation model lists the provinces,
 * and region-hint.ts reads the words before any search). This table is only the fallback
 * for when the model cannot answer — no key, a timeout, an unreadable reply — so that a
 * slow model never sends 江浙沪 to the map. When the model did answer, its reading stands.
 *
 * Only names whose provinces nobody disputes belong here. 长三角, 东北 and 西北 are left
 * out on purpose: their extent changes with who is speaking.
 */
const regionNicknames: Readonly<Record<string, readonly ChinaProvince[]>> = {
  江浙沪: ["江苏省", "浙江省", "上海市"],
  苏浙沪: ["江苏省", "浙江省", "上海市"],
  江浙: ["江苏省", "浙江省"],
  京津冀: ["北京市", "天津市", "河北省"],
  京津: ["北京市", "天津市"],
  川渝: ["四川省", "重庆市"],
  云贵川: ["云南省", "贵州省", "四川省"],
  云贵: ["云南省", "贵州省"],
  东三省: ["辽宁省", "吉林省", "黑龙江省"],
  东北三省: ["辽宁省", "吉林省", "黑龙江省"],
  两广: ["广东省", "广西壮族自治区"],
  港澳: ["香港特别行政区", "澳门特别行政区"],
  两湖: ["湖北省", "湖南省"],
};

/** 「江浙沪一带」 and 「江浙沪地区」 name the same provinces as 「江浙沪」. */
const looseEnding = /(?:一带|地区)$/u;

/** The provinces a nickname such as 江浙沪 stands for, or null when the words are not one. */
export function provincesOfRegionNickname(expression: string): readonly ChinaProvince[] | null {
  const name = expression.normalize("NFKC").replace(/\s+/gu, "").replace(looseEnding, "");
  return Object.hasOwn(regionNicknames, name) ? regionNicknames[name] : null;
}
