import type { CommonsFile, SparqlRow } from "@/platform/place-photos/wikimedia-client";
import {
  landmarkQuery, literal, rankedImages, usageRefusalOf, type LandmarkImage,
} from "@/platform/place-photos/wikimedia-photo-finder";

export interface CatalogPhotoSubject {
  readonly id: string;
  readonly kind: "spot" | "dish";
  readonly name: string;
  readonly aliases: readonly string[];
  readonly province: string;
  readonly prefecture: string;
  readonly county: string | null;
  readonly summary: string;
}

export type RejectionReason = "no_wikidata" | "licence" | "no_author" | "too_small" | "review";
export interface Rejection {
  readonly reason: RejectionReason;
  readonly detail?: string;
}

export interface ManifestEntry {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly author: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly sourceUrl: string;
  readonly wikidata: string;
  readonly fetchedAt: string;
}

interface Candidate {
  readonly image: LandmarkImage;
  readonly file: CommonsFile;
}

const chineseLanguageTags = ["zh", "zh-hans", "zh-hant", "zh-cn", "zh-tw", "zh-hk", "zh-mo", "zh-sg", "zh-my"];

export function photoWidth(kind: CatalogPhotoSubject["kind"]): number {
  return kind === "spot" ? 320 : 200;
}

function landmarkSubject(subject: CatalogPhotoSubject) {
  return { landmark: subject.name, aliases: subject.aliases, province: subject.province, region: subject.prefecture };
}

export function photoQuery(subject: CatalogPhotoSubject): string | null {
  if (subject.kind === "spot") {
    // WDQS v1 can start from the prefecture and traverse its entire P131 tree.
    // Keep the shared identity rules and have Blazegraph walk upwards from exact-name hits.
    return landmarkQuery(landmarkSubject(subject))
      ?.replace("WHERE {", 'WHERE {\n  hint:Query hint:optimizer "None".')
      .replace(/^  \?item wdt:P131\+ \?region\.$/mu, '$&\n  hint:Prior hint:gearing "forward".') ?? null;
  }
  if (!/\p{Script=Han}/u.test(subject.name) || /[\r\n\t]/u.test(subject.name)) return null;
  const names = chineseLanguageTags.map((tag) => `${literal(subject.name)}@${tag}`).join(" ");
  // WDQS v1 otherwise walks backwards from the broad food classes before using exact-name hits.
  return `SELECT DISTINCT ?item ?image ?name ?rank WHERE {
  hint:Query hint:optimizer "None".
  {
    SELECT DISTINCT ?item ?image ?name ?rank WHERE {
      VALUES ?name { ${names} }
      { ?item rdfs:label ?name. BIND(1 AS ?rank) } UNION { ?item skos:altLabel ?name. BIND(2 AS ?rank) }
      ?item wdt:P18 ?image.
    } LIMIT 40
  }
  ?item wdt:P31 ?dishClass.
  VALUES ?foodClass { wd:Q2095 wd:Q746549 }
  ?dishClass wdt:P279* ?foodClass.
  hint:Prior hint:gearing "forward".
  FILTER NOT EXISTS {
    ?item (wdt:P17|wdt:P495) ?country.
    FILTER (?country != wd:Q148)
  }
}`;
}

export function photoCandidates(rows: readonly SparqlRow[], subject: CatalogPhotoSubject): LandmarkImage[] {
  const valid = rows.filter(({ item, image, name }) => {
    if (!/^https?:\/\/www\.wikidata\.org\/entity\/Q[1-9]\d*$/u.test(item ?? "")) return false;
    if (!/^https?:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/[^/]+$/u.test(image ?? "")) return false;
    if (subject.kind === "dish" && name !== subject.name) return false;
    try {
      return !decodeURIComponent(image.split("/").pop() ?? "").includes("|");
    } catch {
      return false;
    }
  });
  return rankedImages(valid, landmarkSubject(subject));
}

export function pickCandidate(images: readonly LandmarkImage[], files: ReadonlyMap<string, CommonsFile>, width: number):
  { readonly candidate: Candidate } | { readonly rejection: Rejection } {
  let rejection: Rejection | undefined;
  for (const image of images) {
    const file = files.get(image.file);
    if (!file) {
      rejection ??= { reason: "review", detail: "missing_commons_file" };
      continue;
    }
    const refusal = usageRefusalOf(file);
    if (refusal === "licence" || refusal === "licence_link") {
      rejection ??= { reason: "licence", detail: refusal };
      continue;
    }
    if (refusal === "no_author") {
      rejection ??= { reason: "no_author" };
      continue;
    }
    if (refusal) {
      rejection ??= { reason: "review", detail: refusal };
      continue;
    }
    if (file.width < width) {
      rejection ??= { reason: "too_small" };
      continue;
    }
    return { candidate: { image, file } };
  }
  return { rejection: rejection ?? { reason: "no_wikidata" } };
}

export function photoFilename(id: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(id)) throw new Error("Invalid catalog photo ID");
  return `${id}.avif`;
}

export function manifestEntry(id: string, { image, file }: Candidate, size: { width: number; height: number },
  fetchedAt: Date): ManifestEntry {
  return {
    file: `/photos/catalog/${photoFilename(id)}`,
    width: size.width,
    height: size.height,
    title: file.title,
    author: file.artist || "Unknown author",
    license: file.license,
    licenseUrl: file.licenseUrl.startsWith("https://") ? file.licenseUrl : file.pageUrl,
    sourceUrl: file.pageUrl,
    wikidata: image.item,
    fetchedAt: fetchedAt.toISOString(),
  };
}
