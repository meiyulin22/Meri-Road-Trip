import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";
import { buildWorkspaceConversationSystemPrompt } from "./workspace-conversation-prompt";
import { workspaceConversationJsonSchema } from "@/capabilities/conversation/workspace-conversation-interpreter";
import { buildTripDraftSystemPrompt } from "@/capabilities/journey/prompts/trip-draft-prompt";
import { tripDraftJsonSchema } from "@/capabilities/journey/trip-draft-extractor";

/**
 * Everything a Chinese-interface model call is told, for fixed inputs. The Chinese
 * prompts were tuned case by case against the live model (the harness, cases 1–19),
 * so the English version may change freely but this text may not move by a single
 * character without someone meaning it. To accept a deliberate change, rerun with
 * UPDATE_PROMPT_SNAPSHOT=1 and rerun the harness's Chinese cases.
 */
const snapshotUrl = new URL("./chinese-prompts.snapshot.txt", import.meta.url);

const tripState: TripState = {
  name: { state: "known", value: "云南徒步", source: "user" },
  origin: { state: "known", value: "上海", source: "user" },
  destination: { state: "known", source: "user",
    areas: [{ province: "云南省", places: [{ name: "丽江市", spots: ["玉龙雪山"] }] }] },
  startDate: { state: "approximate", value: "十一月", source: "user" },
  endDate: { state: "missing" },
  duration: { state: "known", value: "7天", source: "user" },
  transportPreference: { state: "missing" },
};

function chinesePrompts(): string {
  const context = { tripState, referenceDate: "2026-10-04", timezone: "Asia/Shanghai", locale: "zh" } as const;
  return [
    "=== conversation prompt", buildWorkspaceConversationSystemPrompt(context),
    "=== opening prompt", buildWorkspaceConversationSystemPrompt({ ...context, mode: "opening" }),
    "=== conversation schema", JSON.stringify(workspaceConversationJsonSchema, null, 2),
    "=== trip draft prompt", buildTripDraftSystemPrompt(context),
    "=== trip draft schema", JSON.stringify(tripDraftJsonSchema, null, 2),
    "",
  ].join("\n");
}

test("the Chinese prompts and schemas are exactly the tuned ones", () => {
  if (process.env.UPDATE_PROMPT_SNAPSHOT === "1") writeFileSync(snapshotUrl, chinesePrompts());
  assert.equal(chinesePrompts(), readFileSync(snapshotUrl, "utf8"));
});
