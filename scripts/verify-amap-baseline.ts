/**
 * The Amap baseline for the Tianditu trial: the same 15 Yunnan places, English names
 * and route pairs (scripts/map-trial-cases.ts), asked of the provider Meri already
 * uses, so the switch decision rests on both sides' numbers. It also prints what
 * Tianditu cannot give at all — opening hours, rating and photos. About 40 calls.
 *
 *   NODE_TLS_REJECT_UNAUTHORIZED=1 node --env-file=.env.local --import tsx scripts/verify-amap-baseline.ts
 */
import { englishNames, places, routePairs } from "./map-trial-cases";

const apiBase = "https://restapi.amap.com/v5";
/** Amap refuses starts closer than ~0.25 s on this key (src/platform/amap/amap-fetch.ts). */
const spacingMs = 350;

type Poi = {
  readonly name?: string; readonly pname?: string; readonly cityname?: string; readonly adname?: string;
  readonly location?: string; readonly photos?: readonly { readonly url?: string }[];
  readonly business?: { readonly tel?: string; readonly opentime_today?: string; readonly opentime_week?: string;
    readonly rating?: string; readonly cost?: string };
};

function key(): string {
  const value = process.env.AMAP_API_KEY;
  if (!value) throw new Error("AMAP_API_KEY is not set in .env.local");
  return value;
}

async function call(path: string, params: Record<string, string>): Promise<{ body: Record<string, unknown>; ms: number }> {
  await new Promise((resolve) => setTimeout(resolve, spacingMs));
  const url = `${apiBase}${path}?${new URLSearchParams({ ...params, key: key() })}`;
  const startedAt = performance.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  return { body: await response.json() as Record<string, unknown>, ms: Math.round(performance.now() - startedAt) };
}

/** Nationwide, as the Workspace place check searches today, or inside one province. */
async function search(keywords: string, region?: string): Promise<{ pois: Poi[]; failure?: string }> {
  const { body } = await call("/place/text", {
    keywords, page_size: "5", page_num: "1", show_fields: "business,photos",
    ...(region ? { region, city_limit: "true" } : {}),
  });
  if (body.status !== "1") return { pois: [], failure: `${String(body.infocode)} ${String(body.info)}` };
  return { pois: (body.pois as Poi[] | undefined) ?? [] };
}

async function placesCase(): Promise<Map<string, string>> {
  console.log("\n## B. 15 Yunnan places — top hit inside 云南省, with business fields");
  const found = new Map<string, string>();
  const tally = { pass: 0, nationalPass: 0, tel: 0, hours: 0, rating: 0, photos: 0 };
  for (const place of places) {
    const national = (await search(place.name)).pois[0];
    if (national?.pname === place.province) tally.nationalPass += 1;
    const { pois, failure } = await search(place.name, place.province);
    const top = pois[0];
    if (!top?.location) {
      console.log(`✗ ${place.name}: ${failure ?? "no result"}`);
      continue;
    }
    const ok = top.pname === place.province && place.cities.some((city) => top.cityname?.includes(city));
    const business = top.business ?? {};
    if (ok) tally.pass += 1;
    if (business.tel) tally.tel += 1;
    if (business.opentime_week || business.opentime_today) tally.hours += 1;
    if (business.rating) tally.rating += 1;
    if (top.photos?.length) tally.photos += 1;
    found.set(place.name, top.location);
    console.log(`${ok ? "✓" : "✗"} ${place.name} → ${top.name} · ${top.pname}/${top.cityname}/${top.adname} · ` +
      `tel="${business.tel ?? ""}" hours="${business.opentime_week ?? business.opentime_today ?? ""}" ` +
      `rating=${business.rating ?? "-"} photos=${top.photos?.length ?? 0} · ` +
      `nationwide top: ${national?.name ?? "none"} (${national?.pname ?? "?"})`);
  }
  console.log(`passed ${tally.pass}/15 inside 云南省 (bar: 13) · nationwide top hit in Yunnan ${tally.nationalPass}/15 · ` +
    `tel ${tally.tel}/15 · hours ${tally.hours}/15 · rating ${tally.rating}/15 · photos ${tally.photos}/15`);
  return found;
}

async function english(): Promise<void> {
  console.log("\n## C. English names");
  for (const name of englishNames) {
    const { pois } = await search(name);
    console.log(`${pois.length ? "✓" : "✗"} ${name} → ${pois.slice(0, 3).map((poi) => `${poi.name}（${poi.cityname}）`).join("、") || "nothing"}`);
  }
}

async function routes(found: Map<string, string>): Promise<void> {
  console.log("\n## D. Routes between found places");
  for (const [from, to, mode] of routePairs) {
    const origin = found.get(from);
    const destination = found.get(to);
    if (!origin || !destination) {
      console.log(`- ${mode} ${from} → ${to}: skipped, a place was not found`);
      continue;
    }
    const { body, ms } = await call(mode === "drive" ? "/direction/driving" : "/direction/walking",
      { origin, destination, show_fields: "cost" });
    const path = (body.route as { paths?: { distance?: string; cost?: { duration?: string } }[] } | undefined)?.paths?.[0];
    const km = Number(path?.distance) / 1000;
    const seconds = Number(path?.cost?.duration);
    console.log(`- ${mode} ${from} → ${to}: distance=${km.toFixed(2)} km duration=${seconds} s ` +
      `(${(km / (seconds / 3600)).toFixed(1)} km/h) (${ms} ms)${body.status === "1" ? "" : ` ${String(body.info)}`}`);
  }
}

async function main(): Promise<void> {
  await english();
  await routes(await placesCase());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
