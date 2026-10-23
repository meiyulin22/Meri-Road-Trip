/**
 * 探测:带相关性约束地从博查图片里挑一张最像"这个景点"的。
 *
 *   npx tsx scripts/probe-bocha-images.ts 布达拉宫 稻城亚丁 [--suffix=风景摄影]
 *
 * 约束:
 *   1. 查询措辞加"风景 摄影",把资料图/PPT 挤掉
 *   2. 图片的 hostPageUrl 必须出现在同一响应的 webPages 里,且那页标题含地名
 *   3. 域名打分:旅游/摄影站加分,文库/PPT、带水印图库扣分;同一来源页只取一张
 *   4. 下载后自己量尺寸:宽 ≥ 800、长宽比 1.1–2.4、20KB–6MB、Content-Type 必须是图片
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { bochaSearchValues, requestBochaWebSearch } from "@/platform/search/bocha-web-search";

interface ImageHit { readonly contentUrl?: string; readonly thumbnailUrl?: string; readonly hostPageUrl?: string }
interface PageHit { readonly name?: string; readonly url?: string }

const travelDomains = ["mafengwo.cn", "ctrip.com", "qunar.com", "8264.com", "pconline.com.cn",
  "sohu.com", "163.com", "sina.com.cn", "qq.com", "ifeng.com", "xinhuanet.com", "people.com.cn",
  "chinadaily.com.cn", "travel", "lvyou", "tuniu.com", "ly.com", "bytravel.cn", "dianping.com"];
const documentDomains = ["book118.com", "docin.com", "360doc.com", "doc88.com", "wenku.baidu.com", "taodocs.com"];
const stockDomains = ["quanjing.com", "vcg.com", "gettyimages", "shutterstock", "123rf", "hellorf.com",
  "nipic.com", "51miz.com", "699pic.com", "zcool.com.cn", "veer.com", "tuchong.com"];

function hostOf(value: string | undefined): string {
  try { return new URL(value ?? "").host.toLowerCase(); } catch { return ""; }
}

function domainScore(host: string): number {
  if (documentDomains.some((domain) => host.includes(domain))) return -2;
  if (stockDomains.some((domain) => host.includes(domain))) return -2;
  if (travelDomains.some((domain) => host.includes(domain))) return 2;
  return 0;
}

/** 从字节里读出宽高,不引入图片库。 */
function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: 89 50 4E 47 ... IHDR 宽高在 16..24
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  // GIF
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  // JPEG: 找 SOF0..SOF3 / SOF5..SOF7 / SOF9..SOF11
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1] ?? 0;
      const length = view.getUint16(offset + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      offset += 2 + length;
    }
  }
  // WebP (VP8X/VP8 /VP8L 简化处理)
  if (bytes.length > 30 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    const chunk = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
    if (chunk === "VP8X") return { width: 1 + view.getUintLE(24, 3), height: 1 + view.getUintLE(27, 3) };
    if (chunk === "VP8 ") return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  return null;
}

async function tryDownload(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const response = await fetch(url, { headers: { Referer: url, "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength < 20_000 || buffer.byteLength > 6_000_000) return null;
    return { bytes: buffer, type };
  } catch { return null; }
}

async function probe(apiKey: string, name: string, suffix: string): Promise<void> {
  const query = suffix ? `${name} ${suffix}` : name;
  const body = await requestBochaWebSearch({ apiKey, query, count: 10, summary: false });
  const images = bochaSearchValues(body, "images") as ImageHit[];
  const pages = bochaSearchValues(body, "webPages") as PageHit[];
  // 按完整 URL 匹配标题,不按域名:同一域名下的另一篇报道不能给这张图作证。
  const normalizeUrl = (value: string | undefined): string =>
    (value ?? "").replace(/^https?:\/\//u, "").replace(/[?#].*$/u, "").replace(/\/+$/u, "").toLowerCase();
  const titleByUrl = new Map<string, string>();
  for (const page of pages) {
    const url = normalizeUrl(page.url);
    if (url && !titleByUrl.has(url)) titleByUrl.set(url, page.name ?? "");
  }

  const scored = images.map((image) => {
    const host = hostOf(image.hostPageUrl);
    const title = titleByUrl.get(normalizeUrl(image.hostPageUrl)) ?? "";
    const exactTitle = title.includes(name);
    const partial = !exactTitle && title.includes(name.slice(0, 2));
    const score = (exactTitle ? 3 : partial ? -1 : 1) + domainScore(host);
    return { image, host, title, score };
  }).sort((left, right) => right.score - left.score);

  // 同一来源页只取一张,按分数从高到低试下载。
  const seen = new Set<string>();
  const tried: string[] = [];
  for (const entry of scored) {
    const key = entry.image.hostPageUrl ?? entry.image.contentUrl ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    const url = entry.image.contentUrl ?? entry.image.thumbnailUrl;
    if (!url) continue;
    const download = await tryDownload(url);
    if (!download) { tried.push(`${entry.host} 下载失败`); continue; }
    const size = imageSize(download.bytes);
    if (!size) { tried.push(`${entry.host} 读不出尺寸`); continue; }
    const aspect = size.width / size.height;
    if (size.width < 800 || aspect < 1.1 || aspect > 2.4) {
      tried.push(`${entry.host} ${size.width}x${size.height} 不合格`);
      continue;
    }
    mkdirSync(".cache/bingpreview", { recursive: true });
    const file = join(".cache/bingpreview", `${name}.jpg`);
    writeFileSync(file, download.bytes);
    console.log(`\n${name}: 选中 ${entry.host} (分数 ${entry.score}) ${size.width}x${size.height}`);
    console.log(`  来源页标题: ${entry.title || "(无)"}`);
    console.log(`  图片: ${url}`);
    console.log(`  已保存 ${file}`);
    if (tried.length > 0) console.log(`  跳过的: ${tried.join("; ")}`);
    return;
  }
  console.log(`\n${name}: ❌ 没有合格的图(候选 ${images.length} 张)  跳过原因: ${tried.join("; ") || "无"}`);
}

async function main(): Promise<void> {
  const apiKey = process.env.BOCHA_API_KEY?.trim();
  if (!apiKey) { console.error("未配置 BOCHA_API_KEY"); process.exitCode = 1; return; }
  const args = process.argv.slice(2);
  const suffixArg = args.find((arg) => arg.startsWith("--suffix="));
  const suffix = suffixArg ? suffixArg.slice("--suffix=".length) : "风景 摄影";
  const names = args.filter((arg) => !arg.startsWith("--"));
  if (names.length === 0) { console.error("用法:npx tsx scripts/probe-bocha-images.ts 布达拉宫 …"); process.exitCode = 1; return; }
  for (const name of names) await probe(apiKey, name, suffix);
}

void main();
