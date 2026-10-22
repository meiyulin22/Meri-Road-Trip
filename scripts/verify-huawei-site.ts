/**
 * The Huawei Site Kit trial: pay-per-use with a monthly voucher, stopping when it runs
 * out, and multilingual — could it replace Amap for Meri's place check and details?
 * Same test set as the other map trials (scripts/map-trial-cases.ts), searched in
 * Chinese and in English, with the details Meri needs (hours, phone, rating, photos).
 * For three places it also fetches Amap's and Tianditu's coordinates live and prints
 * them next to Huawei's, to tell which coordinate system Huawei answers in for mainland
 * China (GCJ-02 sits a few hundred metres off CGCS2000 / WGS-84).
 *
 *   NODE_TLS_REJECT_UNAUTHORIZED=1 node --env-file=.env.local --import tsx scripts/verify-huawei-site.ts [places|english|suggest|all]
 */
import { englishNames, places } from "./map-trial-cases";

const apiBase = "https://siteapi.cloud.huawei.com/mapApi/v1/siteService";

/** The places whose coordinates are compared live against Amap (GCJ-02) and Tianditu (CGCS2000). */
const coordinateChecks = new Set(["丽江古城", "大理古城", "崇圣寺三塔"]);

async function otherProviders(name: string): Promise<string> {
  const amap = await fetch(`https://restapi.amap.com/v5/place/text?${new URLSearchParams({
    keywords: name, page_size: "1", key: process.env.AMAP_API_KEY ?? "" })}`).then((response) => response.json()) as
    { pois?: { location?: string }[] };
  const tianditu = await fetch(`https://api.tianditu.gov.cn/v2/search?${new URLSearchParams({
    type: "query", tk: process.env.TIANDITU_API_KEY ?? "",
    postStr: JSON.stringify({ keyWord: name, queryType: "1", start: "0", count: "1", level: "12", mapBound: "73,3,136,54" }),
  })}`, { headers: { "User-Agent": "Mozilla/5.0" } }).then((response) => response.json()) as { pois?: { lonlat?: string }[] };
  const short = (value?: string) => value?.split(",").map((part) => Number(part).toFixed(3)).join(", ") ?? "?";
  return `amap ${short(amap.pois?.[0]?.location)} · tianditu ${short(tianditu.pois?.[0]?.lonlat)}`;
}

type Site = Record<string, unknown> & {
  readonly siteId?: string; readonly name?: string; readonly formatAddress?: string;
  readonly address?: Record<string, string>; readonly location?: { lat: number; lng: number };
  readonly poi?: Record<string, unknown>;
};

async function call(path: string, body: Record<string, unknown>): Promise<{ body: Record<string, unknown>; ms: number }> {
  const key = process.env.HUAWEI_SITE_API_KEY;
  if (!key) throw new Error("HUAWEI_SITE_API_KEY is not set in .env.local");
  await new Promise((resolve) => setTimeout(resolve, 300));
  const startedAt = performance.now();
  // The key travels in the URL here, so errors below never print the URL.
  const response = await fetch(`${apiBase}/${path}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  const ms = Math.round(performance.now() - startedAt);
  try {
    return { body: JSON.parse(text) as Record<string, unknown>, ms };
  } catch {
    return { body: { returnCode: `HTTP ${response.status}`, returnDesc: text.slice(0, 160) }, ms };
  }
}

function failure(body: Record<string, unknown>): string | undefined {
  return body.returnCode === "0" ? undefined : `${String(body.returnCode)} ${String(body.returnDesc)}`;
}

function where(site: Site): string {
  const address = site.address ?? {};
  return [address.adminArea, address.subAdminArea, address.locality].filter(Boolean).join("/");
}

async function search(query: string, language: "zh" | "en"): Promise<{ sites: Site[]; ms: number; failure?: string }> {
  const { body, ms } = await call("searchByText", { query, language, pageSize: 5 });
  return { sites: (body.sites as Site[] | undefined) ?? [], ms, failure: failure(body) };
}

async function placesCase(): Promise<void> {
  console.log("\n## A. 15 Yunnan places in Chinese — top hit, then its details");
  const tally = { found: 0, province: 0, tel: 0, hours: 0, rating: 0, photos: 0 };
  let printedShape = false;
  for (const place of places) {
    const { sites, ms, failure: error } = await search(place.name, "zh");
    const top = sites[0];
    if (!top?.siteId) {
      console.log(`✗ ${place.name}: ${error ?? "no result"}`);
      continue;
    }
    tally.found += 1;
    const detail = await call("getSiteDetail", { siteId: top.siteId, language: "zh" });
    const site = (detail.body.site as Site | undefined) ?? top;
    const poi = site.poi ?? {};
    if (!printedShape) {
      console.log(`site fields: ${Object.keys(site).join(", ")}`);
      console.log(`poi fields: ${Object.keys(poi).join(", ")}`);
      printedShape = true;
    }
    const ok = where(site).includes("云南") && place.cities.some((city) => where(site).includes(city));
    if (ok) tally.province += 1;
    const hours = poi.openingHours as { texts?: string[] } | undefined;
    if (poi.phone || poi.internationalPhone) tally.tel += 1;
    if (hours?.texts?.length) tally.hours += 1;
    if (poi.rating !== undefined) tally.rating += 1;
    if (Array.isArray(poi.photoUrls) && poi.photoUrls.length > 0) tally.photos += 1;
    const point = site.location ? `${site.location.lng.toFixed(3)}, ${site.location.lat.toFixed(3)}` : "?";
    console.log(`${ok ? "✓" : "✗"} ${place.name} → ${site.name} · ${where(site)} · tel="${String(poi.phone ?? "")}" ` +
      `hours="${hours?.texts?.join(" ") ?? ""}" rating=${String(poi.rating ?? "-")} (${ms}+${detail.ms} ms)` +
      (coordinateChecks.has(place.name) ? `\n    coordinates: huawei ${point} · ${await otherProviders(place.name)}` : ""));
  }
  console.log(`found ${tally.found}/15 · right province and city ${tally.province}/15 (bar: 13) · tel ${tally.tel} · ` +
    `hours ${tally.hours} · rating ${tally.rating} · photos ${tally.photos}`);
}

async function englishCase(): Promise<void> {
  console.log("\n## B. English names, English answers");
  for (const name of englishNames) {
    const { sites, failure: error } = await search(name, "en");
    console.log(`${sites.length ? "✓" : "✗"} ${name} → ${sites.slice(0, 3).map((site) => `${site.name} (${where(site)})`).join(" · ") || error || "nothing"}`);
  }
}

async function suggestCase(): Promise<void> {
  console.log("\n## C. Autocomplete (Meri's input tips)");
  for (const query of ["大理古", "玉龙", "Lijiang"]) {
    const { body, ms } = await call("querySuggestion", { query, language: query.match(/^[a-z]/i) ? "en" : "zh" });
    const sites = (body.sites as Site[] | undefined) ?? [];
    console.log(`${query} → ${sites.slice(0, 5).map((site) => site.name).join(" · ") || failure(body) || "nothing"} (${ms} ms)`);
  }
}

async function main(): Promise<void> {
  const which = process.argv[2] ?? "all";
  if (which === "all" || which === "places") await placesCase();
  if (which === "all" || which === "english") await englishCase();
  if (which === "all" || which === "suggest") await suggestCase();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
