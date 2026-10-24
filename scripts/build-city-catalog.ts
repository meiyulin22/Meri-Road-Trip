/**
 * 给图集按城市补代表图，分两步，中间人工审核：
 *
 *   npx tsx scripts/build-city-catalog.ts fetch jiangzhehu
 *     每个城市在 Pixabay 找最多 3 张候选（先搜景点中文名、英文名，不够再搜第二个景点，
 *     还没有才搜城市名），用运行时同一套规则过滤，下载到 .cache/catalog-review/<批次>/，
 *     并生成 review.html。不碰 public/photos。
 *
 *   npx tsx scripts/build-city-catalog.ts fetch jiangzhehu --views 苏州市,绍兴市
 *     城市景色模式：只给列出的城市找"能代表这座城市"的照片（天际线、街道、普通建筑都行，
 *     不必是名胜），搜城市中文名和英文名，每城最多 4 张候选。用在景点找不到合适图的城市。
 *
 *   npx tsx scripts/build-city-catalog.ts fetch southwest --wikimedia 达州市,巴中市
 *     第二图源：Wikidata 里这座城市的代表图（P18，维基编辑选的那张），从 Wikimedia Commons
 *     取作者、许可证和 500px 副本。一批城市只要 1 次 Wikidata 查询、每 50 个文件 1 次
 *     Commons 查询，再逐张下载。只用于 Pixabay 找不到的城市；同样人工审核后才进图集。
 *     Commons 的图是知识共享许可：图集记下作者、许可证和链接，/photo-credits 全部列出。
 *
 *   npx tsx scripts/build-city-catalog.ts apply jiangzhehu picks.json
 *     picks.json 是人工看图后挑好的：{ "南通市": { "id": 4251603, "caption": "狼山", "slug": "langshan",
 *     "note": "狼山塔倒影" }, ... }。caption 是照片里实际拍到的地方（tags 只写城市时就写城市），
 *     slug 是文件名的英文部分。把选中的文件复制进 public/photos，登记到 photos.json：
 *     条目名即 caption，regions / scenicFor 填城市全称和简称。
 *
 * 请求走产品自己的 PixabayClient：一次一个、任意 60 秒不超过 80 次（Pixabay 上限 100）。
 * 搜索结果缓存 24 小时（.cache/catalog-review/store/）。不输出密钥和带密钥的 URL。
 */
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { readImageFacts } from "../src/platform/place-photos/image-file";
import { MediaPhotoStore } from "../src/platform/place-photos/media-photo-store";
import { PixabayClient } from "../src/platform/place-photos/pixabay-client";
import { judgeHit, type PixabayHit, type RemotePhotoSubject } from "../src/platform/place-photos/pixabay-photo-match";
import { parsePhotoCatalog, type CatalogEntry } from "../src/platform/place-photos/photo-catalog";

import { catalogBatches, type CatalogBatch, type CatalogCity } from "./catalog-cities";

const reviewRoot = join(process.cwd(), ".cache", "catalog-review");
const photosDirectory = join(process.cwd(), "public", "photos");
const catalogPath = join(photosDirectory, "photos.json");
const candidatesPerCity = 3;
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
  if (!key) throw new Error("未配置 PIXABAY_API_KEY");
  let searches = 0;
  let downloads = 0;
  const counting = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/api/") searches += 1; else downloads += 1;
    return fetch(input, init);
  }) as typeof fetch;
  const client = new PixabayClient({ key, fetcher: counting });
  const store = new MediaPhotoStore(join(reviewRoot, "store"));
  const catalog = await readCatalog();
  const results: CityCandidates[] = [];

  for (const city of batch.cities) {
    if (views && !views.has(city.name)) continue;
    if (hasRepresentative(catalog, city)) {
      console.log(`${city.name}: 图集已有代表图，跳过`);
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
        const outcome = await patiently(() => client.search(new URLSearchParams(parameters)));
        if (!outcome.ok) throw new Error(`${city.name}「${plan.query}」搜索失败：${outcome.failure}，本批停止`);
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
      // A candidate already downloaded by an earlier run is reused, not fetched again.
      const earlier = [...kept].find((name) => name.startsWith(`${hit.id}.`));
      if (earlier) {
        const body = new Uint8Array(await readFile(join(directory, earlier)));
        const facts = readImageFacts(body);
        if (facts) {
          candidates.push({ id: hit.id, shows: plan.subject.landmark, kind: plan.kind, query: `${plan.query} [${plan.lang}]`,
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
        artist: hit.user, pageUrl: hit.pageURL, tags: hit.tags, file, width: facts.width, height: facts.height,
        bytes: downloaded.body.byteLength });
    }
    await writeFile(join(directory, "candidates.json"), `${JSON.stringify({ city, searches: asked, candidates }, null, 1)}\n`);
    results.push({ city, candidates, searches: asked });
    console.log(`${city.name}: ${candidates.length} 张候选（${asked.join("；")}）`);
  }

  await writeFile(join(reviewRoot, batch.id, views ? "review-views.html" : "review.html"), reviewPage(batch, results));
  const covered = results.filter((item) => item.candidates.length > 0).length;
  console.log(`\n${covered}/${results.length} 个城市有候选。请求：搜索 ${searches} 次，下载 ${downloads} 次。`);
  console.log(`审核页：${join(reviewRoot, batch.id, views ? "review-views.html" : "review.html")}`);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char] ?? char);
}

function reviewPage(batch: CatalogBatch, results: readonly CityCandidates[]): string {
  const rows = results.map(({ city, candidates, searches }) => `
<section>
  <h2>${escapeHtml(city.name)} <small>${escapeHtml(city.province)}</small></h2>
  <p class="meta">${escapeHtml(searches.join("；"))}</p>
  <div class="row">${candidates.length === 0 ? "<p class=\"none\">没有合格候选</p>" : candidates.map((item) => `
    <figure>
      <img src="${encodeURIComponent(city.name)}/${item.file}" alt="">
      <figcaption><b>${item.id}</b> ${escapeHtml(item.shows)}${item.kind === "city" ? "（城市图）" : ""}${item.source === "wikimedia" ? ` · Wikimedia ${escapeHtml(item.license ?? "")}` : ""}<br>
        ${escapeHtml(item.artist)} · ${item.width}×${item.height} · ${Math.round(item.bytes / 1024)} KB<br>
        <a href="${escapeHtml(item.pageUrl)}">Pixabay 原图页</a><br><span class="tags">${escapeHtml(item.tags)}</span></figcaption>
    </figure>`).join("")}</div>
</section>`).join("");
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>图集候选 ${escapeHtml(batch.id)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:16px;background:#fafaf7;color:#222}section{margin:0 0 28px}
h2{font-size:18px;margin:0 0 4px}small{color:#777;font-weight:normal}.meta{color:#777;margin:0 0 8px}.row{display:flex;gap:12px;flex-wrap:wrap}
figure{margin:0;width:320px}img{width:320px;aspect-ratio:4/3;object-fit:cover;border-radius:6px;display:block}
figcaption{font-size:12px;margin-top:4px}.tags{color:#888}.none{color:#b44}</style></head><body>
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
    catalog[name] = { file, artist: chosen.artist, pageUrl: chosen.pageUrl, fetchedAt: today, aliases: [],
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

const wikimediaAgent = "MeriRoadTrip-catalog/0.1 (trip planner photo catalog; https://github.com/meiyulin22/Meri-Road-Trip)";

async function wikimediaJson(url: URL): Promise<unknown> {
  const response = await fetch(url, { headers: { "User-Agent": wikimediaAgent, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Wikimedia 返回 HTTP ${response.status}，本批停止`);
  return response.json() as Promise<unknown>;
}

function plainText(html: string | undefined): string {
  return (html ?? "").replace(/<[^>]+>/gu, " ").replace(/&amp;/gu, "&").replace(/&quot;/gu, "\"").replace(/&#0?39;/gu, "'")
    .replace(/\s+/gu, " ").trim();
}

/**
 * The official image of each city on Wikidata (P18), matched by its full Chinese name, or
 * its short one, and constrained to its province (the item's parent), so a short name cannot
 * land on a namesake elsewhere. A 直辖市 has no province above it and is not handled here.
 */
async function wikidataImages(cities: readonly CatalogCity[]): Promise<Map<string, string>> {
  const rows = cities.map((city) => `("${city.name}"@zh "${city.short}"@zh "${city.province}"@zh)`).join(" ");
  const query = `SELECT ?full ?image WHERE { VALUES (?full ?short ?province) { ${rows} }
    ?parent rdfs:label ?province.
    { ?item rdfs:label ?full } UNION { ?item rdfs:label ?short }
    ?item wdt:P131 ?parent; wdt:P18 ?image. }`;
  const url = new URL("https://query.wikidata.org/sparql");
  url.search = new URLSearchParams({ format: "json", query }).toString();
  const body = await wikimediaJson(url) as { results: { bindings: { full: { value: string }; image: { value: string } }[] } };
  const images = new Map<string, string>();
  for (const row of body.results.bindings) {
    if (!images.has(row.full.value)) images.set(row.full.value, decodeURIComponent(row.image.value.split("/").pop() ?? ""));
  }
  return images;
}

interface CommonsFile {
  readonly pageId: number;
  readonly title: string;
  readonly pageUrl: string;
  readonly thumbUrl: string;
  readonly width: number;
  readonly height: number;
  readonly artist: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly description: string;
}

/**
 * Author, licence and a 500px rendition for Commons files, 50 a request. Commons serves
 * thumbnails only at standard widths and rounds others up (640 came back as 960, ~180 KB);
 * 500 is one of them and still twice the 200px a card shows.
 */
async function commonsFiles(names: readonly string[]): Promise<Map<string, CommonsFile>> {
  const files = new Map<string, CommonsFile>();
  for (let start = 0; start < names.length; start += 50) {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "imageinfo",
      iiprop: "extmetadata|size|url", iiurlwidth: "500",
      titles: names.slice(start, start + 50).map((name) => `File:${name}`).join("|") }).toString();
    const body = await wikimediaJson(url) as { query: { normalized?: { from: string; to: string }[]; pages: {
      pageid?: number; title: string; imageinfo?: { thumburl?: string; descriptionurl?: string; width: number; height: number;
        extmetadata?: Record<string, { value?: string }> }[] }[] } };
    const asked = new Map((body.query.normalized ?? []).map((item) => [item.to, item.from]));
    for (const page of body.query.pages) {
      const info = page.imageinfo?.[0];
      const meta = info?.extmetadata ?? {};
      const license = plainText(meta.LicenseShortName?.value);
      if (!page.pageid || !info?.thumburl || !info.descriptionurl || !license) continue;
      const name = (asked.get(page.title) ?? page.title).replace(/^File:/u, "");
      files.set(name, { pageId: page.pageid, title: page.title, pageUrl: info.descriptionurl, thumbUrl: info.thumburl,
        width: info.width, height: info.height, artist: plainText(meta.Artist?.value).slice(0, 100) || "Unknown author",
        // Public-domain files carry no licence link: the file page states the status instead.
        license, licenseUrl: meta.LicenseUrl?.value?.startsWith("https://") ? meta.LicenseUrl.value
          : (meta.LicenseUrl?.value ? meta.LicenseUrl.value.replace(/^http:\/\//u, "https://") : info.descriptionurl),
        description: plainText(meta.ImageDescription?.value).slice(0, 200) });
    }
  }
  return files;
}

/** Candidates from Wikidata and Commons for the listed cities (or every city still without a representative). */
async function fetchWikimedia(batch: CatalogBatch, only: ReadonlySet<string> | null): Promise<void> {
  const catalog = await readCatalog();
  const cities = batch.cities.filter((city) => (only ? only.has(city.name) : true) && !hasRepresentative(catalog, city));
  const images = await wikidataImages(cities);
  const files = await commonsFiles([...new Set(images.values())]);
  let downloads = 0;
  const results: CityCandidates[] = [];
  for (const city of cities) {
    const name = images.get(city.name);
    const file = name ? files.get(name) : undefined;
    const candidates: Candidate[] = [];
    const directory = join(reviewRoot, batch.id, city.name);
    await mkdir(directory, { recursive: true });
    if (file) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      downloads += 1;
      const response = await fetch(file.thumbUrl, { headers: { "User-Agent": wikimediaAgent }, signal: AbortSignal.timeout(30_000) });
      const body = response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
      const facts = body ? readImageFacts(body) : null;
      if (body && facts) {
        const saved = `wikimedia-${file.pageId}.${facts.format}`;
        await writeFile(join(directory, saved), body);
        candidates.push({ id: file.pageId, source: "wikimedia", license: file.license, licenseUrl: file.licenseUrl,
          shows: city.short, kind: "city", query: `Wikidata P18: ${file.title}`, artist: file.artist, pageUrl: file.pageUrl,
          tags: file.description, file: saved, width: facts.width, height: facts.height, bytes: body.byteLength });
      }
    }
    await writeFile(join(directory, "candidates-wikimedia.json"), `${JSON.stringify({ city, candidates }, null, 1)}\n`);
    results.push({ city, candidates, searches: [name ? `Wikidata P18: ${name}` : "Wikidata 没有代表图"] });
    console.log(`${city.name}: ${candidates.length ? `${candidates[0].license} · ${candidates[0].artist} · ${name}` : "没有"}`);
  }
  await writeFile(join(reviewRoot, batch.id, "review-wikimedia.html"), reviewPage(batch, results));
  console.log(`\n${results.filter((item) => item.candidates.length).length}/${results.length} 个城市有候选。` +
    `请求：Wikidata 1 次，Commons ${Math.ceil(images.size / 50)} 次，下载 ${downloads} 次。`);
}

async function main(): Promise<void> {
  const [mode, batchId, third, fourth] = process.argv.slice(2);
  if (mode === "fetch" && batchId && third === "--wikimedia") {
    return fetchWikimedia(batchOf(batchId), fourth ? new Set(fourth.split(/[,，]/u).map((name) => name.trim()).filter(Boolean)) : null);
  }
  if (mode === "fetch" && batchId && third === "--views" && fourth) {
    return fetchBatch(batchOf(batchId), new Set(fourth.split(/[,，]/u).map((name) => name.trim()).filter(Boolean)));
  }
  if (mode === "fetch" && batchId && !third) return fetchBatch(batchOf(batchId));
  const picksPath = third;
  if (mode === "apply" && batchId && picksPath) return applyPicks(batchOf(batchId), picksPath);
  console.error("用法：fetch <批次> | apply <批次> <picks.json>");
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const key = process.env.PIXABAY_API_KEY?.trim();
  let message = error instanceof Error ? error.message : "未知错误";
  if (key) message = message.replaceAll(key, "[REDACTED]");
  console.error(`停止：${message.replace(/https?:\/\/\S+/giu, "[URL]")}`);
  process.exitCode = 1;
});
