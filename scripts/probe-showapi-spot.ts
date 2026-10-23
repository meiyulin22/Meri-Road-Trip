/**
 * 一次性探测脚本:验证「全国景点查询」的图片覆盖率。
 *
 *   npx tsx scripts/probe-showapi-spot.ts 泰山 布达拉宫 九寨沟
 *
 * 每次运行 = 一次真实调用(试用实例只有 10 次),所以:
 *   - 原始 JSON 一律存到 .cache/showapi/<关键词>.json,失败也不丢
 *   - 只做一次请求,不重试
 *   - AppCode 只从环境变量读,不打印
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const endpoint = "https://ali-spot.showapi.com/spotList";

interface Spot {
  readonly name?: string;
  readonly address?: string;
  readonly proName?: string;
  readonly cityName?: string;
  readonly areaName?: string;
  readonly picList?: readonly string[];
  readonly priceList?: unknown[];
  readonly location?: { readonly lat?: string; readonly lon?: string };
  readonly summary?: string;
}

interface Answer {
  readonly showapi_res_code?: number;
  readonly showapi_res_error?: string;
  readonly showapi_res_body?: {
    readonly ret_code?: number;
    readonly pagebean?: { readonly allNum?: number; readonly contentlist?: readonly Spot[] };
  };
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, "");
}

async function probe(appCode: string, keyword: string): Promise<void> {
  const url = `${endpoint}?keyword=${encodeURIComponent(keyword)}&page=1`;
  const started = performance.now();
  const response = await fetch(url, { headers: { Authorization: `APPCODE ${appCode}` } });
  const text = await response.text();
  const elapsed = Math.round(performance.now() - started);

  mkdirSync(".cache/showapi", { recursive: true });
  const file = join(".cache/showapi", `${keyword}.json`);
  writeFileSync(file, text);

  if (!response.ok) {
    console.log(`${keyword}: HTTP ${response.status} ${elapsed}ms — 原始响应已存 ${file}`);
    console.log(text.slice(0, 200));
    return;
  }

  let answer: Answer;
  try {
    answer = JSON.parse(text) as Answer;
  } catch {
    console.log(`${keyword}: 返回不是 JSON — 已存 ${file}`);
    return;
  }

  const pagebean = answer.showapi_res_body?.pagebean;
  const spots = pagebean?.contentlist ?? [];
  const exact = spots.filter((spot) => normalize(String(spot.name ?? "")) === normalize(keyword));
  const pictured = exact.filter((spot) => (spot.picList ?? []).length > 0);
  const anyPictured = spots.filter((spot) => (spot.picList ?? []).length > 0);

  console.log(`\n=== ${keyword} ===`);
  console.log(`  HTTP ${response.status} ${elapsed}ms  res_code=${answer.showapi_res_code}  ret_code=${answer.showapi_res_body?.ret_code}`);
  console.log(`  总数 ${pagebean?.allNum ?? "?"},本页 ${spots.length} 条,名字完全匹配 ${exact.length} 条,其中有图 ${pictured.length} 条`);
  console.log(`  本页任意条目有图: ${anyPictured.length} 条`);
  for (const spot of exact.slice(0, 3)) {
    const pictures = spot.picList ?? [];
    console.log(`  · ${spot.name} | ${spot.proName ?? "?"}/${spot.cityName ?? "?"}/${spot.areaName ?? "?"}`);
    console.log(`    坐标 ${spot.location?.lon ?? "?"},${spot.location?.lat ?? "?"}  图片 ${pictures.length} 张`);
    if (pictures.length > 0) console.log(`    首图 ${pictures[0]}`);
  }
  if (exact.length === 0) console.log(`  完全匹配示例: ${spots.slice(0, 5).map((spot) => spot.name).join(" | ")}`);
}

async function main(): Promise<void> {
  const appCode = process.env.ALIYUN_MARKET_APPCODE?.trim();
  if (!appCode) {
    console.error("未配置 ALIYUN_MARKET_APPCODE;请在 .env.local 里加一行后重试。");
    process.exitCode = 1;
    return;
  }
  const keywords = process.argv.slice(2);
  if (keywords.length === 0) {
    console.error("用法:npx tsx scripts/probe-showapi-spot.ts 泰山 布达拉宫 …");
    process.exitCode = 1;
    return;
  }
  if (keywords.length > 10) {
    console.error("试用实例只有 10 次调用,一次最多探测 10 个关键词。");
    process.exitCode = 1;
    return;
  }
  for (const keyword of keywords) await probe(appCode, keyword);
}

void main();
