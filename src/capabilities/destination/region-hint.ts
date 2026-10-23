import { createAiSdkKimiClientFromEnvironment } from "@/platform/llm/ai-sdk-kimi-client";
import type { StructuredOutputModelClient } from "@/platform/llm/kimi-client";
import { logger } from "@/platform/observability/logger";

/** Where a name the trip has not placed yet is usually found. */
export interface RegionHint {
  readonly province: string | null;
  readonly prefecture: string | null;
}

export interface RegionHintClient {
  /** Never throws: not knowing is null, and the search then falls back to the whole country. */
  hint(place: string): Promise<RegionHint | null>;
}

const jsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["province", "prefecture"],
  properties: {
    province: { type: ["string", "null"],
      description: "Full province-level name, e.g. 云南省、四川省、北京市, or null when unsure." },
    prefecture: { type: ["string", "null"],
      description: "The prefecture-level city or autonomous prefecture it is usually in, e.g. 大理白族自治州、丽江市; null for a 直辖市." },
  },
};

const systemPrompt = `You name where a Chinese place is.
The user gives one place name. Answer with the province-level region and the prefecture-level city that place is usually in — the famous one when the name is shared, because a traveller naming it means the one worth visiting. 苍山 is 云南省 / 大理白族自治州. 稻城亚丁 is 四川省 / 甘孜藏族自治州.
Answer only for places inside China. When you do not know the place, or it is not a place at all, answer null for both. Never guess a prefecture you are unsure of: a wrong region sends the search to the wrong county.
Answer with the JSON object alone — no explanation, no alternatives, no notes.`;

/** A name that already carries its administrative level needs no hint. */
const administrativeExpression = /(?:省|市|区|县|州|盟|旗|镇|乡|村)$/u;

/**
 * A province named without its suffix (云南, 四川) is an administrative answer the provider
 * already gives; asking the model would spend a call and could send the search into an
 * unrelated prefecture. Hong Kong, Macao and Taiwan are here for the same reason.
 */
const provinceNames = new Set([
  "北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江", "上海", "江苏",
  "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "广西",
  "海南", "重庆", "四川", "贵州", "云南", "西藏", "陕西", "甘肃", "青海", "宁夏",
  "新疆", "香港", "澳门", "台湾",
]);

const cacheTtlMs = 7 * 24 * 60 * 60 * 1000;
/** One cache per server process; only real answers are kept, as with the photo lookups. */
const cache = new Map<string, { readonly hint: RegionHint; readonly expiresAt: number }>();

function cached(place: string): RegionHint | null {
  const hit = cache.get(place);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(place);
    return null;
  }
  return hit.hint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function createRegionHintClient(
  client: StructuredOutputModelClient = createAiSdkKimiClientFromEnvironment(),
): RegionHintClient {
  return {
    async hint(place) {
      const remembered = cached(place);
      if (remembered !== null) return remembered;
      try {
        const response = await client.generateStructuredOutput({
          requestId: `region-hint-${place}`,
          operation: "region_hint",
          schemaName: "region_hint",
          systemPrompt,
          userMessage: place,
          jsonSchema,
        });
        if (response.content === null || response.content.trim() === "") return null;
        const body: unknown = JSON.parse(response.content);
        if (!isRecord(body)) return null;
        const hint: RegionHint = { province: optionalText(body.province), prefecture: optionalText(body.prefecture) };
        // Only a real answer is remembered; a blank one would freeze a miss for a week.
        if (hint.province === null && hint.prefecture === null) return null;
        cache.set(place, { hint, expiresAt: Date.now() + cacheTtlMs });
        return hint;
      } catch (error) {
        // The region hint is an optimisation: any failure leaves the search as it was.
        logger.warn({ event: "region.hint.failed", reason: error instanceof Error ? error.name : "unknown" },
          "Region hint failed");
        return null;
      }
    },
  };
}

/**
 * The areas to look in first for a place the trip has not placed yet: 苍山 said on the first
 * turn is the mountain in 大理, which only a model knows before any destination is saved.
 * The names are a search centre, never an answer — the provider still has to find the place
 * there, and the user still confirms the card.
 *
 * A slow model is no hint at all: answering the message must not wait on this, so a call
 * that runs past `hintTimeoutMs` is abandoned and the search goes on as it would have.
 */
export async function hintedAreas(
  place: string,
  client: RegionHintClient = createRegionHintClient(),
  timeoutMs: number = hintTimeoutMs,
): Promise<readonly string[]> {
  const name = place.normalize("NFKC").trim();
  if (!/^[\p{Script=Han}]{2,12}$/u.test(name) || administrativeExpression.test(name) ||
    provinceNames.has(name)) return [];
  const hint = await withTimeout(client.hint(name), timeoutMs);
  if (hint === null) return [];
  // The prefecture narrows a search far better than its province, so it goes first.
  return [hint.prefecture, hint.province].filter((area): area is string => area !== null);
}

/** One measured answer took eleven seconds; four is already more than a message should wait. */
const hintTimeoutMs = 4_000;

async function withTimeout(answer: Promise<RegionHint | null>, ms: number): Promise<RegionHint | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([answer, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
