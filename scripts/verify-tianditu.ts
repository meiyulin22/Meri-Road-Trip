/**
 * The Tianditu trial: could the national map platform replace Amap for place checks
 * and routes? The pass bar was set before running (docs/agent-planner/README.md §6.3):
 * steady access with no 418 blocks, at least 13 of 15 Yunnan places found in the
 * right province and city, walking and driving routes with sensible numbers, and
 * English names searchable. Every case calls the real service, so the output is
 * read by eye.
 *
 *   NODE_TLS_REJECT_UNAUTHORIZED=1 node --env-file=.env.local --import tsx scripts/verify-tianditu.ts all
 */
import { englishNames, places, routePairs } from "./map-trial-cases";

const apiBase = "https://api.tianditu.gov.cn";
const chinaBound = "73,3,136,54";
/** Yunnan's administrative code. A Yunnan `mapBound` did not filter (苍山 still came back in 广西). */
const yunnanCode = "156530000";
/** The first run lost 11 of 15 searches after 20 back-to-back calls; spacing them shows the steady rate. */
const spacingMs = Number(process.env.TIANDITU_SPACING_MS ?? 300);


type Poi = { readonly name?: string; readonly address?: string; readonly phone?: string; readonly lonlat?: string } & Record<string, unknown>;

function key(): string {
  const value = process.env.TIANDITU_API_KEY;
  if (!value) throw new Error("TIANDITU_API_KEY is not set in .env.local");
  return value;
}

async function call(path: string, params: Record<string, string>): Promise<{ status: number; text: string; ms: number }> {
  await new Promise((resolve) => setTimeout(resolve, spacingMs));
  const url = `${apiBase}${path}?${new URLSearchParams({ ...params, tk: key() })}`;
  const startedAt = performance.now();
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
  return { status: response.status, text: await response.text(), ms: Math.round(performance.now() - startedAt) };
}

/** A WAF block answers 418, or 200 with an HTML "访问被拦截" page instead of JSON. */
function blocked(result: { status: number; text: string }): boolean {
  return result.status === 418 || result.text.includes("访问被拦截");
}

type SearchResult = { readonly pois: Poi[]; readonly ms: number; readonly blocked: boolean; readonly failure?: string };

/** Nationwide keyword search (queryType 1), or inside one administrative area (queryType 12). */
async function search(keyWord: string, specify?: string): Promise<SearchResult> {
  const query = specify
    ? { keyWord, queryType: "12", specify, start: "0", count: "5" }
    : { keyWord, queryType: "1", start: "0", count: "5", level: "12", mapBound: chinaBound };
  const result = await call("/v2/search", { type: "query", postStr: JSON.stringify(query) });
  if (blocked(result)) return { pois: [], ms: result.ms, blocked: true, failure: `blocked (${result.status})` };
  try {
    const body = JSON.parse(result.text) as { pois?: Poi[]; status?: { infocode?: number; cndesc?: string } };
    const failure = body.status?.infocode === 1000 ? undefined : `${body.status?.infocode} ${body.status?.cndesc}`;
    return { pois: body.pois ?? [], ms: result.ms, blocked: false, failure };
  } catch {
    return { pois: [], ms: result.ms, blocked: false, failure: `${result.status} non-JSON: ${result.text.slice(0, 120)}` };
  }
}

async function reverse(lonlat: string): Promise<{ province?: string; city?: string; county?: string }> {
  const [lon, lat] = lonlat.split(",").map(Number);
  const result = await call("/geocoder", { type: "geocode", postStr: JSON.stringify({ lon, lat, ver: 1 }) });
  const body = JSON.parse(result.text) as { result?: { addressComponent?: Record<string, string> } };
  const component = body.result?.addressComponent ?? {};
  return { province: component.province, city: component.city, county: component.county };
}

/**
 * Drive answers XML; `style` 0 is fastest driving. Third-party notes call `style` 3 walking,
 * but the first run moved at ~29 km/h on it, so the speed is printed to tell.
 */
async function route(from: string, to: string, style: "0" | "3"): Promise<string> {
  const result = await call("/drive", { type: "search", postStr: JSON.stringify({ orig: from, dest: to, style }) });
  const tag = (name: string) => result.text.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1] ?? "?";
  const kmPerHour = (Number(tag("distance")) / (Number(tag("duration")) / 3600)).toFixed(1);
  return `distance=${tag("distance")} km duration=${tag("duration")} s (${kmPerHour} km/h) steps=${result.text.match(/<item id=/g)?.length ?? 0} (${result.ms} ms)`;
}

async function access(): Promise<void> {
  console.log("\n## A. Access — 20 searches in a row");
  const times: number[] = [];
  let blocks = 0;
  const failures: string[] = [];
  for (let index = 0; index < 20; index += 1) {
    const result = await search(places[index % places.length].name);
    times.push(result.ms);
    if (result.blocked) blocks += 1;
    if (result.failure) failures.push(result.failure);
  }
  const sorted = [...times].sort((left, right) => left - right);
  console.log(`spacing ${spacingMs} ms · blocked ${blocks}/20 · other failures ${failures.length}/20 · ` +
    `median ${sorted[10]} ms · max ${sorted[19]} ms${failures.length ? ` · e.g. ${failures[0]}` : ""}`);
}

/** Returns the coordinates of each place's top hit, for the route case. */
async function placesCase(): Promise<Map<string, string>> {
  console.log("\n## B. 15 Yunnan places — top hit inside Yunnan, reverse-geocoded province and city");
  const found = new Map<string, string>();
  let pass = 0;
  let nationalPass = 0;
  let withPhone = 0;
  let withAddress = 0;
  for (const place of places) {
    const national = await search(place.name);
    const nationalTop = national.pois[0];
    const nationalWhere = nationalTop?.lonlat ? await reverse(nationalTop.lonlat) : {};
    const nationalOk = nationalWhere.province === place.province;
    if (nationalOk) nationalPass += 1;
    const { pois, failure } = await search(place.name, yunnanCode);
    const top = pois[0];
    if (!top?.lonlat) {
      console.log(`✗ ${place.name}: ${failure ?? "no result"}`);
      continue;
    }
    const where = await reverse(top.lonlat);
    const ok = where.province === place.province && place.cities.some((city) => where.city?.includes(city));
    if (ok) pass += 1;
    if (top.phone) withPhone += 1;
    if (top.address) withAddress += 1;
    found.set(place.name, top.lonlat);
    console.log(`${ok ? "✓" : "✗"} ${place.name} → ${top.name} · ${where.province}/${where.city}/${where.county} · ` +
      `addr="${top.address ?? ""}" tel="${top.phone ?? ""}" · others: ${pois.slice(1, 3).map((poi) => poi.name).join("、")}` +
      ` · nationwide top: ${nationalTop?.name ?? national.failure ?? "none"} (${nationalOk ? "Yunnan" : nationalWhere.province ?? "?"})`);
  }
  console.log(`passed ${pass}/15 inside Yunnan (bar: 13) · nationwide top hit in Yunnan ${nationalPass}/15 · ` +
    `phone on ${withPhone}/15 · address on ${withAddress}/15`);
  console.log(`fields on a POI: ${Object.keys((await search("玉龙雪山")).pois[0] ?? {}).join(", ")}`);
  return found;
}

async function english(): Promise<void> {
  console.log("\n## C. English names");
  for (const name of englishNames) {
    const { pois } = await search(name);
    console.log(`${pois.length ? "✓" : "✗"} ${name} → ${pois.slice(0, 3).map((poi) => poi.name).join("、") || "nothing"}`);
  }
}

async function routes(found: Map<string, string>): Promise<void> {
  console.log("\n## D. Routes between found places");
  for (const [from, to, mode] of routePairs) {
    const style = mode === "drive" ? "0" : "3";
    const origin = found.get(from);
    const destination = found.get(to);
    if (!origin || !destination) {
      console.log(`- ${mode} ${from} → ${to}: skipped, a place was not found`);
      continue;
    }
    console.log(`- ${mode} ${from} → ${to}: ${await route(origin, destination, style)}`);
  }
}

async function main(): Promise<void> {
  const which = process.argv[2] ?? "all";
  if (which === "all" || which === "A") await access();
  const found = which === "all" || which === "B" || which === "D" ? await placesCase() : new Map<string, string>();
  if (which === "all" || which === "C") await english();
  if (which === "all" || which === "D") await routes(found);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
