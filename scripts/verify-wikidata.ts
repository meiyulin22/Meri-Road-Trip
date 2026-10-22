/**
 * Can Wikidata fill what Tianditu lacks for a sight: which of many same-named places
 * is the famous one, its English name, and an openly licensed photo? For each name it
 * takes Wikidata's matches in China with coordinates, picks the one with the most
 * language editions (sitelinks) as the famous one, then asks Tianditu for sights near
 * those coordinates — Tianditu's own point is what Meri would save, so no coordinate
 * is ever converted. Compare with what Amap resolves in scripts/verify-tianditu-workspace.ts.
 *
 * Wikidata is blocked from mainland networks and Tianditu answered a block page through an
 * overseas proxy, so on a mainland machine with a proxy, send only Wikimedia through it:
 *   NODE_USE_ENV_PROXY=1 NO_PROXY="$NO_PROXY,api.tianditu.gov.cn" NODE_TLS_REJECT_UNAUTHORIZED=1 \
 *     node --use-system-ca --env-file=.env.local --import tsx scripts/verify-wikidata.ts
 */
const names = [
  "苍山", "洪崖洞", "虎跳峡", "长城", "张家界", "黄山", "石林", "稻城亚丁", "九寨沟", "鼓浪屿", "峨眉山", "故宫",
  "西湖", "泰山", "玉龙雪山", "雨崩村", "松赞林寺", "普达措国家公园", "双廊", "崇圣寺三塔", "泸沽湖", "洱海", "梅里雪山", "独克宗古城",
];

const userAgent = "MeriRoadTripTrial/0.1 (portfolio research)";
const china = "Q148";

type Entity = {
  readonly id: string;
  readonly labels?: Record<string, { value: string }>;
  readonly sitelinks?: Record<string, unknown>;
  readonly claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
};

function claim<T>(entity: Entity, property: string): T | undefined {
  return entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value as T | undefined;
}

/** Wikimedia answers "You are making too many requests" in plain text; wait and try again. */
async function wikimedia(url: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)));
    const response = await fetch(url, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(30_000) });
    const text = await response.text();
    if (text.startsWith("{")) return JSON.parse(text) as Record<string, unknown>;
  }
  throw new Error("Wikimedia kept refusing (rate limit)");
}

async function wikidata(params: Record<string, string>): Promise<Record<string, unknown>> {
  return wikimedia(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ ...params, format: "json" })}`);
}

function label(entity: Entity | undefined, ...languages: string[]): string {
  for (const language of languages) {
    const value = entity?.labels?.[language]?.value;
    if (value) return value;
  }
  return "?";
}

/** The famous one: in China, with coordinates, most language editions. */
async function famous(name: string): Promise<{ entity?: Entity; candidates: number }> {
  const search = await wikidata({ action: "wbsearchentities", language: "zh", uselang: "zh", limit: "10", search: name });
  const ids = ((search.search as { id: string }[] | undefined) ?? []).map((hit) => hit.id);
  if (ids.length === 0) return { candidates: 0 };
  const result = await wikidata({ action: "wbgetentities", props: "labels|claims|sitelinks", languages: "zh|zh-hans|zh-cn|en", ids: ids.join("|") });
  const entities = Object.values((result.entities as Record<string, Entity> | undefined) ?? {})
    .filter((entity) => claim<{ id: string }>(entity, "P17")?.id === china && claim(entity, "P625") !== undefined);
  entities.sort((left, right) => Object.keys(right.sitelinks ?? {}).length - Object.keys(left.sitelinks ?? {}).length);
  return { entity: entities[0], candidates: entities.length };
}

async function adminLabel(entity: Entity): Promise<string> {
  const admin = claim<{ id: string }>(entity, "P131")?.id;
  if (!admin) return "?";
  const result = await wikidata({ action: "wbgetentities", props: "labels", languages: "zh|zh-hans|zh-cn|en", ids: admin });
  return label((result.entities as Record<string, Entity>)[admin], "zh-hans", "zh-cn", "zh", "en");
}

/** Commons file metadata: the licence and author a page must show next to the photo. */
async function photo(file: string): Promise<string> {
  const body = await wikimedia(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
    action: "query", format: "json", prop: "imageinfo", iiprop: "extmetadata", titles: `File:${file}`,
  })}`) as
    { query?: { pages?: Record<string, { imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }> } };
  const meta = Object.values(body.query?.pages ?? {})[0]?.imageinfo?.[0]?.extmetadata ?? {};
  const artist = (meta.Artist?.value ?? "?").replace(/<[^>]+>/g, "").trim().slice(0, 30);
  return `${meta.LicenseShortName?.value ?? "?"} by ${artist}`;
}

/** Tianditu sights within 10 km of Wikidata's point, by Tianditu's own categories. */
async function tiandituNear(name: string, lon: number, lat: number): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  const postStr = JSON.stringify({ keyWord: name, queryType: "3", start: "0", count: "30",
    pointLonlat: `${lon},${lat}`, queryRadius: "10000", show: "2" });
  const url = `https://api.tianditu.gov.cn/v2/search?${new URLSearchParams({ type: "query", postStr, tk: process.env.TIANDITU_API_KEY ?? "" })}`;
  const body = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })).json() as
    { pois?: { name: string; typeCode?: string; typeName?: string; distance?: string }[] };
  const sights = (body.pois ?? []).filter((poi) => /^(1804|1602|2602|2603|2608|1803)/.test(poi.typeCode ?? ""));
  return sights.slice(0, 3).map((poi) => `${poi.name}[${poi.typeName}, ${poi.distance}]`).join(" · ") || "no sight within 10 km";
}

async function main(): Promise<void> {
  const tally = { found: 0, english: 0, photo: 0, tianditu: 0 };
  for (const name of names) {
    try {
      const { entity, candidates } = await famous(name);
      if (!entity) {
        console.log(`✗ ${name}: no Wikidata match in China with coordinates`);
        continue;
      }
      tally.found += 1;
      const point = claim<{ latitude: number; longitude: number }>(entity, "P625");
      const english = label(entity, "en");
      if (english !== "?") tally.english += 1;
      const image = claim<string>(entity, "P18");
      if (image) tally.photo += 1;
      const near = !point ? "no coordinates" : process.argv.includes("--tianditu")
        ? await tiandituNear(name, point.longitude, point.latitude) : `${point.longitude.toFixed(3)}, ${point.latitude.toFixed(3)} (pass --tianditu to search nearby)`;
      if (process.argv.includes("--tianditu") && !near.startsWith("no ")) tally.tianditu += 1;
      console.log(`✓ ${name} → ${entity.id} ${label(entity, "zh-hans", "zh-cn", "zh")} / ${english} · in ${await adminLabel(entity)} · ` +
        `${Object.keys(entity.sitelinks ?? {}).length} editions (of ${candidates} in China)` +
        `\n    photo: ${image ? `${image} — ${await photo(image)}` : "none"}` +
        `\n    tianditu near: ${near}`);
    } catch (error) {
      console.log(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`\nfound ${tally.found}/${names.length} · English name ${tally.english} · photo ${tally.photo} · ` +
    `Tianditu sight nearby ${tally.tianditu}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
