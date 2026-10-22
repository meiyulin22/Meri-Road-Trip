/**
 * The Bailian-hosted Amap MCP trial: does Amap reached through MCP (Bailian's shared
 * trial key, `DASHSCOPE_API_KEY` for auth) give the same places, business fields and
 * routes as the direct Amap API Meri uses today? Same test set as the other map trials
 * (scripts/map-trial-cases.ts). MCP's streamable HTTP is JSON-RPC over POST, so a small
 * client is written here instead of adding an SDK for a trial.
 *
 *   NODE_TLS_REJECT_UNAUTHORIZED=1 node --env-file=.env.local --import tsx scripts/verify-amap-mcp.ts [tools|places|routes|all]
 */
import { places, routePairs } from "./map-trial-cases";

const endpoint = "https://dashscope.aliyuncs.com/api/v1/mcps/amap-maps/mcp";

type JsonRpcResponse = { readonly result?: Record<string, unknown>; readonly error?: { code: number; message: string } };

class McpClient {
  private sessionId: string | undefined;
  private nextId = 1;

  constructor(private readonly apiKey: string) {}

  /** One JSON-RPC call; the server may answer as JSON or as a one-event SSE stream. */
  async request(method: string, params: Record<string, unknown> = {}): Promise<{ result: Record<string, unknown>; ms: number }> {
    const startedAt = performance.now();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
      signal: AbortSignal.timeout(30_000),
    });
    this.sessionId = response.headers.get("mcp-session-id") ?? this.sessionId;
    const text = await response.text();
    if (!response.ok) throw new Error(`${method}: HTTP ${response.status} ${text.slice(0, 200)}`);
    const json = response.headers.get("content-type")?.includes("text/event-stream")
      ? text.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).at(-1) ?? "{}"
      : text;
    const body = JSON.parse(json) as JsonRpcResponse;
    if (body.error) throw new Error(`${method}: ${body.error.code} ${body.error.message}`);
    return { result: body.result ?? {}, ms: Math.round(performance.now() - startedAt) };
  }

  async connect(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "meri-trial", version: "0.1" },
    });
    // The initialized notification has no id and expects no answer.
    await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
  }

  /** A tool's answer is text content; Amap MCP puts JSON inside it, so parse when it is. */
  async call(name: string, args: Record<string, unknown>): Promise<{ data: unknown; raw: string; ms: number }> {
    const { result, ms } = await this.request("tools/call", { name, arguments: args });
    const raw = ((result.content as { type: string; text?: string }[] | undefined) ?? [])
      .map((part) => part.text ?? "").join("\n");
    try {
      return { data: JSON.parse(raw), raw, ms };
    } catch {
      return { data: undefined, raw, ms };
    }
  }
}

type Poi = Record<string, unknown> & { readonly id?: string; readonly name?: string; readonly address?: string };

async function tools(client: McpClient): Promise<void> {
  console.log("\n## A. Tools the server lists");
  const { result, ms } = await client.request("tools/list");
  for (const tool of (result.tools as { name: string; inputSchema?: { properties?: object } }[] | undefined) ?? []) {
    console.log(`- ${tool.name}(${Object.keys(tool.inputSchema?.properties ?? {}).join(", ")})`);
  }
  console.log(`(${ms} ms)`);
}

/** Returns each place's coordinates, from the detail answer, for the route case. */
async function placesCase(client: McpClient): Promise<Map<string, string>> {
  console.log("\n## B. 15 Yunnan places — maps_text_search, then maps_search_detail on the top hit");
  const found = new Map<string, string>();
  const tally = { found: 0, province: 0, tel: 0, hours: 0, rating: 0, photos: 0 };
  let printedShape = false;
  for (const place of places) {
    const search = await client.call("maps_text_search", { keywords: place.name });
    const pois = ((search.data as { pois?: Poi[] } | undefined)?.pois) ?? [];
    const top = pois[0];
    if (!top?.id) {
      console.log(`✗ ${place.name}: ${search.raw.slice(0, 160) || "no result"}`);
      continue;
    }
    tally.found += 1;
    const detail = await client.call("maps_search_detail", { id: top.id });
    const info = (detail.data ?? {}) as Record<string, unknown>;
    if (!printedShape) {
      console.log(`search fields: ${Object.keys(top).join(", ")}`);
      console.log(`detail fields: ${Object.keys(info).join(", ") || detail.raw.slice(0, 200)}`);
      printedShape = true;
    }
    const text = JSON.stringify(info);
    const inYunnan = text.includes(place.province) || String(top.address ?? "").includes("云南");
    if (inYunnan) tally.province += 1;
    const tel = info.tel ?? info.telephone;
    const hours = info.opentime2 ?? info.open_time ?? info.opentime ?? info.business_hours;
    if (tel) tally.tel += 1;
    if (hours) tally.hours += 1;
    if (info.rating) tally.rating += 1;
    if (Array.isArray(info.photos) && info.photos.length > 0) tally.photos += 1;
    if (typeof info.location === "string") found.set(place.name, info.location);
    console.log(`${inYunnan ? "✓" : "?"} ${place.name} → ${top.name} · ${String(info.city ?? "")} · tel="${String(tel ?? "")}" ` +
      `hours="${String(hours ?? "")}" rating=${String(info.rating ?? "-")} (${search.ms}+${detail.ms} ms)`);
  }
  console.log(`found ${tally.found}/15 · in Yunnan ${tally.province}/15 · tel ${tally.tel} · hours ${tally.hours} · ` +
    `rating ${tally.rating} · photos ${tally.photos}`);
  return found;
}

async function routes(client: McpClient, found: Map<string, string>): Promise<void> {
  console.log("\n## C. Routes between found places");
  for (const [from, to, mode] of routePairs) {
    const origin = found.get(from);
    const destination = found.get(to);
    if (!origin || !destination) {
      console.log(`- ${mode} ${from} → ${to}: skipped, a place was not found`);
      continue;
    }
    const { data, raw, ms } = await client.call(mode === "drive" ? "maps_direction_driving" : "maps_direction_walking",
      { origin, destination });
    const path = ((data as { paths?: { distance?: string | number; duration?: string | number }[] } | undefined)?.paths)?.[0];
    if (!path) {
      console.log(`- ${mode} ${from} → ${to}: ${raw.slice(0, 160)}`);
      continue;
    }
    const km = Number(path.distance) / 1000;
    const seconds = Number(path.duration);
    console.log(`- ${mode} ${from} → ${to}: ${km.toFixed(2)} km, ${seconds} s (${(km / (seconds / 3600)).toFixed(1)} km/h) (${ms} ms)`);
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY is not set in .env.local");
  const which = process.argv[2] ?? "all";
  const client = new McpClient(apiKey);
  await client.connect();
  if (which === "all" || which === "tools") await tools(client);
  if (which === "all" || which === "places" || which === "routes") {
    const found = await placesCase(client);
    if (which !== "places") await routes(client, found);
  }
}

main().catch((error: unknown) => {
  // Errors carry the endpoint and status only; the key is sent in a header, never in a URL.
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
