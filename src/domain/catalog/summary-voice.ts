/**
 * Checks for a catalog summary rewritten in Meri's own voice (B2, 2026-11-27). The old summaries say
 * where a fact came from (「攻略介绍…」「攻略收录…」); the rewrite keeps every fact and drops the
 * attribution. A rewrite that fails any check is not used: the original summary stays.
 *
 * merlin's rules: no 「攻略」, at most 100 characters, no run of 8 characters shared with the guide's
 * own text (local OCR of the cited pages), and the same numbers and place names as the original.
 */

export const maxSummaryLength = 100;
/** The shortest run of Han characters shared with the guide's text that counts as copying. */
export const sourceOverlapChars = 8;

/** The catalog's contact rule (meri-catalog-cn scripts/validate_catalog.py, PRIVATE). */
const contactPattern = /https?:\/\/|\S+@\S+|微信|(?<!\d)1[3-9]\d{9}(?!\d)|0\d{2,3}-\d{7,8}/;

/** Only the Han characters, the form the catalog's OCR overlap check compares. */
export function hanOnly(text: string): string {
  return (text.match(/[㐀-鿿]/g) ?? []).join("");
}

/** The first run of `length` Han characters of `text` found in any of the pages, or null. */
export function sharedRun(text: string, pages: readonly string[], length: number = sourceOverlapChars): string | null {
  const han = hanOnly(text);
  for (let start = 0; start + length <= han.length; start += 1) {
    const run = han.slice(start, start + length);
    if (pages.some((page) => page.includes(run))) {
      return run;
    }
  }
  return null;
}

const arabicNumber = /\d+(?:\.\d+)?/g;
const chineseNumber = /[零〇一二三四五六七八九十百千万两]+/g;

/**
 * Numbers in the text, sorted. A lone 一 is left out: it is mostly a word (一带, 一处), not a count,
 * and a rewrite may drop it without changing a fact.
 */
export function numbersIn(text: string): readonly string[] {
  const arabic = text.match(arabicNumber) ?? [];
  const chinese = (text.match(chineseNumber) ?? []).filter((run) => run !== "一");
  return [...arabic, ...chinese].sort();
}

const ethnicAutonomy = /(?:(?:回|哈萨克|黎|苗|彝|蒙古|白|朝鲜|藏|土家|傣|羌|侗|布依|壮|维吾尔|各)族?)+自治(?:州|县|区|旗)$/;
const adminSuffix = /(?:特别行政区|自治区|地区|林区|新区|省|市|州|盟|县|区|旗)$/;

/** The short name people write: 大理白族自治州 → 大理, 喀什地区 → 喀什, 九江市 → 九江. Null when nothing is left to shorten. */
export function adminStem(name: string): string | null {
  const stem = name.replace(ethnicAutonomy, "").replace(adminSuffix, "");
  return stem.length >= 2 && stem !== name ? stem : null;
}

export type PlaceNameSource = {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly location: { readonly province: string; readonly prefecture: string; readonly county: string | null };
};

/**
 * Every place name the catalog knows: entry names and aliases, and the provinces, prefectures and
 * counties with their short forms. Names shorter than two characters are left out.
 */
export function placeNameVocabulary(entries: readonly PlaceNameSource[]): readonly string[] {
  const names = new Set<string>();
  const add = (name: string | null) => {
    const trimmed = name?.trim();
    if (trimmed && trimmed.length >= 2) names.add(trimmed);
  };
  for (const entry of entries) {
    add(entry.name);
    entry.aliases.forEach(add);
    for (const admin of [entry.location.province, entry.location.prefecture, entry.location.county]) {
      add(admin);
      if (admin) add(adminStem(admin));
    }
  }
  return [...names].sort();
}

export type VoiceRewrite = {
  readonly original: string;
  readonly rewrite: string;
  /**
   * Place names the model says the original holds. Those that are in the original must stay in the
   * rewrite; the rest (the model also lists the entry's own name and city) are ignored, since names
   * the rewrite adds are caught by the vocabulary.
   */
  readonly reportedPlaces: readonly string[];
  /** Han text of the guide pages the entry cites (local OCR). */
  readonly sourcePages: readonly string[];
  readonly vocabulary: readonly string[];
};

const sameList = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

function placeProblems(input: VoiceRewrite): string[] {
  const problems: string[] = [];
  const inOriginal = input.vocabulary.filter((name) => input.original.includes(name));
  const inRewrite = input.vocabulary.filter((name) => input.rewrite.includes(name));
  const missing = inOriginal.filter((name) => !input.rewrite.includes(name));
  const added = inRewrite.filter((name) => !input.original.includes(name));
  if (missing.length > 0) problems.push(`places_missing: ${missing.join("、")}`);
  if (added.length > 0) problems.push(`places_added: ${added.join("、")}`);

  const dropped = input.reportedPlaces.filter((name) => input.original.includes(name) && !input.rewrite.includes(name));
  if (dropped.length > 0) problems.push(`places_missing: ${dropped.join("、")}`);
  return problems;
}

/** Why the rewrite cannot be used; empty when it passes every check. */
export function checkVoiceRewrite(input: VoiceRewrite): readonly string[] {
  const rewrite = input.rewrite.trim();
  if (rewrite.length === 0) return ["empty"];

  const problems: string[] = [];
  if (rewrite.length > maxSummaryLength) problems.push(`too_long: ${rewrite.length}`);
  // 「书中」 is the same attribution in other words; the originals use it now and then.
  if (/攻略|书中/.test(rewrite)) problems.push("mentions_guide");
  if (contactPattern.test(rewrite)) problems.push("contact_details");

  const copied = sharedRun(rewrite, input.sourcePages);
  if (copied) problems.push(`copies_source: ${copied}`);

  // 「两份攻略都提到…」 counts sources, not a fact about the place; that count goes with the attribution.
  const before = numbersIn(input.original.replace(/[\d一二两三四五六七八九十]+份攻略/g, ""));
  const after = numbersIn(rewrite);
  if (!sameList(before, after)) problems.push(`numbers_changed: ${before.join(",") || "-"} → ${after.join(",") || "-"}`);

  return [...problems, ...new Set(placeProblems({ ...input, rewrite }))];
}
