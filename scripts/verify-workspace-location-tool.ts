import { randomUUID } from "node:crypto";

import type { TripState } from "../src/domain/trip-state/trip-state";
import { interpretWorkspaceConversation } from "../src/server/ai/workspace-conversation-interpreter";

const cases = {
  A: {
    message: "我十一想去阿尔山玩几天",
    conversationHistory: [],
  },
  B: {
    message: "我十一想出去玩，但还没想好去哪",
    conversationHistory: [],
  },
  C: {
    message: "阿尔山吧",
    conversationHistory: [
      { role: "user" as const, content: "我十一想出去玩" },
      { role: "assistant" as const, content: "想去哪一带？" },
    ],
  },
} as const;

async function main(): Promise<void> {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    process.stderr.write("TLS certificate verification is disabled; enable it before running this check.\n");
    process.exitCode = 1;
    return;
  }

  const selected = process.argv[2];
  if (selected !== "A" && selected !== "B" && selected !== "C") {
    process.stderr.write("Usage: NODE_TLS_REJECT_UNAUTHORIZED=1 node --env-file=.env.local --import tsx scripts/verify-workspace-location-tool.ts <A|B|C>\n");
    process.exitCode = 1;
    return;
  }

  const tripState: TripState = {
    name: { state: "known", value: "假期旅行", source: "user" },
    origin: { state: "missing" },
    destination: { state: "missing" },
    startDate: { state: "missing" },
    endDate: { state: "missing" },
    duration: { state: "missing" },
    transportPreference: { state: "missing" },
  };
  const interpretation = await interpretWorkspaceConversation({
    ...cases[selected],
    tripState,
    requestId: randomUUID(),
    referenceDate: new Date().toISOString().slice(0, 10),
    timezone: "Asia/Shanghai",
  });
  process.stdout.write(`${JSON.stringify(interpretation, null, 2)}\n`);
}

void main().catch(() => {
  // The normal server logger has details. Do not print errors that may contain URLs or keys.
  process.stderr.write("Workspace location tool verification failed.\n");
  process.exitCode = 1;
});
