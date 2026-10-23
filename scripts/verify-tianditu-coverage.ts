/**
 * Compare Tianditu's first three candidates with and without trip area priors:
 *
 *   npx tsx scripts/verify-tianditu-coverage.ts --prior 苍山=云南省,大理白族自治州
 *   node --env-file=.env.local --import tsx scripts/verify-tianditu-coverage.ts \
 *     --prior 苍山=云南省,大理白族自治州 --prior 亚丁=四川省,甘孜藏族自治州
 *
 * Priors apply only to the named expression; repeated names use the last value.
 * Expressions without a prior still run twice, with [] explicitly shown in the table.
 * Candidates are evidence for manual review, not an automatic accuracy score.
 */
import type { LocationCandidate } from "@/domain/location/location";
import { TiandituLocationProvider } from "@/platform/tianditu/tianditu-location-provider";

const expressions = [
  "苍山", "点苍山", "稻城亚丁", "亚丁", "九寨沟", "黄山", "玉龙雪山",
  "洱海", "涠洲岛", "天门山", "西湖", "故宫", "兵马俑", "洪崖洞",
  "峨眉山", "泰山", "长白山", "丽江", "云南", "青岛",
];

interface Measurement {
  readonly status: "success" | "empty" | "failure";
  readonly text: string;
  readonly durationMs: number;
}

function parsePriors(args: readonly string[]): Map<string, readonly string[]> | null {
  const priors = new Map<string, readonly string[]>();
  for (let index = 0; index < args.length; index += 2) {
    const value = args[index + 1];
    if (args[index] !== "--prior" || value === undefined) return null;
    const parts = value.split("=");
    if (parts.length !== 2) return null;
    const expression = parts[0].trim();
    const areas = parts[1].split(",").map((area) => area.trim());
    if (!expressions.includes(expression) || areas.length !== 2 || areas.some((area) => area === "")) return null;
    priors.set(expression, areas);
  }
  return priors;
}

function cell(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;")
    .replace(/\|/gu, "&#124;").replace(/[\r\n]+/gu, " ");
}

function describe(place: LocationCandidate): string {
  const region = [place.province, place.city, place.district].map((area) => area ?? "—").join(" · ");
  return cell(`${place.name}/${region}/${place.kind ?? "unknown"}`);
}

async function measure(
  provider: TiandituLocationProvider,
  expression: string,
  areas: readonly string[],
): Promise<Measurement> {
  const startedAt = performance.now();
  try {
    const result = await provider.searchByKeyword(expression, areas);
    const durationMs = performance.now() - startedAt;
    if (result.status === "failure") {
      return { status: "failure", text: `失败（${result.reason}）`, durationMs };
    }
    if (result.candidates.length === 0) return { status: "empty", text: "空结果", durationMs };
    return {
      status: "success",
      text: result.candidates.slice(0, 3).map((place, index) => `${index + 1}. ${describe(place)}`).join("<br>"),
      durationMs,
    };
  } catch {
    // Thrown errors can contain a URL carrying the key, so print only a fixed reason.
    return { status: "failure", text: "失败（unexpected_error）", durationMs: performance.now() - startedAt };
  }
}

function summarize(label: string, measurements: readonly Measurement[]): void {
  const count = (status: Measurement["status"]) => measurements.filter((result) => result.status === status).length;
  const averageMs = measurements.length === 0 ? 0
    : measurements.reduce((total, result) => total + result.durationMs, 0) / measurements.length;
  console.log(`${label}：成功 ${count("success")} 次，空结果 ${count("empty")} 次，失败 ${count("failure")} 次，平均耗时 ${averageMs.toFixed(1)} ms。`);
}

async function main(): Promise<void> {
  if (!process.env.TIANDITU_API_KEY?.trim()) {
    console.error("未配置 TIANDITU_API_KEY；请设置环境变量，或用 node --env-file=.env.local --import tsx scripts/verify-tianditu-coverage.ts 运行。");
    process.exitCode = 1;
    return;
  }
  const priors = parsePriors(process.argv.slice(2));
  if (priors === null) {
    console.error("参数错误：请使用 --prior 内置说法=省,市（可重复；同名以后一次为准）。");
    process.exitCode = 1;
    return;
  }

  const provider = new TiandituLocationProvider();
  const withoutPrior: Measurement[] = [];
  const withPrior: Measurement[] = [];
  const startedAt = performance.now();
  console.log("| 说法 | 无先验 Top3（名称/省市区/类别） | 有先验 Top3（名称/省市区/类别） | 无先验 ms | 有先验 ms |");
  console.log("| --- | --- | --- | ---: | ---: |");
  // Sequential calls retain the product client's pacing and avoid competing requests.
  for (const expression of expressions) {
    const areas = priors.get(expression) ?? [];
    const baseline = await measure(provider, expression, []);
    const contextual = await measure(provider, expression, areas);
    withoutPrior.push(baseline);
    withPrior.push(contextual);
    const priorText = areas.length > 0 ? cell(areas.join("，")) : "未配置（传 []）";
    console.log(`| ${cell(expression)} | ${baseline.text} | 先验：${priorText}<br>${contextual.text} | ${Math.round(baseline.durationMs)} | ${Math.round(contextual.durationMs)} |`);
  }

  console.log("\n汇总（成功指有候选；空结果单独计数；平均耗时包含全部调用）：");
  summarize("无先验", withoutPrior);
  summarize("有先验列（含未配置先验的对照）", withPrior);
  summarize("合计", [...withoutPrior, ...withPrior]);
  console.log(`总耗时：${Math.round(performance.now() - startedAt)} ms。仅供人工比较 Top3，不自动判定准确率。`);
  if ([...withoutPrior, ...withPrior].some((result) => result.status === "failure")) process.exitCode = 1;
}

main().catch(() => {
  console.error("验证脚本运行失败（unexpected_error）。");
  process.exitCode = 1;
});
