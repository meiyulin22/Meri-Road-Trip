import { normalizePlaceName, parsePixabayArtistUrl } from "./photo-catalog";
import {
  foreignWords,
  foreignWordsZh,
  prefectureWords,
  provinceWords,
  regionShortName,
  type RegionWords,
} from "./photo-regions";

/** The landmark a recommendation card wants a photo of, and where it is. */
export interface RemotePhotoSubject {
  /** 云南省 */
  readonly province: string;
  /** The card's 市 or 州: 丽江市. */
  readonly region: string;
  /** The landmark in Chinese, which becomes the caption and is searched with lang=zh: 玉龙雪山. */
  readonly landmark: string;
  /** Its usual English name, searched with lang=en: Jade Dragon Snow Mountain. Absent on older cards. */
  readonly english?: string;
  /** Other names of the same landmark, English or Chinese: Kuanzhai Alley, 宽窄巷. */
  readonly aliases?: readonly string[];
}

/** The fields of one Pixabay search hit that Meri reads. */
export interface PixabayHit {
  readonly id: number;
  readonly tags: string;
  readonly pageURL: string;
  readonly webformatURL: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly user: string;
  /** Older cached searches did not retain the contributor ID. */
  readonly user_id?: number;
}

/** Pixabay documents profile URLs as /users/{username}-{user_id}/. */
export function pixabayArtistUrl(hit: Pick<PixabayHit, "user" | "user_id">): string | undefined {
  if (!Number.isSafeInteger(hit.user_id) || (hit.user_id ?? 0) <= 0 || !hit.user.trim()) return undefined;
  return parsePixabayArtistUrl(`https://pixabay.com/users/${encodeURIComponent(hit.user.trim())}-${hit.user_id}/`);
}

export type RejectionReason = "too_small" | "no_identity" | "not_in_china" | "foreign" | "other_province" | "other_region";

export type MatchVerdict =
  | { readonly accepted: true; readonly matched: readonly string[]; readonly regional: boolean }
  | { readonly accepted: false; readonly reason: RejectionReason };

/** One Pixabay search: Pixabay translates `q` and returns tags in `lang`. */
export interface SearchVariant {
  readonly q: string;
  readonly lang: "en" | "zh";
}

/**
 * Words that describe a kind of place rather than one place. A photo tagged "mountain"
 * is not evidence of being 玉龙雪山: "Mount Emei" once matched Mount Fuji through
 * "mount" alone. Province and prefecture names are left out of identity too — "Dali"
 * says where, not which landmark. Plurals are folded first, so "alleys" is "alley".
 */
const genericWords = new Set([
  "mount", "mountain", "mt", "snow", "snowy", "peak", "hill", "range", "glacier",
  "lake", "river", "sea", "bay", "beach", "island", "waterfall", "fall", "spring",
  "valley", "gorge", "canyon", "cave", "forest", "grassland", "prairie", "desert", "wetland",
  "park", "national", "scenic", "area", "spot", "reserve", "nature", "geopark", "geological", "world", "heritage",
  "old", "ancient", "town", "city", "village", "street", "alley", "lane", "bridge", "tower", "garden", "museum",
  "temple", "monastery", "pagoda", "palace", "great", "wall", "west", "east", "north", "south", "the", "and", "of",
  "china", "chinese", "view", "landscape", "travel", "tourism", "tropical", "botanical", "research", "base",
]);

const cjk = /[\u3400-\u9fff]/u;

/** "alleys" → "alley", "falls" → "fall"; "pass" and short words stay as they are. */
function singular(word: string): string {
  if (word.length <= 3 || word.endsWith("ss")) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  return word.endsWith("s") ? word.slice(0, -1) : word;
}

const allRegions = [...provinceWords, ...prefectureWords];
const regionWordSet = new Set(allRegions.flatMap((region) => region.words.flatMap((phrase) => phrase.split(" ").map(singular))));

/** A region's own first name (dali, lijiang, yunnan), as opposed to a county or sight inside it (pingyao). */
const primaryRegionWords = new Set(allRegions.map((region) => singular(region.words[0].split(" ")[0])));

export function wordsOf(text: string): string[] {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/gu, "").split(/[^a-z0-9]+/u)
    .filter(Boolean).map(singular);
}

/** Whether `phrase` (one word, or several with single spaces) appears in `words` in order. */
function hasPhrase(words: readonly string[], phrase: string): boolean {
  const parts = phrase.split(" ").map(singular);
  return words.some((_, start) => parts.every((part, offset) => words[start + offset] === part));
}

interface HitText {
  /** English words of the tags and the page slug. */
  readonly words: readonly string[];
  /**
   * The Chinese of the tags run together, so a landmark's name split over two tags
   * (宽窄, 巷子) still reads 宽窄巷子. Only the landmark's identity is read from it.
   */
  readonly chinese: string;
  /**
   * The Chinese of each tag on its own. Regions and foreign places are read from these:
   * run together, 玄武湖, 南京 contains 湖南 and would name the wrong province.
   */
  readonly chineseTags: readonly string[];
}

/** The words of a hit: its tags, and the slug of its page (/photos/dali-cangshan-erhai-lake-1804795/). */
export function hitWords(hit: Pick<PixabayHit, "tags" | "pageURL">): string[] {
  let slug = "";
  try {
    slug = new URL(hit.pageURL).pathname.split("/").filter(Boolean).at(-1)?.replace(/-\d+$/u, "") ?? "";
  } catch {
    // An unreadable page URL gives no words; the tags still count.
  }
  return [...wordsOf(hit.tags), ...wordsOf(slug)];
}

function textOf(hit: PixabayHit): HitText {
  const chineseTags = hit.tags.normalize("NFKC").split(/[,，、]/u)
    .map((tag) => (tag.match(/[\u3400-\u9fff]+/gu) ?? []).join("")).filter(Boolean);
  return { words: hitWords(hit), chinese: chineseTags.join(""), chineseTags };
}

function inATag(text: HitText, name: string): boolean {
  return text.chineseTags.some((tag) => tag.includes(name));
}

/** The stored name, or the short one a model or a user writes: 大理州 is 大理白族自治州. */
function sameRegion(full: string, given: string): boolean {
  const name = normalizePlaceName(given);
  if (normalizePlaceName(full) === name) return true;
  const short = regionShortName(given);
  return short.length >= 2 && regionShortName(full) === short;
}

function names(region: RegionWords): { readonly english: readonly string[]; readonly chinese: string } {
  return { english: region.words, chinese: regionShortName(region.name) };
}

function mentions(text: HitText, region: RegionWords, ignoreWords: ReadonlySet<string>, ignoreChinese: readonly string[]): boolean {
  const { english, chinese } = names(region);
  if (english.some((phrase) => !phrase.split(" ").every((part) => ignoreWords.has(singular(part))) && hasPhrase(text.words, phrase))) {
    return true;
  }
  return chinese.length >= 2 && !ignoreChinese.some((name) => name.includes(chinese)) && inATag(text, chinese);
}

const regionShortNames = new Set(allRegions.map((region) => regionShortName(region.name)));

/**
 * Whether a model-offered alias says which landmark at all. "四川" or "Chengdu" names a
 * region, and "Sichuan China" only a region and kinds: as aliases they would let
 * 四川, 中国, 火锅 pass as the landmark. The landmark's own name may still be a region's
 * (黄山 is both the city and the mountain); only aliases are held to this.
 */
function identifiesALandmark(alias: string, subject: RemotePhotoSubject): boolean {
  if (cjk.test(alias)) {
    const chinese = alias.normalize("NFKC").replace(/[^\u3400-\u9fff]/gu, "");
    const short = regionShortName(chinese);
    return chinese.length >= 2 && chinese !== "中国" && !regionShortNames.has(chinese) && !regionShortNames.has(short) &&
      short !== regionShortName(subject.region) && short !== regionShortName(subject.province);
  }
  return wordsOf(alias).some((word) => word.length >= 3 && !genericWords.has(word) && !regionWordSet.has(word));
}

/** What one English name needs from a hit, or null when it says nothing about which landmark. */
function englishRequirement(name: string): { words: readonly string[]; needsRegion: boolean } | null {
  const all = wordsOf(name);
  const named = all.filter((word) => word.length >= 3 && !genericWords.has(word));
  const distinctive = named.filter((word) => !regionWordSet.has(word));
  if (distinctive.length > 0) return { words: distinctive, needsRegion: false };
  // "Pingyao Ancient City" is named after a county, which mostly means the sight; "Dali
  // Ancient City" is named after the whole prefecture, whose photos are as often 洱海.
  if (named.some((word) => !primaryRegionWords.has(word))) return { words: named, needsRegion: false };
  const words = all.filter((word) => !["the", "and", "of"].includes(word));
  return words.length > 0 ? { words, needsRegion: true } : null;
}

/**
 * Whether a hit may be shown as a photo of the subject. Identity first: one of the
 * landmark's names must be in the hit — every distinctive word of an English name
 * ("Tiger Leaping Gorge" needs "tiger" and "leaping"; a name made only of kinds and a
 * region's own name, like "West Lake", needs every word and the region too), or a
 * Chinese name in the Chinese tags. Then anything pointing elsewhere rules it out —
 * another province, another prefecture (unless the subject's own is named too, as a
 * gorge between two is), or a country a lookalike is from — and a hit that never says
 * it is in China (its own province or prefecture, China or 中国) is ruled out too.
 * Tags are the uploader's words: this keeps obvious mismatches out, it does not prove
 * where a photo was taken.
 */
export function judgeHit(hit: PixabayHit, subject: RemotePhotoSubject): MatchVerdict {
  if (hit.imageWidth < 960 || hit.imageHeight < 480 || hit.imageWidth < hit.imageHeight) {
    return { accepted: false, reason: "too_small" };
  }
  const text = textOf(hit);
  const ownProvince = provinceWords.find((region) => sameRegion(region.name, subject.province)) ?? null;
  const ownPrefecture = prefectureWords.find((region) => sameRegion(region.name, subject.region)) ??
    // A 直辖市's card names the city itself as its region.
    provinceWords.find((region) => sameRegion(region.name, subject.region)) ?? null;
  const ownChinese = [regionShortName(subject.province), regionShortName(subject.region)].filter((name) => name.length >= 2);
  const regional = [ownProvince, ownPrefecture].some((region) => region !== null &&
    region.words.some((phrase) => hasPhrase(text.words, phrase))) || ownChinese.some((name) => inATag(text, name));

  const mainNames = [subject.english, subject.landmark].filter((name): name is string => typeof name === "string" && name.trim() !== "");
  const aliases = (subject.aliases ?? []).filter((name) => name.trim() !== "" && identifiesALandmark(name, subject));
  const allNames = [...mainNames, ...aliases];
  let matched: readonly string[] | null = null;
  for (const name of allNames) {
    // An alias the model offered may be a generic phrase (热带植物园, 茶马古道) that another
    // place shares, so identity through an alias also needs the photo to name the region.
    const viaAlias = !mainNames.includes(name);
    if (cjk.test(name)) {
      const chinese = name.normalize("NFKC").replace(/[^\u3400-\u9fff]/gu, "");
      if (chinese.length >= 2 && text.chinese.includes(chinese) && (!viaAlias || regional)) { matched = [chinese]; break; }
      continue;
    }
    const requirement = englishRequirement(name);
    if (requirement && requirement.words.every((word) => text.words.includes(word)) &&
      (!(requirement.needsRegion || viaAlias) || regional)) {
      matched = requirement.words;
      break;
    }
  }
  if (!matched) return { accepted: false, reason: "no_identity" };

  if (foreignWords.some((phrase) => hasPhrase(text.words, phrase)) || foreignWordsZh.some((word) => inATag(text, word))) {
    return { accepted: false, reason: "foreign" };
  }
  // The landmark's own names never count against it: Jiuzhaigou is both a county and the valley.
  const ignoreWords = new Set(allNames.filter((name) => !cjk.test(name)).flatMap(wordsOf));
  const ignoreChinese = allNames.filter((name) => cjk.test(name));
  if (provinceWords.some((region) => region.name !== ownProvince?.name && mentions(text, region, ignoreWords, ignoreChinese))) {
    return { accepted: false, reason: "other_province" };
  }
  const prefectures = prefectureWords.filter((region) => mentions(text, region, ignoreWords, ignoreChinese));
  const ownNamed = ownPrefecture !== null && prefectures.some((region) => region.name === ownPrefecture.name);
  if (prefectures.some((region) => region.name !== ownPrefecture?.name) && !ownNamed) {
    return { accepted: false, reason: "other_region" };
  }
  // One English word is weak identity on its own: "Stone Forest" matched Meteora in Greece
  // through "stone" (2026-10-24). A hit must also say it is in China — its own region, or China.
  if (!regional && !text.words.includes("china") && !text.words.includes("chinese") && !inATag(text, "中国")) {
    return { accepted: false, reason: "not_in_china" };
  }
  return { accepted: true, matched, regional };
}

export interface HitAssessment {
  /** The hits that may be shown, best first: those that also name the region, then Pixabay's own order. */
  readonly accepted: readonly { readonly hit: PixabayHit; readonly matched: readonly string[] }[];
  /** Why the others were not, counted, for the log and the misses list. */
  readonly rejected: Readonly<Partial<Record<RejectionReason, number>>>;
}

export function assessHits(hits: readonly PixabayHit[], subject: RemotePhotoSubject): HitAssessment {
  const rejected: Partial<Record<RejectionReason, number>> = {};
  const accepted = hits.flatMap((hit, index) => {
    const verdict = judgeHit(hit, subject);
    if (verdict.accepted) return [{ hit, matched: verdict.matched, regional: verdict.regional, index }];
    rejected[verdict.reason] = (rejected[verdict.reason] ?? 0) + 1;
    return [];
  });
  accepted.sort((left, right) => Number(right.regional) - Number(left.regional) || left.index - right.index);
  return { accepted: accepted.map(({ hit, matched }) => ({ hit, matched })), rejected };
}

/** The hits that may be shown, best first. */
export function rankHits(hits: readonly PixabayHit[], subject: RemotePhotoSubject): HitAssessment["accepted"] {
  return assessHits(hits, subject).accepted;
}

/** Most searches one landmark may cost. */
export const maxSearchesPerLandmark = 3;

/**
 * What Pixabay is asked, in order, at most three: the English name, the Chinese name
 * (Pixabay searches Chinese too, and answers with Chinese tags — the one real 宽窄巷子
 * photo is tagged 宽窄, 巷子 in Chinese but "width, alley" in English), then another
 * name of the landmark, or else the English name with the region to narrow it.
 */
export function searchVariants(subject: RemotePhotoSubject): readonly SearchVariant[] {
  const variants: SearchVariant[] = [];
  const add = (q: string | undefined) => {
    const query = q?.trim().replace(/\s+/gu, " ").slice(0, 100);
    if (!query) return;
    const lang = cjk.test(query) ? "zh" : "en";
    if (!variants.some((variant) => variant.q.toLowerCase() === query.toLowerCase() && variant.lang === lang)) {
      variants.push({ q: query, lang });
    }
  };
  add(subject.english);
  add(subject.landmark);
  const alias = subject.aliases?.find((name) => !variants.some((variant) => variant.q.toLowerCase() === name.trim().toLowerCase()));
  if (alias) add(alias);
  else if (subject.english) {
    const region = prefectureWords.find((item) => sameRegion(item.name, subject.region)) ??
      provinceWords.find((item) => sameRegion(item.name, subject.province));
    const hint = region?.words[0];
    if (hint && !wordsOf(subject.english).includes(singular(hint.split(" ")[0]))) add(`${subject.english} ${hint}`);
  }
  return variants.slice(0, maxSearchesPerLandmark);
}
