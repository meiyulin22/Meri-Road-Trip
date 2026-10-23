/**
 * 预抓景点照片:Pixabay → public/photos/*.jpg + photos.json。
 *
 *   npx tsx scripts/fetch-place-photos.ts            # 只补缺的
 *   npx tsx scripts/fetch-place-photos.ts --refresh  # 全部重抓
 *   npx tsx scripts/fetch-place-photos.ts 布达拉宫   # 只处理指定地点
 *
 * 规则(2026-10-23 实测确定):
 *   - Pixabay 禁止热链、图片 URL 只有 24 小时有效期 → 必须下载到 public/photos
 *   - per_page 最小 3,最大 200
 *   - 相关性靠 tags:返回的 tags 必须含查询词之一,否则这张图不算这个地点
 *   - 授权:免费商用;API 使用要求告知来源 → 记 artist + pageUrl,卡片上显示
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Place { readonly zh: string; readonly en: string; readonly require?: string }
interface Hit {
  readonly id: number;
  readonly tags: string;
  readonly largeImageURL: string;
  readonly webformatURL: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly user: string;
  readonly pageURL: string;
}
interface Entry { file: string; artist: string; pageUrl: string; fetchedAt: string }

const photosDirectory = join(process.cwd(), "public", "photos");
const catalogPath = join(photosDirectory, "photos.json");

const places: readonly Place[] = [
  { zh: "布达拉宫", en: "Potala Palace" },
  { zh: "贡嘎山", en: "Gongga Mountain" },
  { zh: "四姑娘山", en: "Siguniang Mountain" },
  { zh: "稻城亚丁", en: "Daocheng Yading" },
  { zh: "南迦巴瓦峰", en: "Namjagbarwa", require: "namjagbarwa" },
  { zh: "长白山天池", en: "Changbai Mountain" },
  { zh: "玉龙雪山", en: "Jade Dragon Snow Mountain", require: "dragon" },
  { zh: "苍山", en: "Cangshan Dali" },
  { zh: "张家界", en: "Zhangjiajie" },
  { zh: "九寨沟", en: "Jiuzhaigou" },
  { zh: "黄山", en: "Huangshan" },
  { zh: "峨眉山", en: "Mount Emei" },
  { zh: "泰山", en: "Mount Tai" },
  { zh: "西湖", en: "West Lake Hangzhou" },
  { zh: "丽江古城", en: "Lijiang Old Town" },
  { zh: "阳朔", en: "Yangshuo" },
  { zh: "故宫", en: "Forbidden City" },
  { zh: "长城", en: "Great Wall China" },
  { zh: "洱海", en: "Erhai Lake" },
  { zh: "青海湖", en: "Qinghai Lake" },
  { zh: "纳木错", en: "Namtso Lake" },
  { zh: "珠穆朗玛峰", en: "Mount Everest" },
  { zh: "泸沽湖", en: "Lugu Lake" },
  { zh: "喀纳斯", en: "Kanas Lake" },
  { zh: "天山天池", en: "Tianchi Lake" },
  { zh: "敦煌莫高窟", en: "Mogao Caves" },
  { zh: "呼伦贝尔", en: "Hulunbuir" },
  { zh: "婺源", en: "Wuyuan" },
  { zh: "稻城", en: "Daocheng" },
  { zh: "香格里拉", en: "Shangri-La Yunnan" },
];

function slugOf(english: string): string {
  return english.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

/**
 * The distinctive words a hit's tags must contain one of. Generic words are dropped:
 * "Mount Emei" once matched a Mount Fuji photo through the word "mount" alone.
 */
const genericWords = new Set(["mount", "mountain", "mountains", "lake", "city", "park", "china",
  "river", "old", "town", "great", "wall", "west", "national", "scenic", "area", "view", "nature"]);

function keywordsOf(english: string): string[] {
  const words = english.toLowerCase().split(/[^a-z0-9]+/u).filter((word) => word.length >= 3);
  const distinctive = words.filter((word) => !genericWords.has(word));
  return distinctive.length > 0 ? distinctive : words;
}

function readCatalog(): Record<string, Entry> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(catalogPath, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, Entry> : {};
  } catch {
    return {};
  }
}

async function pickHit(key: string, place: Place): Promise<Hit | null> {
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}`
    + `&q=${encodeURIComponent(place.en)}&image_type=photo&orientation=horizontal`
    + `&safesearch=true&per_page=5`;
  const response = await fetch(url);
  if (!response.ok) {
    console.log(`  ${place.zh}: API HTTP ${response.status}`);
    return null;
  }
  const body = await response.json() as { hits?: Hit[] };
  const words = keywordsOf(place.en);
  const hits = body.hits ?? [];
  // 必须命中第一个特征词(最具体的那个),其余词只加分:
  // 否则 "Cangshan Dali" 里的 dali 会把洱海的照片当成苍山。
  const tagWordsOf = (hit: Hit) => new Set(hit.tags.toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean));
  const required = place.require ?? words[0];
  const matching = hits.filter((hit) => tagWordsOf(hit).has(required));
  if (matching.length === 0) {
    console.log(`  ${place.zh}: 没有一张的 tags 含「${required}」`);
    return null;
  }
  matching.sort((left, right) => {
    const bonus = (hit: Hit) => words.slice(1).filter((word) => tagWordsOf(hit).has(word)).length;
    return bonus(right) - bonus(left) || right.imageWidth - left.imageWidth;
  });
  return matching[0] ?? null;
  if (matching.length === 0) {
    console.log(`  ${place.zh}: 没有一张的 tags 提到「${words.join("/")}」`);
    return null;
  }

}

async function fetchPhoto(key: string, place: Place): Promise<Entry | null> {
  const hit = await pickHit(key, place);
  if (!hit) return null;
  const large = await fetch(hit.largeImageURL || hit.webformatURL);
  if (!large.ok || !(large.headers.get("content-type") ?? "").startsWith("image/")) {
    console.log(`  ${place.zh}: 图片下载 HTTP ${large.status}`);
    return null;
  }
  let body = new Uint8Array(await large.arrayBuffer());
  // 大图直接进仓库太大:超过 600KB 就换 960px 变体。
  if (body.byteLength > 600_000) {
    const smaller = hit.webformatURL ? await fetch(hit.webformatURL) : null;
    if (smaller?.ok && (smaller.headers.get("content-type") ?? "").startsWith("image/")) {
      body = new Uint8Array(await smaller.arrayBuffer());
    }
  }
  if (body.byteLength < 20_000) {
    console.log(`  ${place.zh}: 图片太小(${Math.round(body.byteLength / 1024)}KB)`);
    return null;
  }
  mkdirSync(photosDirectory, { recursive: true });
  const file = `${slugOf(place.en)}.jpg`;
  writeFileSync(join(photosDirectory, file), body);
  console.log(`  ${place.zh} ✅ ${file}  ${hit.imageWidth}x${hit.imageHeight}  ${Math.round(body.byteLength / 1024)}KB  by ${hit.user}`);
  return { file, artist: hit.user, pageUrl: hit.pageURL, fetchedAt: new Date().toISOString().slice(0, 10) };
}

async function main(): Promise<void> {
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (!key) {
    console.error("未配置 PIXABAY_API_KEY;请在 .env.local 里加一行后重试。");
    process.exitCode = 1;
    return;
  }
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const only = args.filter((arg) => !arg.startsWith("--"));
  const catalog = readCatalog();
  const targets = only.length > 0 ? places.filter((place) => only.includes(place.zh)) : places;
  if (targets.length === 0) {
    console.error("没有匹配的地名;可用:", places.map((place) => place.zh).join(", "));
    process.exitCode = 1;
    return;
  }

  let added = 0;
  let missed = 0;
  for (const place of targets) {
    if (!refresh && catalog[place.zh] && existsSync(join(photosDirectory, catalog[place.zh].file))) {
      console.log(`  ${place.zh}: 已有,跳过`);
      continue;
    }
    const entry = await fetchPhoto(key, place);
    if (entry) { catalog[place.zh] = entry; added += 1; }
    else { missed += 1; }
    // 100 次/60 秒:每个地点 2 次请求(搜索 + 下载),这里只需要给搜索留间隔。
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  mkdirSync(photosDirectory, { recursive: true });
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 1)}\n`);
  console.log(`\n新增 ${added} 个,未命中 ${missed} 个,索引共 ${Object.keys(catalog).length} 条 → ${catalogPath}`);
}

void main();
