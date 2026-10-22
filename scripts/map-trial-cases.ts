/**
 * The test set shared by the map provider trials (scripts/verify-tianditu.ts,
 * scripts/verify-amap-baseline.ts), so both providers answer exactly the same questions.
 */
export type Place = { readonly name: string; readonly province: string; readonly cities: readonly string[] };

/** Expected province and city for each test place; places on a border accept either side. */
export const places: readonly Place[] = [
  { name: "丽江古城", province: "云南省", cities: ["丽江"] },
  { name: "玉龙雪山", province: "云南省", cities: ["丽江"] },
  { name: "泸沽湖", province: "云南省", cities: ["丽江", "凉山"] },
  { name: "大理古城", province: "云南省", cities: ["大理"] },
  { name: "苍山", province: "云南省", cities: ["大理"] },
  { name: "洱海", province: "云南省", cities: ["大理"] },
  { name: "崇圣寺三塔", province: "云南省", cities: ["大理"] },
  { name: "双廊", province: "云南省", cities: ["大理"] },
  { name: "独克宗古城", province: "云南省", cities: ["迪庆"] },
  { name: "普达措国家公园", province: "云南省", cities: ["迪庆"] },
  { name: "松赞林寺", province: "云南省", cities: ["迪庆"] },
  { name: "雨崩村", province: "云南省", cities: ["迪庆"] },
  { name: "梅里雪山", province: "云南省", cities: ["迪庆"] },
  { name: "虎跳峡", province: "云南省", cities: ["迪庆", "丽江"] },
  { name: "石林风景区", province: "云南省", cities: ["昆明"] },
];

export const englishNames = ["Lijiang Old Town", "Jade Dragon Snow Mountain", "Erhai Lake", "Dali Ancient City", "Shangri-La"];

/** Route pairs: two drives, then two short hops a visitor would walk. */
export const routePairs: ReadonlyArray<readonly [from: string, to: string, mode: "drive" | "walk"]> = [
  ["丽江古城", "玉龙雪山", "drive"],
  ["大理古城", "双廊", "drive"],
  ["大理古城", "崇圣寺三塔", "walk"],
  ["独克宗古城", "松赞林寺", "walk"],
];
