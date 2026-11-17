import { createRequire } from "node:module";

import type { MCPClient } from "@mastra/mcp";

import { logger } from "@/platform/observability/logger";

/** A 12306-mcp tool called by name; the answer is its text, and a tool error throws. */
export type RailToolCaller = (name: string, input: Record<string, unknown>) => Promise<string>;

/** On start the server reads 12306's home page, its station list and the transfer page. */
export const railStartupRequests = 3;

let client: MCPClient | null = null;
let starting: Promise<RailToolCaller> | null = null;

function textOf(result: unknown): string {
  const content = (result as { content?: { type?: string; text?: string }[] } | null)?.content ?? [];
  return content.map((part) => part.text ?? "").join("\n");
}

/** Whether this server may ask 12306 at all: only when RAIL_PROVIDER says so (1.2108). */
export function railEnabled(): boolean {
  return process.env.RAIL_PROVIDER?.trim() === "12306";
}

/**
 * The 12306-mcp server (pinned 0.3.10), started the first time a train is looked up and kept
 * for the life of the process (1.2108). Nothing starts on import or with `next dev`: the module
 * holds `client = null` until this is called. The subprocess gets only the MCP SDK's minimal
 * environment, no keys. It is stopped when the process exits.
 */
export async function railTools(): Promise<RailToolCaller> {
  if (starting) return starting;
  starting = (async () => {
    const { MCPClient: Client } = await import("@mastra/mcp");
    const serverEntry = createRequire(import.meta.url).resolve("12306-mcp/build/index.js");
    client = new Client({ id: "meri-rail", servers: { rail: { command: process.execPath, args: [serverEntry], timeout: 60_000 } } });
    process.once("exit", () => { void client?.disconnect(); });
    const toolsets = await client.listToolsets();
    const tools = toolsets.rail ?? {};
    logger.info({ tools: Object.keys(tools).length }, "12306 rail server started");
    return async (name, input) => {
      const tool = tools[name];
      if (!tool?.execute) throw new Error(`12306 tool ${name} is not available.`);
      return textOf(await tool.execute(input, {} as never));
    };
  })();
  // A failed start is not kept, so a later lookup may try again once the pause is over.
  starting.catch(() => {
    starting = null;
    void client?.disconnect();
    client = null;
  });
  return starting;
}
