import { isChinaProvince } from "@/domain/location/china-destination-scope";
import { provincesOfRegionNickname } from "@/domain/location/china-region-nicknames";
import { createAiSdkKimiClientFromEnvironment } from "@/platform/llm/ai-sdk-kimi-client";
import type { StructuredOutputModelClient } from "@/platform/llm/kimi-client";
import { logger } from "@/platform/observability/logger";

/**
 * What kind of words these are, as a traveller means them: 江浙沪 is a group of provinces,
 * 云南 one province, 丽江 a city, 苍山 a sight. Only a model knows this before any search —
 * to a map, 江浙沪 is a string, and the first page held a shop of that name in 石家庄.
 */
export type PlaceKind = "province_group" | "province" | "city" | "sight" | "unknown";

/** How the model reads a name the trip has not placed yet, and where it usually is. */
export interface RegionHint {
  readonly kind: PlaceKind;
  /** For a province or a group of provinces: their full names (江苏省、浙江省、上海市). */
  readonly provinces: readonly string[];
  readonly province: string | null;
  readonly prefecture: string | null;
  /** The name a national map files it under, when that differs from the words (苍山 → 点苍山). */
  readonly officialName: string | null;
}

export interface RegionHintClient {
  /** Never throws: not knowing is null, and the search then falls back to the whole country. */
  hint(place: string): Promise<RegionHint | null>;
}

const jsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "provinces", "province", "prefecture", "officialName"],
  properties: {
    kind: { type: "string", enum: ["province_group", "province", "city", "sight", "unknown"],
      description: "province_group: an everyday name for several whole provinces (江浙沪、京津冀、川渝、东三省、两广). province: one province. city: a prefecture-level or county-level city. sight: a scenic spot, mountain, lake, old town or other place to visit. unknown: not a place, or you do not know it." },
    provinces: { type: "array", items: { type: "string" }, maxItems: 6,
      description: "For province_group or province: the full province-level names it means (江苏省、浙江省、上海市). Empty otherwise." },
    officialName: { type: ["string", "null"],
      description: "For a sight or city whose official or map name differs from the words given (苍山 → 点苍山): that name. Null when the words already are its name or you are unsure." },
    province: { type: ["string", "null"],
      description: "Full province-level name, e.g. 云南省、四川省、北京市, or null when unsure." },
    prefecture: { type: ["string", "null"],
      description: "The prefecture-level city or autonomous prefecture it is usually in, e.g. 大理白族自治州、丽江市; null for a 直辖市." },
  },
};

const systemPrompt = `You read a Chinese place name the way a traveller means it.
The user gives the words for one place. Say what kind of place they name, and where it is.
- An everyday name for several whole provinces is a province_group, with those provinces in full: 江浙沪 is 江苏省、浙江省、上海市; 京津冀 is 北京市、天津市、河北省; 川渝 is 四川省、重庆市; 东三省 is 辽宁省、吉林省、黑龙江省. A name that is not whole provinces (潮汕、川西、苏南) is not a province_group.
- For a city or sight, give the province-level region and the prefecture-level city it is usually in — the famous one when the name is shared, because a traveller naming it means the one worth visiting. 苍山 is a sight in 云南省 / 大理白族自治州, officially 点苍山. 稻城亚丁 is a sight in 四川省 / 甘孜藏族自治州.
- A shop, restaurant or company that happens to carry the name does not count: read the words as the place a traveller means.
Answer only for places inside China. When you do not know the place, or it is not a place at all, answer kind unknown and null for the rest. Never guess a prefecture you are unsure of: a wrong region sends the search to the wrong county.
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
        const kinds: readonly PlaceKind[] = ["province_group", "province", "city", "sight", "unknown"];
        const kind = kinds.find((item) => item === body.kind) ?? "unknown";
        // The model's provinces are kept only when they are real ones: the code checks, the model decides.
        const provinces = Array.isArray(body.provinces)
          ? [...new Set(body.provinces.flatMap((name) => typeof name === "string" && isChinaProvince(name.trim()) ? [name.trim()] : []))] : [];
        const hint: RegionHint = { kind, provinces, province: optionalText(body.province), prefecture: optionalText(body.prefecture),
          officialName: optionalText(body.officialName) };
        // Only a real answer is remembered; a blank one would freeze a miss for a week.
        if (hint.kind === "unknown" && hint.province === null && hint.prefecture === null) return null;
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
  const hint = await readPlace(place, client, timeoutMs);
  if (hint === null || hint.kind === "province_group") return [];
  // The prefecture narrows a search far better than its province, so it goes first.
  return [hint.prefecture, hint.province].filter((area): area is string => area !== null);
}

/**
 * The model's reading of a place name, or null when there is nothing to ask (a name that
 * already carries its level, a bare province) or the model did not answer in time. Every
 * caller shares the one cached answer per name, so asking twice costs one call.
 */
export async function readPlace(
  place: string,
  client: RegionHintClient = createRegionHintClient(),
  timeoutMs: number = hintTimeoutMs,
): Promise<RegionHint | null> {
  const name = place.normalize("NFKC").trim();
  if (!/^[\p{Script=Han}]{2,12}$/u.test(name) || administrativeExpression.test(name) ||
    provinceNames.has(name)) return null;
  return withTimeout(client.hint(name), timeoutMs);
}

/**
 * The provinces a name such as 江浙沪 stands for, or null when it names something else.
 * The model decides; the small table of undisputed nicknames answers only when the model
 * could not (no key, a timeout, an unreadable reply), so a slow model never sends 江浙沪 to
 * the map. When the model did answer, its reading stands, even against the table.
 */
export async function provincesOfPlace(
  place: string,
  client: RegionHintClient = createRegionHintClient(),
  timeoutMs: number = hintTimeoutMs,
): Promise<readonly string[] | null> {
  const fallback = provincesOfRegionNickname(place);
  const hint = await readPlace(place, client, timeoutMs);
  if (hint === null) return fallback;
  return hint.kind === "province_group" && hint.provinces.length >= 2 ? hint.provinces : null;
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
