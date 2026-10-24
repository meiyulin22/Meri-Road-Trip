import { normalizePlaceName } from "./photo-catalog";
import { foreignWords, prefectureWords, provinceWords, type RegionWords } from "./photo-regions";

/** The landmark a recommendation card wants a photo of, and where it is. */
export interface RemotePhotoSubject {
  /** 云南省 */
  readonly province: string;
  /** The card's 市 or 州: 丽江市. */
  readonly region: string;
  /** The landmark in Chinese, which becomes the caption: 玉龙雪山. */
  readonly landmark: string;
  /** Its English name, the only words Pixabay searches by: Jade Dragon Snow Mountain. */
  readonly english: string;
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
}

export type MatchVerdict =
  | { readonly accepted: true; readonly matched: readonly string[]; readonly regional: boolean }
  | { readonly accepted: false; readonly reason: "too_small" | "no_identity" | "not_in_china" | "foreign" | "other_province" | "other_region" };

/**
 * Words that describe a kind of place rather than one place. A photo tagged "mountain"
 * is not evidence of being 玉龙雪山: "Mount Emei" once matched Mount Fuji through
 * "mount" alone. Province and prefecture names are left out of identity too — "Dali"
 * says where, not which landmark.
 */
const genericWords = new Set([
  "mount", "mountain", "mountains", "mt", "snow", "snowy", "peak", "peaks", "hill", "hills", "range", "glacier",
  "lake", "lakes", "river", "sea", "bay", "beach", "island", "islands", "waterfall", "falls", "spring", "springs",
  "valley", "gorge", "canyon", "cave", "caves", "forest", "grassland", "grasslands", "prairie", "desert", "wetland",
  "park", "national", "scenic", "area", "spot", "reserve", "nature", "geopark", "geological", "world", "heritage",
  "old", "ancient", "town", "city", "village", "street", "bridge", "tower", "garden", "gardens", "museum",
  "temple", "monastery", "pagoda", "palace", "great", "wall", "west", "east", "north", "south", "the", "and", "of",
  "china", "chinese", "view", "landscape", "travel", "tourism",
]);

const regionWordSet = new Set([...provinceWords, ...prefectureWords].flatMap((region) =>
  region.words.flatMap((phrase) => phrase.split(" "))));

/** A region's own first name (dali, lijiang, yunnan), as opposed to a county or sight inside it (pingyao). */
const primaryRegionWords = new Set([...provinceWords, ...prefectureWords].flatMap((region) =>
  region.words[0].split(" ")));

export function wordsOf(text: string): string[] {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/gu, "").split(/[^a-z0-9]+/u).filter(Boolean);
}

/** Whether `phrase` (one word, or several with single spaces) appears in `words` in order. */
function hasPhrase(words: readonly string[], phrase: string): boolean {
  const parts = phrase.split(" ");
  return words.some((_, start) => parts.every((part, offset) => words[start + offset] === part));
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

function stem(name: string): string {
  return normalizePlaceName(name).replace(/(?:市|州|地区|盟|林区|省|自治区)$/u, "");
}

/** The stored name, or the short one a model or a user writes: 大理州 is 大理白族自治州. */
function sameRegion(full: string, given: string): boolean {
  const name = normalizePlaceName(given);
  if (normalizePlaceName(full) === name) return true;
  const short = stem(given);
  return short.length >= 2 && normalizePlaceName(full).startsWith(short);
}

function mentioned(words: readonly string[], regions: readonly RegionWords[], ignore: ReadonlySet<string>): RegionWords[] {
  return regions.filter((region) => region.words.some((phrase) =>
    !phrase.split(" ").every((part) => ignore.has(part)) && hasPhrase(words, phrase)));
}

/**
 * Whether a hit may be shown as a photo of the subject. Identity first: every
 * distinctive word of the English name must be in the hit's tags or page slug, so
 * "Tiger Leaping Gorge" needs both "tiger" and "leaping". A name made only of kinds and
 * of a region's own name ("West Lake", "Dali Ancient City") needs every word and the
 * region named too. Then any regional word
 * that points elsewhere rules the hit out — a tag naming another province, another
 * prefecture (unless the subject's own prefecture is named too, as a gorge between two
 * is), or a country a lookalike is from — and a hit that does not say it is in China at
 * all (its own province or prefecture, or China itself) is ruled out too. Tags are the uploader's words: this keeps
 * obvious mismatches out, it does not prove where a photo was taken.
 */
export function judgeHit(hit: PixabayHit, subject: RemotePhotoSubject): MatchVerdict {
  if (hit.imageWidth < 960 || hit.imageHeight < 480 || hit.imageWidth < hit.imageHeight) {
    return { accepted: false, reason: "too_small" };
  }
  const words = hitWords(hit);
  const nameWords = wordsOf(subject.english);
  const named = nameWords.filter((word) => word.length >= 3 && !genericWords.has(word));
  const distinctive = named.filter((word) => !regionWordSet.has(word));
  const ownProvince = provinceWords.find((region) => sameRegion(region.name, subject.province)) ?? null;
  const ownPrefecture = prefectureWords.find((region) => sameRegion(region.name, subject.region)) ??
    // A 直辖市's card names the city itself as its region.
    provinceWords.find((region) => sameRegion(region.name, subject.region)) ?? null;
  const own = [ownProvince, ownPrefecture].filter((region): region is RegionWords => region !== null);
  const regional = own.some((region) => region.words.some((phrase) => hasPhrase(words, phrase)));

  // "Pingyao Ancient City" is named after a county, which mostly means the sight; "Dali
  // Ancient City" is named after the whole prefecture, whose photos are as often 洱海.
  const required = distinctive.length > 0 ? distinctive
    : named.some((word) => !primaryRegionWords.has(word)) ? named : null;
  const identified = required !== null
    ? required.every((word) => words.includes(word))
    : nameWords.length > 0 && nameWords.filter((word) => !["the", "and", "of"].includes(word))
      .every((word) => words.includes(word)) && regional;
  if (!identified) return { accepted: false, reason: "no_identity" };

  if (foreignWords.some((phrase) => hasPhrase(words, phrase))) return { accepted: false, reason: "foreign" };
  // The landmark's own name never counts against it: Jiuzhaigou is both a county and the valley.
  const ignore = new Set(nameWords);
  if (mentioned(words, provinceWords, ignore).some((region) => region.name !== ownProvince?.name)) {
    return { accepted: false, reason: "other_province" };
  }
  const prefectures = mentioned(words, prefectureWords, ignore);
  const ownNamed = ownPrefecture !== null && prefectures.some((region) => region.name === ownPrefecture.name);
  if (prefectures.some((region) => region.name !== ownPrefecture?.name) && !ownNamed) {
    return { accepted: false, reason: "other_region" };
  }
  // One English word is weak identity on its own: "Stone Forest" matched Meteora in Greece
  // through "stone" (2026-10-24). A hit must also say it is in China — its own region, or China.
  if (!regional && !words.includes("china") && !words.includes("chinese")) return { accepted: false, reason: "not_in_china" };
  return { accepted: true, matched: required ?? nameWords, regional };
}

/** The hits that may be shown, best first: those that also name the region, then Pixabay's own order. */
export function rankHits(hits: readonly PixabayHit[], subject: RemotePhotoSubject): { hit: PixabayHit; matched: readonly string[] }[] {
  const accepted = hits.flatMap((hit, index) => {
    const verdict = judgeHit(hit, subject);
    return verdict.accepted ? [{ hit, matched: verdict.matched, regional: verdict.regional, index }] : [];
  });
  accepted.sort((left, right) => Number(right.regional) - Number(left.regional) || left.index - right.index);
  return accepted.map(({ hit, matched }) => ({ hit, matched }));
}

/** The words Pixabay is asked for: the English name, then once more with the region to narrow it. */
export function searchVariants(subject: RemotePhotoSubject): readonly string[] {
  const english = subject.english.trim().replace(/\s+/gu, " ");
  const region = prefectureWords.find((item) => sameRegion(item.name, subject.region)) ??
    provinceWords.find((item) => sameRegion(item.name, subject.province));
  const hint = region?.words[0];
  const variants = [english];
  if (hint && !wordsOf(english).includes(hint.split(" ")[0])) variants.push(`${english} ${hint}`);
  return variants.map((value) => value.slice(0, 100));
}
