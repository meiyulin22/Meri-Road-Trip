import { z } from "zod";

import type { CatalogEntry } from "@/domain/catalog/catalog-entry";

/** The summaries to rewrite: those that say where a fact came from (「攻略介绍…」). */
export function needsVoiceRewrite(entry: Pick<CatalogEntry, "summary">): boolean {
  return entry.summary.includes("攻略");
}

const kindWords: Record<CatalogEntry["kind"], string> = {
  spot: "景点",
  dish: "特色菜",
  restaurant: "餐馆",
  stay: "住宿",
  transport: "交通",
  tip: "提示",
};

export const voiceSystemPrompt = `你是 Meri，一个帮旅行者整理中国目的地的助手。下面每一条是 Meri 目录里的一句摘要，原来的写法总在交代出处（「攻略介绍了…」「攻略收录的…」「攻略列在…」）。请把每一句改写成 Meri 自己的口吻：直接说这个地方、这道菜或这条提示是什么，像给朋友写的一句简短笔记。

规则：
1. 不加新事实：只用原句里有的信息，不补充你自己知道的任何内容（位置、特色、做法、时间、价格都不能补）。
2. 不删事实：原句里的每一条信息都要保留，包括「可以按某名字去查」这类线索。
3. 去掉出处：不出现「攻略」「书中」，也不要换成「资料」「书里」「据介绍」之类的说法。
4. 地名和数字原样保留：原句里出现的地名一个不少、写法不变，不出现原句没有的地名；数字不改不增不减。
5. 不超过 100 字，最好和原句差不多长；用简体中文，不用「我」。
6. places 只列原句文字里真的出现的地名（省、市、县、镇、村、街、山、湖、寺等），照原句的写法；条目名称和括号里的城市不算，除非原句里也写了。

每条输入带编号 n，输出时用同一个 n，每条都要有输出。`;

export type VoiceBatchItem = {
  readonly n: number;
  readonly entry: Pick<CatalogEntry, "id" | "kind" | "name" | "summary" | "location">;
};

/** The user message: one numbered line per entry, with its kind, name and city for context. */
export function voiceUserMessage(items: readonly VoiceBatchItem[]): string {
  return items
    .map(({ n, entry }) => `${n}. [${kindWords[entry.kind]}] ${entry.name}（${entry.location.prefecture}）：${entry.summary}`)
    .join("\n");
}

export const voiceResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "summary", "places"],
        properties: {
          n: { type: "integer" },
          summary: { type: "string" },
          places: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const voiceResponseSchema = z.object({
  items: z.array(z.object({ n: z.number().int(), summary: z.string(), places: z.array(z.string()) })),
});

export type VoiceAnswer = { readonly summary: string; readonly places: readonly string[] };

/** The model's answers by item number; an item answered twice or not at all gets none. */
export function parseVoiceAnswers(content: string | null, items: readonly VoiceBatchItem[]): ReadonlyMap<number, VoiceAnswer> {
  if (!content) return new Map();
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return new Map();
  }
  const parsed = voiceResponseSchema.safeParse(json);
  if (!parsed.success) return new Map();

  const wanted = new Set(items.map(({ n }) => n));
  const counts = new Map<number, number>();
  for (const { n } of parsed.data.items) counts.set(n, (counts.get(n) ?? 0) + 1);
  return new Map(parsed.data.items
    .filter(({ n }) => wanted.has(n) && counts.get(n) === 1)
    .map(({ n, summary, places }) => [n, { summary: summary.trim(), places: places.map((place) => place.trim()).filter(Boolean) }]));
}

/** Entries in groups of `size`, numbered from 1 within each group. */
export function voiceBatches<T extends VoiceBatchItem["entry"]>(entries: readonly T[], size: number): readonly (readonly { n: number; entry: T }[])[] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`Batch size must be a positive integer, got ${size}.`);
  const batches: { n: number; entry: T }[][] = [];
  for (let start = 0; start < entries.length; start += size) {
    batches.push(entries.slice(start, start + size).map((entry, index) => ({ n: index + 1, entry })));
  }
  return batches;
}
