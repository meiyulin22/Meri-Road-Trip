import { Agent } from "@mastra/core/agent";

import { createMoonshotChatModelFromEnvironment } from "@/platform/llm/moonshot-chat-model";

import { resolvePlaceTool } from "./tools/resolve-place";
import { webSearchTool } from "./tools/web-search";

/**
 * The 1.0300 trial agent: one question about places in China, answered with the two
 * tools Meri already had. It exists to prove the agent stack — Kimi calling tools
 * through Mastra — before the planner is designed on it, and is replaced by the
 * planner rather than grown into one.
 */
export const scoutAgent = new Agent({
  id: "scout",
  name: "Scout",
  instructions: `You are Meri's scout, answering one question about places in China.
Before you name a place as real, look it up with resolve-place by its Chinese name; say plainly when it is not found or is ambiguous.
Use web-search only for recent notices (closures, reservations, seasonal access), and give each notice its source and date. A search result is a lead, not proof.
Do not state prices, opening hours, weather or road conditions you did not get from a tool; say they are unknown instead.
Reply in the language of the question, in at most eight short sentences.`,
  // Built on first use, so importing the agent never needs the API key.
  model: () => createMoonshotChatModelFromEnvironment(),
  tools: { resolvePlace: resolvePlaceTool, webSearch: webSearchTool },
});
