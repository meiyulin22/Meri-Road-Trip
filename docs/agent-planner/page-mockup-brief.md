# 计划页效果图说明

> 给你生成效果图用的描述。依据 [README.md](README.md) 第 4 节已定的页面决定；效果图只是讨论稿，不是实现要求。
> 生成后我们对着图调整，定下来的内容再写回 README。

## 建议生成三张

| 图 | 内容 | 必要性 |
| --- | --- | --- |
| A | 点 Generate plan 后的过渡：小熊沿山路走，营地是真实步骤，带进度条 | 必要 |
| B | 计划页，只有目的地时：示范第一天 + 锁住的区块 | 必要，这是最常见的状态 |
| C | 计划页，信息填全后：每天都解锁，地图显示当天路线 | 可选 |

**界面文字建议用英文生成**：图像工具画中文字经常出错，英文清楚得多。Meri 本来就支持英文界面，地名照样写中文拼音或英文。

## 共同的视觉风格

和现在的首页、Workspace 一致：
- 背景暖米色 `#f4f1e8`，卡片接近白色 `#fffdfa`，正文深森林绿 `#17352c`，次要文字灰绿 `#5d6f68`，强调色赤陶橙 `#c95f3d`。
- 页面边缘露出像素风的高山湖泊风景（同 `public/backgrounds/workspace-alpine-day.png`），像窗外的风景。
- 品牌标题用像素字体（Geist Pixel），正文用干净的无衬线字体。
- 圆角卡片、细边框、很轻的阴影，安静、有纸质感，不要霓虹、渐变和科技蓝。
- 小熊是 64px 像素风棕色小熊，戴绿色探险帽、背包，憨厚。

## 图 A：生成中的过渡

画面：
- 全屏，宽银幕比例。背景是像素风的山景，从近处的草地营地延伸到远处的雪山。
- 一条蜿蜒的小路从左下走向右上的山顶，路上有 5 个小营地（帐篷 + 小旗）：
  1. 核实地点 ✓（已点亮，暖黄色灯光）
  2. 查开放时间 ✓（已点亮）
  3. 查景点之间的路程（小熊正走到这里，旗子在飘）
  4. 查天气（未点亮，灰色）
  5. 排好第一天（山顶，未点亮）
- 像素小熊在第 3 个营地旁，一边走一边看地图。
- 画面下方一条简洁的进度条，约 50%，旁边一行字："Checking how long it takes from Jade Dragon Snow Mountain to Blue Moon Valley…"
- 左上角像素字体的 "Meri"，中间偏上一行大字 "Planning your first day in Lijiang"。

## 图 B：只有目的地时的计划页

桌面宽屏，两栏布局。

**顶部**
- 左边 Meri 标志；中间标题 "Lijiang & Dali"，下面一行总览："Day 1 ready · 3 sections waiting for you"。
- 标题下一排小标签："Meri remembers: no spicy food · max 15 km walking a day · travelling with parents"，每个标签有小 ×。

**左栏（约 60% 宽）：竖向排列的区块卡片**
1. **Getting there**（锁住）：淡色卡片，左边小锁图标，文字 "Tell me where you're starting from and I'll look up flights and trains"，下面一个输入框 "Departure city"，和三个可点的小按钮 "Self-drive / Train / Flight"。
2. **Day 1 · Lijiang**（已生成，最显眼）：卡片顶部一张玉龙雪山照片。下面是时间线：
   - 08:30 Jade Dragon Snow Mountain — opens 07:00–16:00 · reservation required · ☎ phone
   - 🚗 35 min · 28 km
   - 12:30 Blue Moon Valley — open all day
   - 🚗 40 min
   - 16:00 Lijiang Old Town — stay nearby, 3 hotels from ¥280
   卡片底部一条绿色的可行性提示："✓ Feasible: 2 h 15 min on the road, finishes before sunset"，以及一行灰色的 "Unknown: cable car queue time — check on the day"。
3. **Days 2–5**（锁住）："Tell me how many days you'll travel and I'll plan the rest"，下面一排可点的小圆角按钮 "3 days / 5 days / 7 days / Custom"。
4. **Weather & hotel prices**（锁住）："Tell me your start date"，下面一个日期按钮。

**右栏（约 40% 宽，滚动时固定）：地图**
- 高德风格的浅色地图，画出第 1 天的路线：三个编号点（1 玉龙雪山、2 蓝月谷、3 丽江古城）之间的连线。
- 地图上方一排小标签切换天数："Day 1 · Day 2 🔒 · Day 3 🔒"。
- 地图下方角落，小熊坐在营地小桌后看地图（就是 Workspace 现在的小熊）。

**底部**
- 一个横跨左栏的对话输入框，占位文字 "Tell Meri what to change — e.g. Day 1 feels too rushed"，右边发送按钮。

## 图 C：信息填全后（可选）

和图 B 同样的布局，区别是：
- "Getting there" 已解锁，收起成一行结果："Shanghai → Lijiang · Flight · from ¥860 (checked 10:20) · 修改"。
- Day 1 到 Day 5 都已生成，左栏是五张日卡，当前选中 Day 2（大理洱海）。
- 地图显示第 2 天的路线。
- 每张日卡右上角有天气："☀ 18°/6°"。

## 可以直接复制的生成提示（英文）

**图 A**

> A wide web app screen for a travel planning app called Meri, shown while it plans a trip. Pixel-art landscape: a green alpine meadow in the foreground rising to snowy peaks, warm morning light. A winding trail climbs from bottom left to a summit at top right, with five small pixel campsites along it (tent and flag). The first two campsites glow warm yellow, the third has a waving flag, the last two are grey and unlit. A cute 64px pixel-art brown bear with a green explorer hat and backpack walks near the third campsite, reading a map. At the bottom, a minimal rounded progress bar at about 50% with a short line of text: "Checking how long it takes from Jade Dragon Snow Mountain to Blue Moon Valley…". At the top, the word "Meri" in a pixel font and a large heading "Planning your first day in Lijiang". Colours: warm cream #f4f1e8, deep forest green #17352c, terracotta accent #c95f3d. Calm, cosy, game-like, no neon, no gradients.

**图 B**

> A desktop web app screen for a travel planning app called Meri, cosy paper-like design. Warm cream background #f4f1e8, near-white rounded cards with thin borders and soft shadows, deep forest green text #17352c, terracotta accent #c95f3d, pixel-art alpine lake scenery visible around the edges of the page. Header: the pixel-font logo "Meri", the title "Lijiang & Dali", a subtitle "Day 1 ready · 3 sections waiting for you", and a row of small removable chips "Meri remembers: no spicy food · max 15 km walking a day · travelling with parents". Two columns. Left column, a vertical stack of cards: a faded locked card "Getting there" with a small lock icon, the text "Tell me where you're starting from and I'll look up flights and trains", a departure-city input and three small pill buttons "Self-drive / Train / Flight"; a prominent card "Day 1 · Lijiang" with a photo of Jade Dragon Snow Mountain on top and a timeline: "08:30 Jade Dragon Snow Mountain — opens 07:00–16:00 · reservation required", "35 min drive", "12:30 Blue Moon Valley", "40 min drive", "16:00 Lijiang Old Town — 3 hotels nearby from ¥280", ending with a green note "Feasible: 2 h 15 min on the road, finishes before sunset" and a grey note "Unknown: cable car queue time"; a faded locked card "Days 2–5" with "Tell me how many days you'll travel" and pill buttons "3 days / 5 days / 7 days / Custom"; a faded locked card "Weather & hotel prices" with "Tell me your start date". Right column, sticky: a light map in the style of Amap showing a route through three numbered points, day tabs above it "Day 1 · Day 2 · Day 3" with the later days locked, and a small 64px pixel-art brown bear with a green explorer hat sitting behind a small camp table reading a map in the corner. Bottom: a wide chat input "Tell Meri what to change — e.g. Day 1 feels too rushed" with a send button.

**图 C**

> The same Meri travel planning screen as before, now fully planned. The "Getting there" card is collapsed into a single line: "Shanghai → Lijiang · Flight · from ¥860 (checked 10:20) · Change". The left column shows five day cards, Day 1 to Day 5, each with a small weather badge like "☀ 18° / 6°"; Day 2 "Dali · Erhai Lake" is selected and expanded with its timeline. The map on the right shows Day 2's route around Erhai Lake. Same cosy cream, forest green and terracotta style with pixel alpine scenery around the edges.

## 看效果图时请重点看

1. 锁住的区块是否让人想去填，还是像"出错了"。
2. 示范第一天够不够显眼，像一个"惊喜"而不是半成品。
3. 地图和日卡的比例，以及手机上怎么排（手机上地图可能要折叠到日卡里）。
4. 过渡页的小熊：一跳一跳前进就够，还是需要真正的走路动作。
