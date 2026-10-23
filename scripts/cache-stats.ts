/**
 * What the Tianditu classification cache is holding, and how long each page has left.
 *
 *   npx tsx scripts/cache-stats.ts
 *   npx tsx scripts/cache-stats.ts --clear
 *
 * The cache is a file at .cache/tianditu-classification.json (gitignored) that survives a
 * server restart; deleting it is always safe — every page is fetched again on demand.
 */
import { sharedClassificationMemory } from "@/platform/tianditu/classification-memory";

function daysLeft(expiresAt: number): string {
  const days = (expiresAt - Date.now()) / (24 * 60 * 60 * 1_000);
  return days <= 0 ? "已过期" : `${days.toFixed(1)} 天`;
}

function main(): void {
  if (process.argv.includes("--clear")) {
    sharedClassificationMemory.clear();
    console.log("缓存已清空。");
    return;
  }
  const entries = sharedClassificationMemory.stats();
  if (entries.length === 0) {
    console.log("缓存是空的：还没有任何分类搜索被记下来。");
    return;
  }
  console.log(`| 行政区 \\| 类别 | 条数 | 缓存时间 | 还剩 |`);
  console.log("| --- | ---: | --- | ---: |");
  for (const entry of entries) {
    const cachedAt = new Date(entry.cachedAt).toLocaleString("zh-CN", { hour12: false });
    console.log(`| ${entry.key} | ${entry.count} | ${cachedAt} | ${daysLeft(entry.expiresAt)} |`);
  }
  console.log(`\n共 ${entries.length} 条（上限 200）。文件：.cache/tianditu-classification.json`);
}

main();
