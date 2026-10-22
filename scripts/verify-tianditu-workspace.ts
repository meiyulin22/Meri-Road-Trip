/**
 * Does the Tianditu place check answer the Workspace as Amap does? Each expression goes
 * through Meri's real resolution rules (LocationService + resolveDestinationPlace) with
 * each provider, so the difference shown is what a user would see. Tianditu here is the
 * product adapter (src/platform/tianditu/), Wikidata step included; on a mainland
 * network Wikidata needs the proxy and Tianditu must go direct:
 *
 *   NODE_USE_ENV_PROXY=1 no_proxy="$no_proxy,api.tianditu.gov.cn,restapi.amap.com" NODE_TLS_REJECT_UNAUTHORIZED=1 \
 *     node --use-system-ca --env-file=.env.local --import tsx scripts/verify-tianditu-workspace.ts
 */
import { LocationService } from "@/capabilities/destination/location-service";
import { resolveDestinationPlace, type PlaceResolution } from "@/capabilities/destination/resolve-destination-place";
import { AmapLocationProvider } from "@/platform/location-provider/amap-location-provider";
import { TiandituLocationProvider } from "@/platform/tianditu/tianditu-location-provider";

/** Provinces, cities, sights Meri's rules special-case, and places from the Yunnan trial. */
const expressions = [
  "云南", "海南", "广西", "丽江", "大理", "香格里拉", "三亚", "朝阳", "潮汕",
  "西湖", "泰山", "峨眉山", "黄山", "故宫", "洪崖洞", "长城", "九寨沟", "鼓浪屿", "张家界",
  "稻城亚丁", "松赞林寺", "苍山", "雨崩", "玉龙雪山",
];

function describe(result: PlaceResolution): string {
  const pick = (value: { province: string; place: unknown; spot: unknown }) =>
    [value.province, JSON.stringify(value.place), JSON.stringify(value.spot)].filter((part) => part !== "null").join(" · ");
  switch (result.status) {
    case "resolved": return `resolved${result.exact ? "" : " (to confirm)"}: ${pick(result.pick)}`;
    case "ambiguous": return `ambiguous ×${result.options.length}: ${result.options.map(pick).join(" | ")}`;
    default: return result.status;
  }
}

async function main(): Promise<void> {
  if (!process.env.TIANDITU_API_KEY || !process.env.AMAP_API_KEY) throw new Error("TIANDITU_API_KEY and AMAP_API_KEY are both needed");
  const amap = new LocationService(new AmapLocationProvider());
  const tianditu = new LocationService(new TiandituLocationProvider());
  // `-- 苍山 长城` checks just those, ten seconds apart, for when Wikidata is rate-limiting this network.
  const only = process.argv.slice(2);
  const chosen = only.length > 0 ? only : expressions;
  let same = 0;
  for (const expression of chosen) {
    if (only.length > 0) await new Promise((resolve) => setTimeout(resolve, 10_000));
    let startedAt = performance.now();
    const amapResult = await resolveDestinationPlace(expression, (query) => amap.resolveExpression(query));
    const amapMs = Math.round(performance.now() - startedAt);
    startedAt = performance.now();
    const tiandituResult = await resolveDestinationPlace(expression, (query) => tianditu.resolveExpression(query));
    const tiandituMs = Math.round(performance.now() - startedAt);
    const amapText = describe(amapResult);
    const tiandituText = describe(tiandituResult);
    if (amapText === tiandituText) same += 1;
    console.log(`\n${amapText === tiandituText ? "=" : "≠"} ${expression}`);
    console.log(`  Amap     (${amapMs} ms): ${amapText}`);
    console.log(`  Tianditu (${tiandituMs} ms): ${tiandituText}`);
  }
  console.log(`\nsame answer ${same}/${chosen.length}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
