/**
 * Names that end in a facility rather than the place itself: the ticket office, the car
 * park, the gate, the viewing platform, the cable car. The provider files them under the
 * same scenic-area category as the place they serve — 稻城亚丁风景区仁村观景台 is typeCode
 * 180400, exactly like 甘孜州稻城亚丁景区 — so the category cannot tell them apart and only
 * the name can. Meri never offers one of these as the answer when a real place is available.
 */
const facilityEndings: readonly string[] = [
  "大门", "北门", "南门", "东门", "西门", "正门", "侧门",
  "入口", "出口", "售票处", "售票点", "售票厅", "售票",
  "游客中心", "游客集散中心", "游客服务中心", "服务中心", "服务点",
  "停车场", "观景台", "索道", "缆车", "电瓶车",
  "验票点", "检票口", "管理站", "派出所", "检查站", "厕所", "公厕",
];

export function isFacilityName(name: string): boolean {
  const normalized = name.normalize("NFKC").trim();
  return facilityEndings.some((ending) => normalized.endsWith(ending));
}

