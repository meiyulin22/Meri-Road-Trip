import type { CatalogEntry, CatalogKind } from "./catalog-entry";

/**
 * The fixed spot tags. The catalog's own tags are free words (162 of them on 2026-11-25),
 * so code folds each into one of these before anything decides on them (outdoor or indoor,
 * later ranking). Agreed with merlin 2026-11-25.
 */
export const spotTags = [
  "山地", "水域", "海滨", "地貌", "洞穴", "森林草原", "自然", "乡村", "徒步", "水上活动", "冰雪", "观景",
  "古建筑", "历史遗迹", "宗教", "古镇街区", "园林公园", "展馆", "民俗文化", "动物", "休闲娱乐", "购物美食", "实用",
] as const;
export type SpotTag = (typeof spotTags)[number];

/** Entries of the other kinds take their kind as their one tag; their free tags only repeat it. */
export const kindTags = {
  dish: "美食",
  restaurant: "餐馆",
  stay: "住宿",
  transport: "交通",
  tip: "旅行提示",
} as const satisfies Record<Exclude<CatalogKind, "spot">, string>;

export type CatalogTag = SpotTag | (typeof kindTags)[keyof typeof kindTags];

const spotTagGroups: Record<SpotTag, readonly string[]> = {
  山地: ["山地", "登山", "登山入口", "雪山", "冰川", "高原", "峡谷", "岩壁", "岩石", "石景", "火山"],
  水域: ["水域", "湖泊", "瀑布", "泉水", "湿地", "滨水", "盐湖", "黄河", "红树林"],
  海滨: ["海岸", "沙滩", "海滩", "海岛", "岛屿", "海湾", "海港", "港口", "灯塔", "赶海", "海滨步行"],
  地貌: ["地质", "喀斯特", "岩溶", "丹霞", "雅丹", "沙漠", "沙丘", "戈壁"],
  洞穴: ["洞穴"],
  森林草原: ["森林", "雨林", "竹林", "草原", "草甸", "牧场"],
  自然: ["自然", "生态", "自然保护区", "户外"],
  乡村: ["乡村", "田园", "梯田", "农场", "村寨"],
  徒步: ["徒步", "步行", "栈道", "石阶", "骑行", "自驾", "公路"],
  水上活动: ["游船", "竹筏", "漂流", "帆船", "潜水"],
  冰雪: ["冰雪"],
  观景: ["观景", "城市观景", "拍照", "日出", "日落", "夜景", "秋色", "赏花", "花卉"],
  古建筑: ["古建筑", "建筑", "楼阁", "城墙", "土楼", "桥梁"],
  历史遗迹: [
    "历史", "古迹", "考古", "旧址", "文物", "石刻", "碑刻", "岩画", "石窟", "壁画", "陵园", "丝绸之路", "边境",
    "工业遗产", "工业历史", "水利", "水利工程",
  ],
  宗教: ["宗教"],
  古镇街区: ["古镇", "古城", "街巷", "古街", "街区", "地标", "城市地标", "广场"],
  园林公园: ["园林", "岭南园林", "假山", "公园", "植物园", "校园"],
  展馆: ["展馆", "展览", "纪念馆", "科普", "室内"],
  民俗文化: [
    "民俗", "人文", "文化", "文学", "艺术", "书法", "戏曲", "曲艺", "音乐", "演出", "工艺", "手工艺", "茶文化", "茶",
    "文创", "创意", "雕塑", "影视", "影视取景", "电影",
  ],
  动物: ["动物", "观鸟", "候鸟"],
  休闲娱乐: ["亲子", "主题乐园", "度假", "温泉", "休闲", "夜生活"],
  购物美食: ["购物", "夜市", "市集", "集市", "市场", "美食", "海鲜"],
  实用: ["住宿", "交通", "换乘", "游览入口", "城市交通"],
};

function invertGroups(groups: Record<SpotTag, readonly string[]>): ReadonlyMap<string, SpotTag> {
  const map = new Map<string, SpotTag>();
  for (const tag of spotTags) {
    for (const raw of groups[tag]) {
      if (map.has(raw)) {
        throw new Error(`Catalog tag ${raw} is listed under both ${map.get(raw)} and ${tag}.`);
      }
      map.set(raw, tag);
    }
  }
  return map;
}

export const spotTagMap = invertGroups(spotTagGroups);

export type TagNormalisation =
  | { readonly ok: true; readonly tags: readonly CatalogTag[] }
  | { readonly ok: false; readonly unknownTags: readonly string[] };

/** Fixed tags in the order of the fixed list, or the raw tags the map does not know. */
export function normaliseCatalogTags(entry: Pick<CatalogEntry, "kind" | "tags">): TagNormalisation {
  if (entry.kind !== "spot") {
    return { ok: true, tags: [kindTags[entry.kind]] };
  }

  const unknownTags = entry.tags.filter((raw) => !spotTagMap.has(raw));
  if (unknownTags.length > 0) {
    return { ok: false, unknownTags };
  }

  const found = new Set(entry.tags.map((raw) => spotTagMap.get(raw)));
  return { ok: true, tags: spotTags.filter((tag) => found.has(tag)) };
}
