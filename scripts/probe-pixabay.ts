/**
 * 一次性探测脚本:验证 Pixabay 对我们这些地名的图片覆盖率。
 *
 *   npx tsx scripts/probe-pixabay.ts Lijiang "Gongga Mountain" Zhangjiajie
 *
 * 每个关键词一次请求(免费额度 100 次/60 秒)。命中就把首图下载到
 * .cache/pixabay/<关键词>.jpg,方便直接看图判断质量。
 *
 * 官方规则(2026-10-23 查证):
 *   - 100 requests / 60 seconds,key 免费,无付费提额档
 *   - 禁止永久热链,必须下载到自己服务器
 *   - webformatURL(640px)有效期 24 小时
 *   - 展示搜索结果时应告知来源(Pixabay)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Hit {
  readonly id: number;
  readonly tags: string;
  readonly webformatURL: string;
  readonly largeImageURL: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly user: string;
  readonly pageURL: string;
}

interface Answer {
  readonly total?: number;
  readonly totalHits?: number;
  readonly hits?: readonly Hit[];
}

async function probe(key: string, keyword: string): Promise<{ hits: number; saved: string | null }> {
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}`
    + `&q=${encodeURIComponent(keyword)}&image_type=photo&orientation=horizontal&safesearch=true&per_page=3`;
  const started = performance.now();
  const response = await fetch(url);
  const text = await response.text();
  const elapsed = Math.round(performance.now() - started);
  if (!response.ok) {
    console.log(`${keyword}: HTTP ${response.status} ${elapsed}ms — ${text.slice(0, 120)}`);
    return { hits: 0, saved: null };
  }
  let answer: Answer;
  try {
    answer = JSON.parse(text) as Answer;
  } catch {
    console.log(`${keyword}: 返回不是 JSON`);
    return { hits: 0, saved: null };
  }
  const hits = answer.hits ?? [];
  console.log(`${keyword}: HTTP 200 ${elapsed}ms  总数 ${answer.totalHits ?? answer.total ?? 0},取回 ${hits.length} 张`);
  for (const hit of hits) {
    console.log(`  · ${hit.imageWidth}x${hit.imageHeight}  tags="${hit.tags.slice(0, 60)}"  by ${hit.user}`);
  }
  if (hits.length === 0) return { hits: 0, saved: null };

  // 立刻下载:webformatURL 只有 24 小时有效期,官方也要求下载到自己的服务器。
  const first = hits[0];
  const image = await fetch(first.largeImageURL || first.webformatURL);
  if (!image.ok) {
    console.log(`  首图下载失败 HTTP ${image.status}`);
    return { hits: hits.length, saved: null };
  }
  mkdirSync(".cache/pixabay", { recursive: true });
  const file = join(".cache/pixabay", `${keyword.replace(/[^\p{Letter}\p{Number}]+/gu, "-")}.jpg`);
  writeFileSync(file, Buffer.from(await image.arrayBuffer()));
  console.log(`  已保存 ${file}`);
  return { hits: hits.length, saved: file };
}

async function main(): Promise<void> {
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (!key) {
    console.error("未配置 PIXABAY_API_KEY;请在 .env.local 里加一行后重试。");
    process.exitCode = 1;
    return;
  }
  const keywords = process.argv.slice(2);
  if (keywords.length === 0) {
    console.error("用法:npx tsx scripts/probe-pixabay.ts Lijiang \"Gongga Mountain\" …");
    process.exitCode = 1;
    return;
  }
  const summary: string[] = [];
  for (const keyword of keywords) {
    const result = await probe(key, keyword);
    summary.push(`${result.hits > 0 ? "✅" : "❌"} ${keyword} (${result.hits})`);
  }
  console.log(`\n=== 汇总 ===\n${summary.join("\n")}`);
  const found = summary.filter((line) => line.startsWith("✅")).length;
  console.log(`\n命中 ${found}/${keywords.length}`);
}

void main();
