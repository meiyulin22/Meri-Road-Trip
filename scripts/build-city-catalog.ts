/**
 * 给图集按城市补代表图，分两步，中间人工审核：
 *
 *   npx tsx scripts/build-city-catalog.ts fetch south
 *     两个图源都抓（1.0638 起），审核页上 Pixabay 的候选排前面：Pixabay 的照片通常更好看，
 *     地点对就优先用；Wikidata 的地点确定，放在旁边对照，Pixabay 没有或不对时用它。
 *     Wikidata（1.0634 起）：每个城市 1 次查询，找名字是这座城市或它的景点、并且按维基
 *     自己的"位于"关系（P131）落在这座城市里（城市又属于它的省）的条目，取它们的代表图（P18）；
 *     再从 Wikimedia Commons 读作者和许可证（每 50 个文件 1 次），只留 CC BY / CC BY-SA / CC0 /
 *     公有领域的照片，下载 500px 副本（竖图也留着，审核页标出来，由人决定）。每城最多 4 张候选。Pixabay：每城最多 3 张
 *     （先搜景点中文名、英文名，还没有才搜城市名，用运行时同一套规则过滤）。
 *     候选下载到 .cache/catalog-review/<批次>/，生成 review.html。不碰 public/photos。
 *     Commons 的图是知识共享许可：图集记下作者、许可证和链接，卡片署名经确认后打开原图页。
 *
 *   npx tsx scripts/build-city-catalog.ts fetch jiangzhehu --views 苏州市,绍兴市
 *     城市景色模式（只用 Pixabay）：只给列出的城市找"能代表这座城市"的照片（天际线、街道、
 *     普通建筑都行，不必是名胜），搜城市中文名和英文名，每城最多 4 张候选。
 *
 *   npx tsx scripts/build-city-catalog.ts review north
 *     不联网，按已下载的候选重新生成 review.html（Wikidata 和 Pixabay 的候选都在内）。图片直接嵌在
 *     页面里，单独打开这个文件也看得到。
 *
 *   npx tsx scripts/build-city-catalog.ts apply jiangzhehu picks.json
 *     picks.json 是人工看图后挑好的：{ "南通市": { "id": 4251603, "caption": "狼山", "slug": "langshan",
 *     "note": "狼山塔倒影" }, ... }。caption 是照片里实际拍到的地方（tags 只写城市时就写城市），
 *     slug 是文件名的英文部分。把选中的文件复制进 public/photos，登记到 photos.json：
 *     条目名即 caption，regions / scenicFor 填城市全称和简称。
 *
 * 请求走产品自己的客户端：WikimediaClient（不需要 key，最多同时 2 个、任意 60 秒不超过 40 次），
 * PixabayClient（一次一个、任意 60 秒不超过 80 次，Pixabay 上限 100）。Pixabay 搜索结果缓存
 * 24 小时（.cache/catalog-review/store/）。不输出密钥和带密钥的 URL。
 */
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { readImageFacts } from "../src/platform/place-photos/image-file";
import { MediaPhotoStore } from "../src/platform/place-photos/media-photo-store";
import { PixabayClient } from "../src/platform/place-photos/pixabay-client";
import { judgeHit, pixabayArtistUrl, type PixabayHit, type RemotePhotoSubject } from "../src/platform/place-photos/pixabay-photo-match";
import { parsePhotoCatalog, parsePixabayArtistUrl, type CatalogEntry } from "../src/platform/place-photos/photo-catalog";
import { WikimediaClient, type CommonsFile } from "../src/platform/place-photos/wikimedia-client";
import { chineseLiterals, literal, usageRefusalOf } from "../src/platform/place-photos/wikimedia-photo-finder";

import { catalogBatches, type CatalogBatch, type CatalogCity } from "./catalog-cities";

const reviewRoot = join(process.cwd(), ".cache", "catalog-review");
const photosDirectory = join(process.cwd(), "public", "photos");
const catalogPath = join(photosDirectory, "photos.json");
const candidatesPerCity = 3;
const wikimediaCandidatesPerCity = 4;
const viewCandidatesPerCity = 4;
const minuteMs = 61_000;

/**
 * A batch script can wait out the minute instead of giving up: when our own limiter (or
 * Pixabay's 429) says the minute is spent, wait once and try again; a second refusal stops.
 */
async function patiently<T extends { ok: boolean; failure?: string }>(request: () => Promise<T>): Promise<T> {
  const first = await request();
  if (first.ok || first.failure !== "rate_limited") return first;
  console.log("  （这一分钟的请求数到了，等 61 秒）");
  await new Promise((resolve) => setTimeout(resolve, minuteMs));
  return request();
}
const searchesPerCity = 4;

/** One candidate kept for review: who took it, which landmark it showed, and the file. */
interface Candidate {
  /** The Pixabay image ID, or the Commons page ID. */
  readonly id: number;
  /** Absent is Pixabay. */
  readonly source?: "wikimedia";
  readonly license?: string;
  readonly licenseUrl?: string;
  /** The landmark the photo was accepted as (its caption), or the city when only the city matched. */
  readonly shows: string;
  readonly kind: "landmark" | "city";
  readonly query: string;
  readonly artist: string;
  readonly artistUrl?: string;
  readonly pageUrl: string;
  readonly tags: string;
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

interface CityCandidates {
  readonly city: CatalogCity;
  readonly candidates: readonly Candidate[];
  readonly searches: readonly string[];
}

function batchOf(id: string): CatalogBatch {
  const batch = catalogBatches.find((item) => item.id === id);
  if (!batch) throw new Error(`没有这个批次：${id}；可用：${catalogBatches.map((item) => item.id).join(", ")}`);
  return batch;
}

function slugOf(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/gu, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

async function readCatalog(): Promise<Record<string, CatalogEntry>> {
  try {
    return { ...parsePhotoCatalog(JSON.parse(await readFile(catalogPath, "utf8")) as unknown) };
  } catch {
    return {};
  }
}

function hasRepresentative(catalog: Record<string, CatalogEntry>, city: CatalogCity): boolean {
  return Object.values(catalog).some((entry) => entry.scenicFor.includes(city.name) || entry.scenicFor.includes(city.short));
}

async function fetchBatch(batch: CatalogBatch, views: ReadonlySet<string> | null = null): Promise<void> {
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (views && !key) throw new Error("未配置 PIXABAY_API_KEY");
  const catalogBefore = await readCatalog();
  const wikimedia = views ? null
    : await fetchWikimedia(batch, batch.cities.filter((city) => !hasRepresentative(catalogBefore, city)));
  let searches = 0;
  let downloads = 0;
  const counting = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/api/") searches += 1; else downloads += 1;
    return fetch(input, init);
  }) as typeof fetch;
  const client = new PixabayClient({ key: key ?? "", fetcher: counting });
  const store = new MediaPhotoStore(join(reviewRoot, "store"));
  const catalog = await readCatalog();
  const results: CityCandidates[] = [];

  for (const city of batch.cities) {
    if (views && !views.has(city.name)) continue;
    if (hasRepresentative(catalog, city)) {
      console.log(`${city.name}: 图集已有代表图，跳过`);
      continue;
    }
    const fromWikidata = wikimedia?.get(city.name);
    if (!key) {
      results.push(fromWikidata ?? { city, candidates: [], searches: [] });
      console.log(`${city.name}: Wikidata ${fromWikidata?.candidates.length ?? 0} 张候选；未配置 PIXABAY_API_KEY，不查 Pixabay`);
      continue;
    }
    const plans: { query: string; lang: "zh" | "en"; subject: RemotePhotoSubject; kind: Candidate["kind"] }[] = [];
    const cityView = { province: city.province, region: city.name, landmark: city.short, ...(city.en ? { english: city.en } : {}) };
    if (views) {
      plans.push({ query: city.short, lang: "zh", subject: cityView, kind: "city" });
      if (city.en) plans.push({ query: city.en, lang: "en", subject: cityView, kind: "city" });
    }
    for (const landmark of views ? [] : city.landmarks) {
      const subject = { province: city.province, region: city.name, landmark: landmark.zh, english: landmark.en };
      plans.push({ query: landmark.zh, lang: "zh", subject, kind: "landmark" });
      plans.push({ query: landmark.en, lang: "en", subject, kind: "landmark" });
    }
    // The city's own name last, and only when no landmark found anything: its photos are a
    // view of the city, captioned with the city, and need the closest look in review.
    if (!views) plans.push({ query: city.short, lang: "zh", subject: cityView, kind: "city" });

    const accepted: { hit: PixabayHit; plan: (typeof plans)[number] }[] = [];
    const asked: string[] = [];
    const wanted = views ? viewCandidatesPerCity : candidatesPerCity;
    for (const plan of plans) {
      if (accepted.length >= wanted) break;
      // The city's own name is always tried when no landmark found anything, past the landmark budget.
      if (!views && (plan.kind === "city" ? accepted.length > 0 : asked.length >= searchesPerCity)) continue;
      const parameters = new URLSearchParams({ q: plan.query, lang: plan.lang, image_type: "photo",
        orientation: "horizontal", safesearch: "true", per_page: "50" }).toString();
      let hits = await store.readSearch(parameters, Date.now());
      if (!hits) {
        let outcome = await patiently(() => client.search(new URLSearchParams(parameters)));
        if (!outcome.ok && outcome.failure === "transient") {
          // One dropped search (庆阳「西峰区」, 2026-10-25) should not stop the other cities: wait and ask once more.
          await new Promise((resolve) => setTimeout(resolve, 5_000));
          outcome = await patiently(() => client.search(new URLSearchParams(parameters)));
        }
        if (!outcome.ok && outcome.failure !== "transient") {
          throw new Error(`${city.name}「${plan.query}」搜索失败：${outcome.failure}，本批停止`);
        }
        if (!outcome.ok) {
          asked.push(`${plan.query} [${plan.lang}] 没有回答，跳过`);
          continue;
        }
        hits = outcome.hits;
        await store.writeSearch(parameters, hits, Date.now());
      }
      asked.push(`${plan.query} [${plan.lang}] ${hits.length} 条`);
      for (const hit of hits) {
        if (accepted.length >= wanted) break;
        if (accepted.some((item) => item.hit.id === hit.id)) continue;
        if (judgeHit(hit, plan.subject).accepted) accepted.push({ hit, plan });
      }
    }

    const directory = join(reviewRoot, batch.id, city.name);
    await mkdir(directory, { recursive: true });
    const candidates: Candidate[] = [];
    const kept = new Set(await readdir(directory));
    for (const { hit, plan } of accepted) {
      const artistUrl = pixabayArtistUrl(hit);
      // A candidate already downloaded by an earlier run is reused, not fetched again.
      const earlier = [...kept].find((name) => name.startsWith(`${hit.id}.`));
      if (earlier) {
        const body = new Uint8Array(await readFile(join(directory, earlier)));
        const facts = readImageFacts(body);
        if (facts) {
          candidates.push({ id: hit.id, shows: plan.subject.landmark, kind: plan.kind, query: `${plan.query} [${plan.lang}]`,
            ...(artistUrl ? { artistUrl } : {}),
            artist: hit.user, pageUrl: hit.pageURL, tags: hit.tags, file: earlier, width: facts.width, height: facts.height,
            bytes: body.byteLength });
          continue;
        }
      }
      const downloaded = await patiently(() => client.download(hit.webformatURL));
      if (!downloaded.ok) {
        if (downloaded.failure === "rate_limited" || downloaded.failure === "refused") {
          throw new Error(`${city.name} 下载被拒：${downloaded.failure}，本批停止`);
        }
        continue;
      }
      const facts = readImageFacts(downloaded.body);
      if (!facts || facts.width < 480 || facts.height < 320) continue;
      const file = `${hit.id}.${facts.format}`;
      await writeFile(join(directory, file), downloaded.body);
      candidates.push({ id: hit.id, shows: plan.subject.landmark, kind: plan.kind, query: `${plan.query} [${plan.lang}]`,
        ...(artistUrl ? { artistUrl } : {}),
        artist: hit.user, pageUrl: hit.pageURL, tags: hit.tags, file, width: facts.width, height: facts.height,
        bytes: downloaded.body.byteLength });
    }
    await writeFile(join(directory, "candidates.json"), `${JSON.stringify({ city, searches: asked, candidates }, null, 1)}\n`);
    // Pixabay first on the page: its photos are usually the better-looking ones, and are taken
    // when the place is right; Wikidata's, certain of the place, are beside them for comparison.
    results.push({ city, candidates: [...candidates, ...(fromWikidata?.candidates ?? [])],
      searches: [...asked, ...(fromWikidata?.searches ?? [])] });
    console.log(`${city.name}: Pixabay ${candidates.length} 张${fromWikidata ? `，Wikidata ${fromWikidata.candidates.length} 张` : ""}（${asked.join("；")}）`);
  }

  await writeFile(join(reviewRoot, batch.id, views ? "review-views.html" : "review.html"), await reviewPage(batch, results));
  const covered = results.filter((item) => item.candidates.length > 0).length;
  console.log(`\n${covered}/${results.length} 个城市有候选。Pixabay 请求：搜索 ${searches} 次，下载 ${downloads} 次。`);
  console.log(`审核页：${join(reviewRoot, batch.id, views ? "review-views.html" : "review.html")}`);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char] ?? char);
}

/**
 * The review page carries every image inside it (data: URLs, ~50 KB each): a viewer that
 * opens the file on its own — the desktop app's file pane — does not load files next to it,
 * so relative links showed empty frames (2026-10-24).
 */
async function reviewPage(batch: CatalogBatch, results: readonly CityCandidates[]): Promise<string> {
  const images = new Map<string, string>();
  for (const { city, candidates } of results) {
    for (const item of candidates) {
      const body = await readFile(join(reviewRoot, batch.id, city.name, item.file));
      const type = item.file.endsWith(".png") ? "image/png" : item.file.endsWith(".webp") ? "image/webp" : "image/jpeg";
      images.set(`${city.name}/${item.file}`, `data:${type};base64,${body.toString("base64")}`);
    }
  }
  // A candidate already in the catalog is marked with its entry, so a batch applied earlier can be checked.
  const chosen = new Map(Object.entries(await readCatalog()).map(([name, entry]) => [entry.pageUrl, name]));
  const rows = results.map(({ city, candidates, searches }) => `
<section>
  <h2>${escapeHtml(city.name)} <small>${escapeHtml(city.province)}</small></h2>
  <p class="meta">${escapeHtml(searches.join("；"))}</p>
  <div class="row">${candidates.length === 0 ? "<p class=\"none\">没有合格候选</p>" : candidates.map((item) => `
    <figure>
      <img src="${images.get(`${city.name}/${item.file}`) ?? ""}" alt="">
      <figcaption>${chosen.has(item.pageUrl) ? `<span class="chosen">✓ 已选：${escapeHtml(chosen.get(item.pageUrl) ?? "")}</span><br>` : ""}<b>${item.id}</b> ${escapeHtml(item.shows)}${item.kind === "city" ? "（城市图）" : ""}${item.source === "wikimedia" ? ` · Wikimedia ${escapeHtml(item.license ?? "")}` : ""}<br>
        ${escapeHtml(item.artist)} · ${item.width}×${item.height} · ${Math.round(item.bytes / 1024)} KB<br>
        <a href="${escapeHtml(item.pageUrl)}">${item.source === "wikimedia" ? "Commons" : "Pixabay"} 原图页</a><br><span class="tags">${escapeHtml(item.tags)}</span></figcaption>
    </figure>`).join("")}</div>
</section>`).join("");
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>图集候选 ${escapeHtml(batch.id)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:16px;background:#fafaf7;color:#222}section{margin:0 0 28px}
h2{font-size:18px;margin:0 0 4px}small{color:#777;font-weight:normal}.meta{color:#777;margin:0 0 8px}.row{display:flex;gap:12px;flex-wrap:wrap}
figure{margin:0;width:320px}img{width:320px;aspect-ratio:4/3;object-fit:cover;border-radius:6px;display:block}
figcaption{font-size:12px;margin-top:4px}.tags{color:#888}.none{color:#b44}.chosen{color:#2d7a46;font-weight:bold}</style></head><body>
<h1>图集候选：${escapeHtml(batch.id)}</h1>${rows}</body></html>\n`;
}

async function applyPicks(batch: CatalogBatch, picksPath: string): Promise<void> {
  const picks = JSON.parse(await readFile(picksPath, "utf8")) as Record<string, { id: number; caption: string; slug: string }>;
  const catalog = await readCatalog();
  const before = Object.keys(catalog).length;
  const today = new Date().toISOString().slice(0, 10);
  for (const [cityName, { id, caption, slug }] of Object.entries(picks)) {
    const city = batch.cities.find((item) => item.name === cityName);
    if (!city) throw new Error(`批次里没有 ${cityName}`);
    if (hasRepresentative(catalog, city)) throw new Error(`${cityName} 已有代表图`);
    const directory = join(reviewRoot, batch.id, city.name);
    const reviewed: Candidate[] = [];
    for (const list of ["candidates.json", "candidates-wikimedia.json"]) {
      try {
        reviewed.push(...(JSON.parse(await readFile(join(directory, list), "utf8")) as { candidates: Candidate[] }).candidates);
      } catch {
        // A city may have only one of the two lists.
      }
    }
    const chosen = reviewed.find((item) => item.id === id);
    if (!chosen) throw new Error(`${cityName} 的候选里没有 ${id}`);
    const name = caption.trim();
    if (!name || name.length > 30) throw new Error(`${cityName} 的 caption 不合法`);
    if (catalog[name]) throw new Error(`图集里已有「${name}」，换一个条目名`);
    const file = `${slugOf(slug)}-${chosen.id}.${chosen.file.split(".").pop()}`;
    if (!/^[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp)$/u.test(file)) throw new Error(`${cityName} 的文件名不合法：${file}`);
    await copyFile(join(directory, chosen.file), join(photosDirectory, file));
    const artistUrl = chosen.source === "wikimedia" ? undefined : parsePixabayArtistUrl(chosen.artistUrl);
    catalog[name] = { file, artist: chosen.artist, ...(artistUrl ? { artistUrl } : {}), pageUrl: chosen.pageUrl, fetchedAt: today, aliases: [],
      regions: [city.name, city.short], scenicFor: [city.name, city.short],
      ...(chosen.source === "wikimedia" && chosen.license && chosen.licenseUrl
        ? { source: "wikimedia" as const, license: chosen.license, licenseUrl: chosen.licenseUrl } : {}) };
    console.log(`${cityName} ← ${name}（${file}）`);
  }
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 1)}\n`);
  const after = Object.keys(parsePhotoCatalog(JSON.parse(await readFile(catalogPath, "utf8")) as unknown)).length;
  if (after !== Object.keys(catalog).length) throw new Error("写入后有条目没通过图集校验");
  console.log(`\n图集 ${before} → ${after} 条。`);
}

/**
 * The images Wikidata gives for a city and its landmarks: items labelled with the city's
 * name or a landmark's (Chinese, English or alias), with an image (P18), lying in the city
 * by the "located in" chain (P131, zero or more steps, so the city's own item counts),
 * the city itself under its province. Chinese names are asked in every tag Wikidata uses
 * (zh, zh-hans, zh-cn): 镇江市 has no plain zh label, and asking @zh alone missed it.
 */
function cityQuery(city: CatalogCity): string {
  const names = [chineseLiterals([city.name, city.short, ...city.landmarks.map((landmark) => landmark.zh)]),
    ...city.landmarks.map((landmark) => `${literal(landmark.en)}@en`)].join(" ");
  // A 直辖市 has no province to pin it; "in China" (P17 = Q148) at least keeps out the moon
  // crater named 天津 that Wikidata also labels 天津 (found in the 1.0635 north batch).
  const municipality = city.name === city.province;
  const province = municipality ? "?region wdt:P17 wd:Q148."
    : `?region wdt:P131 ?province. VALUES ?provinceName { ${chineseLiterals([city.province])} } ?province rdfs:label ?provinceName.`;
  return `SELECT DISTINCT ?item ?image ?name WHERE {
  VALUES ?name { ${names} }
  { ?item rdfs:label ?name } UNION { ?item skos:altLabel ?name }
  ?item wdt:P18 ?image.
  VALUES ?regionName { ${chineseLiterals([city.name, city.short])} }
  ?region rdfs:label ?regionName.
  ${province}
  ?item wdt:P131* ?region.
} LIMIT 40`;
}

interface WikidataImage {
  readonly file: string;
  readonly item: string;
  readonly shows: string;
  readonly kind: Candidate["kind"];
}

/** City first (its own image is usually the editors' pick for it), then each landmark in order; one image per item. */
function imagesOfCity(city: CatalogCity, rows: readonly Record<string, string>[]): WikidataImage[] {
  const showsOf = (name: string): { shows: string; kind: Candidate["kind"]; order: number } | null => {
    if (name === city.name || name === city.short) return { shows: city.short, kind: "city", order: 0 };
    const index = city.landmarks.findIndex((landmark) => landmark.zh === name || landmark.en === name);
    return index < 0 ? null : { shows: city.landmarks[index].zh, kind: "landmark", order: index + 1 };
  };
  const images = rows.flatMap((row) => {
    const item = /\/entity\/(Q\d+)$/u.exec(row.item ?? "")?.[1];
    const meaning = showsOf(row.name ?? "");
    const file = row.image ? decodeURIComponent(row.image.split("/").pop() ?? "") : "";
    return item && meaning && file ? [{ file, item, ...meaning }] : [];
  }).sort((left, right) => left.order - right.order || Number(left.item.slice(1)) - Number(right.item.slice(1)));
  const seenItems = new Set<string>();
  const seenFiles = new Set<string>();
  return images.filter((image) => {
    if (seenItems.has(image.item) || seenFiles.has(image.file)) return false;
    seenItems.add(image.item);
    seenFiles.add(image.file);
    return true;
  }).map(({ file, item, shows, kind }) => ({ file, item, shows, kind }));
}

/** Candidates from Wikidata and Commons for each city still without a representative. */
async function fetchWikimedia(batch: CatalogBatch, cities: readonly CatalogCity[]): Promise<Map<string, CityCandidates>> {
  let queries = 0;
  let infos = 0;
  let downloads = 0;
  // A batch can wait longer than a card can: 30 seconds a query instead of the runtime's 10.
  const client = new WikimediaClient({ queryTimeoutMs: 30_000 });
  const found = new Map<string, WikidataImage[]>();
  const failed = new Set<string>();
  for (const city of cities) {
    queries += 1;
    let answer = await patiently(() => client.query(cityQuery(city)));
    if (!answer.ok && answer.failure === "transient") {
      // One slow or dropped query (安阳, 2026-10-24) should not stop the other cities: wait and ask once more.
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      queries += 1;
      answer = await patiently(() => client.query(cityQuery(city)));
    }
    if (!answer.ok && answer.failure !== "transient") throw new Error(`${city.name} 的 Wikidata 查询失败：${answer.failure}，本批停止`);
    if (!answer.ok) {
      console.log(`${city.name}: Wikidata 查询两次都没有回答，这次跳过`);
      failed.add(city.name);
      found.set(city.name, []);
      continue;
    }
    found.set(city.name, imagesOfCity(city, answer.rows));
  }
  const names = [...new Set([...found.values()].flat().map((image) => image.file))];
  const files = new Map<string, CommonsFile>();
  for (let start = 0; start < names.length; start += 50) {
    infos += 1;
    const answer = await patiently(() => client.files(names.slice(start, start + 50)));
    if (!answer.ok) throw new Error(`Commons 查询失败：${answer.failure}，本批停止`);
    for (const [name, file] of answer.files) files.set(name, file);
  }
  const results = new Map<string, CityCandidates>();
  for (const city of cities) {
    const directory = join(reviewRoot, batch.id, city.name);
    await mkdir(directory, { recursive: true });
    const kept = new Set(await readdir(directory));
    const candidates: Candidate[] = [];
    const notes: string[] = [];
    for (const image of found.get(city.name) ?? []) {
      if (candidates.length >= wikimediaCandidatesPerCity) break;
      const file = files.get(image.file);
      const refusal = file ? usageRefusalOf(file) : "missing";
      if (!file || refusal) {
        notes.push(`${image.shows} ${image.item} 不收：${refusal}`);
        continue;
      }
      // A candidate already downloaded by an earlier run is reused, not fetched again.
      const earlier = [...kept].find((name) => name.startsWith(`wikimedia-${file.pageId}.`));
      let body: Uint8Array | null = earlier ? new Uint8Array(await readFile(join(directory, earlier))) : null;
      if (!body) {
        downloads += 1;
        const downloaded = await patiently(() => client.download(file.thumbUrl));
        if (!downloaded.ok) {
          if (downloaded.failure === "rate_limited" || downloaded.failure === "refused") {
            throw new Error(`${city.name} 下载被拒：${downloaded.failure}，本批停止`);
          }
          notes.push(`${image.shows} ${image.item} 下载失败：${downloaded.failure}`);
          continue;
        }
        body = downloaded.body;
      }
      const facts = readImageFacts(body);
      if (!facts) continue;
      const saved = earlier ?? `wikimedia-${file.pageId}.${facts.format}`;
      if (!earlier) await writeFile(join(directory, saved), body);
      // Public-domain files have no licence page; their Commons page states the status.
      const licenseUrl = file.licenseUrl.startsWith("https://") ? file.licenseUrl : file.pageUrl;
      if (file.width <= file.height) notes.push(`${image.shows} ${image.item} 是竖图（${file.width}×${file.height}），卡片会裁切`);
      candidates.push({ id: file.pageId, source: "wikimedia", license: file.license, licenseUrl, shows: image.shows,
        kind: image.kind, query: `Wikidata ${image.item} P18: ${file.title}`, artist: (file.artist || "Unknown author").slice(0, 100),
        pageUrl: file.pageUrl, tags: file.title, file: saved, width: facts.width, height: facts.height, bytes: body.byteLength });
    }
    const searches = [failed.has(city.name) ? "Wikidata 查询失败，下次再试" : `Wikidata：${found.get(city.name)?.length ?? 0} 张代表图`, ...notes];
    await writeFile(join(directory, "candidates-wikimedia.json"), `${JSON.stringify({ city, searches, candidates }, null, 1)}\n`);
    results.set(city.name, { city, candidates, searches });
  }
  console.log(`Wikimedia 请求：Wikidata ${queries} 次，Commons ${infos} 次，下载 ${downloads} 次。`);
  return results;
}

/** Rebuilds a batch's review page from the candidates already downloaded; no network. */
async function rebuildReview(batch: CatalogBatch): Promise<void> {
  const results: CityCandidates[] = [];
  for (const city of batch.cities) {
    const candidates: Candidate[] = [];
    const searches: string[] = [];
    for (const list of ["candidates.json", "candidates-wikimedia.json"]) {
      try {
        const saved = JSON.parse(await readFile(join(reviewRoot, batch.id, city.name, list), "utf8")) as
          { candidates: Candidate[]; searches?: string[] };
        candidates.push(...saved.candidates);
        searches.push(...(saved.searches ?? []));
      } catch {
        // A city may have only one of the two lists, or none.
      }
    }
    if (candidates.length > 0 || searches.length > 0) results.push({ city, candidates, searches });
  }
  const page = join(reviewRoot, batch.id, "review.html");
  await writeFile(page, await reviewPage(batch, results));
  console.log(`审核页：${page}（${results.length} 个城市）`);
}

async function main(): Promise<void> {
  const [mode, batchId, third, fourth] = process.argv.slice(2);
  if (mode === "fetch" && batchId && third === "--views" && fourth) {
    return fetchBatch(batchOf(batchId), new Set(fourth.split(/[,，]/u).map((name) => name.trim()).filter(Boolean)));
  }
  if (mode === "fetch" && batchId && !third) return fetchBatch(batchOf(batchId));
  if (mode === "review" && batchId) return rebuildReview(batchOf(batchId));
  const picksPath = third;
  if (mode === "apply" && batchId && picksPath) return applyPicks(batchOf(batchId), picksPath);
  console.error("用法：fetch <批次> [--views 城市,…] | review <批次> | apply <批次> <picks.json>");
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const key = process.env.PIXABAY_API_KEY?.trim();
  let message = error instanceof Error ? error.message : "未知错误";
  if (key) message = message.replaceAll(key, "[REDACTED]");
  console.error(`停止：${message.replace(/https?:\/\/\S+/giu, "[URL]")}`);
  process.exitCode = 1;
});
