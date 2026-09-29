/**
 * A recommended place is matched by its written name rather than by an id, because the
 * model writes the names and nothing hands out ids for them. Both normalizers strip
 * only what is presentation: a name and a province mean the same thing whether or not
 * they carry 景区 or 省.
 */
export function normalizeRecommendationName(value: string): string {
  const name = value.normalize("NFKC").replace(/[\s\u200B\u2060]+/gu, "").toLowerCase();
  // Only presentation suffixes: never remove route, peak, or administrative names.
  const base = name.replace(/(?:\((?:风景名胜区|旅游景区|风景区|景区)\)|风景名胜区|旅游景区|风景区|景区)$/u, "");
  return base.length >= 2 ? base : name;
}

export function normalizeRecommendationRegion(value: string): string {
  return value.normalize("NFKC").replace(/[\s\u200B\u2060]+/gu, "").toLowerCase()
    .replace(/(?:省|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区)$/u, "");
}
