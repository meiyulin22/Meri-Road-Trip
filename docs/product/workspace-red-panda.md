# 工作区小熊猫 V1 交接

截至 2026-11-03，用户已认可单杯喝水和无杯地图试样。V1 已接入实际工作区，用户在本地手动验收并确认效果不错。坐下吃饼干的独立预览于 2026-11-07 获得用户认可。当前行为见 [USER_FLOW_CURRENT.md](../USER_FLOW_CURRENT.md)。

## 已确认的方向

首页与工作区共用同一只橙红色软绒小熊猫。工作区使用无帽全身站姿，背橄榄色小背包，站在地球网格下沿前方。约 150 CSS px 高可作为首轮摆位起点，实际以工作区尺寸为准。平时安静站着，偶尔看地图、走几步折返、喝水或坐下吃饼干。保温杯只在喝水时从背包取出，喝完放回，地面留空。转头配合动作，伸懒腰留待后续。

## 素材和生成记录

目前母版在本机工作目录 `C:/Users/Administrator.DESKTOP-L1LKSNR/.codex/visualizations/2026/10/28/01a18168-f905-7af3-a524-06ae0c636dd0/workspace-panda/`。以下路径均相对此目录，换机器前需复制素材。

| 文件 | 用途和验收状态 |
| --- | --- |
| `standing-no-thermos.png` | 空手无杯站姿，作为待机、走动和喝水共用参考 |
| `standing-map-no-thermos.png` | 无杯持地图站姿，供看地图和收地图共用 |
| `pilot/map-no-thermos-look.mp4` | 看地图，首尾使用同一持图参考帧，用户认可 |
| `pilot/map-no-thermos-stow.mp4` / `pilot/map-no-thermos-take-out.mp4` | 收地图和其本地倒放，用户认可。接入前看原速，确认纸边、爪子和背包口的衔接 |
| `pilot/walk-v2.mp4` | 无杯折返试样，先看向行进方向再迈步。接入前核对落脚和站回原位 |
| `pilot/drink-single-loop-preview.mp4` | 用户认可的单杯版，掏出到喝水由模型生成，放回由该段倒放。掏杯时背包短暂像是换了边，需按页面尺寸判断 |

使用 MiniMax 国内 H3 768P 图生视频。地图两条使用 6 秒首尾帧，保留任务记录和抽帧接触表。早期看地图和走动有地面杯子，早期喝水出现了第二只杯子和背景变色，这三条留作对照。已有可用候选，第一轮接入可直接复用。生成脚本、提示词和对应任务记录在同一工作目录，归档时排除密钥、鉴权头和临时下载地址。

## 首版接入和验收

1. 从 [TripWorkspace](../../src/components/trip-workspace/trip-workspace.tsx) 的 `JourneyOrbit` 与 [MeriWorld](../../src/components/companion/meri-world.tsx) 相邻位置开始。角色和地球各自渲染，保留状态气泡和它的无障碍播报。首页的探头与鼠标跟随属于独立功能。
2. 按 oil-motion 流程记录各片段、实际帧数、资源预算和交接姿势。先做一个本地透明预览，验证绿幕边缘、首尾衔接和布局，再选择用于页面的透明媒体。把确认使用的素材和可重建记录归档到项目，避免依赖某台机器的绝对路径。
3. 以空手站姿为默认态。看地图按「取图 → 看图 → 收图」串起来，走动和喝水分别从空手站姿出发并回到空手站姿。一次只播放一个动作，动作结束再选下一项，空闲时留出静止间隔。避免硬切持图与空手两个状态。
4. 在桌面和窄屏实测位置、脚底锚点、尾巴裁切、地图进出、折返脚步、杯子数量，以及原速回到站姿有没有跳。减少动态效果时使用静态站姿，页面隐藏时暂停，媒体失效时显示静态图。实现后再更新 `USER_FLOW_CURRENT.md` 的现行行为说明。

## V1 本地验收记录

首版透明交付物位于 `public/companion/workspace-red-panda/`，包括 5 条 VP9 WebM 和 2 张 WebP。画布统一为 272×284，总大小约 1.84 MB。视频无音轨，按 24 fps 播放，逐帧解码确认四角透明。原始输入、透明抽帧表 `workspace-v1-transparent-review.jpg` 和重建脚本 `tools/workspace_v1_media.py` 保存在上述本机工作目录。重建时以该目录为工作目录，执行 `python tools/workspace_v1_media.py --output <交付目录>`，脚本使用现有 FFmpeg 路径记录和 oil-motion 色键实现。

本地验收在真实旅程工作区进行，用户认可视觉效果。首轮等待约 2.5 秒，之后每组动作间隔约 6.5 秒。喝水母版仍有短暂的背包视角变化。浏览器无法保留 VP9 alpha 时使用静态空手姿势。

## 坐下吃饼干

轮播在喝水之后播放 [cookie.webm](../../public/companion/workspace-red-panda/cookie.webm)。小熊猫坐下，从背包拿一块饼干，吃完起身回到原站姿。透明 VP9 无音轨，24 fps，共 243 帧。编码沿用 V1 的色键和裁切锚点，左侧与脚底位置保持一致，画布右边多出 24 像素（296×284），给坐姿时伸开的尾巴留出空间。

本机 `cookie-pilot/README.md` 记录提示词、首尾参考图和验收素材。`cookie-pilot/pilot/cookie-sit.mp4` 是用户认可的预览对应的绿幕原片，`cookie-pilot/qa/review_cookie_pilot.py` 用来重建浅底预览和抽帧表。从 `cookie-pilot/` 运行 `python -B encode_cookie.py --output <输出目录>/cookie.webm`，会复用 V1 的 oil-motion 色键处理和 FFmpeg，并逐帧验证透明四角、角色轮廓和尾巴裁切。接入直接使用已有试片，只有最初的一次 MiniMax 生成调用。
