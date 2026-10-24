/**
 * 列出运行时补图时最常"配不上图"的景点，供人工补进 public/photos 图集：
 *
 *   npx tsx scripts/photo-misses.ts            # 读 MERI_MEDIA_DIR，未设置时读 .cache/media
 *   npx tsx scripts/photo-misses.ts 20         # 只列前 20 个
 *
 * 只读本地记录（MERI_MEDIA_DIR/place-photos/misses/），不请求 Pixabay，也不改任何文件。
 * 对清单里值得补的景点：挑一张审核过的图，用 scripts/fetch-place-photos.ts 按图片 ID
 * 下载并登记地区和别名，人工看过改动后再提交。
 */
import { join } from "node:path";

import { MediaPhotoStore } from "../src/platform/place-photos/media-photo-store";

const reasonNames: Record<string, string> = {
  no_identity: "没写这个景点名",
  not_in_china: "没表明在中国",
  foreign: "提到国外地点",
  other_province: "提到别的省",
  other_region: "提到别的市",
  too_small: "图太小或竖图",
};

async function main(): Promise<void> {
  const directory = process.env.MERI_MEDIA_DIR?.trim() || join(process.cwd(), ".cache", "media");
  const limit = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 50;
  const misses = await new MediaPhotoStore(directory).listMisses();
  if (misses.length === 0) {
    console.log(`没有记录：${join(directory, "place-photos", "misses")}`);
    return;
  }
  console.log(`共 ${misses.length} 个景点配不上图（${directory}），按次数排序：\n`);
  for (const miss of misses.slice(0, limit)) {
    const reasons = Object.entries(miss.rejected).sort((left, right) => right[1] - left[1])
      .map(([reason, count]) => `${reasonNames[reason] ?? reason} ${count}`).join("，") || "没有候选";
    const searches = miss.searches.map((search) => `${search.q} [${search.lang}] ${search.hits} 条`).join("；");
    console.log(`${miss.count} 次  ${miss.landmark}（${miss.province} ${miss.region}）  最近 ${miss.lastAt.slice(0, 10)}`);
    console.log(`      搜索：${searches}`);
    console.log(`      被拒：${reasons}${miss.rejectedFiles ? `；文件不合格 ${miss.rejectedFiles}` : ""}`);
  }
}

void main();
