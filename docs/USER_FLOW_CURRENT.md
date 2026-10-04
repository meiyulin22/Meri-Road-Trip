# Meri 当前用户操作流程与回复来源

> 按 2026-10-01 工作区源码核对，包含已落地的 destination 重构和 UI 调整。沿用原有章节、流程图、操作表及代码索引，用于业务追踪与向用户讲解。本文描述实际调用路径；输入示例是按规则推导，未来能力明确标为计划。Home 指 `/`，Workspace 指 `/trips/[id]`，Journey 是持久化旅程。完整目录、分层与逐文件说明见 [CODEBASE_GUIDE.md](CODEBASE_GUIDE.md)。

## 先看全局

```mermaid
flowchart TD
  A[首页 /] -->|输入旅行想法| B[Kimi 提取 TripDraft]
  B --> C[校验普通字段及 destinationEdit]
  C --> D{有地点提案？}
  D -->|有| E[高德核验：精确地点写入，其余准备候选]
  E -->|有候选或失败| G[创建 Journey、状态、原话、候选消息]
  E -->|全部精确写入| F
  D -->|无| F[创建 Journey 后生成 opening 回复]
  G --> W[Workspace /trips/id]
  F --> W
  A -->|最近旅程| W
  L[旅程列表 /trips] --> W
  W -->|聊天| I[Kimi 结构化解释]
  I --> J[应用校验并保存普通字段]
  J --> K{destinationEdit}
  K -->|add/set 精确且是原话| P2[直接写入目的地]
  K -->|add/set 不确定| P[核验并保存待选卡，目的地不变]
  P2 --> N
  K -->|remove| R[当前状态匹配，唯一目标删除]
  K -->|none| N{推荐意图且状态允许？}
  N -->|是| S[先保存模型引导 + pending；卡片由第二个请求 Bocha + Kimi + 省份过滤生成]
  N -->|否| T[模型 reply]
  P --> M[保存真实用户与助手消息]
  R --> M
  S --> M
  T --> M
  M --> W
  W -->|勾选后统一提交| V[取保存的卡片 ID，复核高德，保存目的地]
  W -->|编辑字段、搜索、删除| Q[独立确定性 API]
  W -->|Generate plan| H[只检查准备度]
  V --> W
  Q --> W
  H --> W
```

**数据权威：**TripState 是当前决定，模型输出是提案，助手卡片是待选项，聊天记录是历史。核验成功不代表用户已经选择；显式提交后的地点才进入正式 destination。删除后不能因为历史里提过就自动恢复。

**谁决定执行什么：**LLM 理解语言并输出受限 JSON；应用校验 JSON、判断可执行分支、调用高德和保存；React 根据受支持的 presentation 渲染。workflow 是我们写的确定性应用流程。Vercel AI SDK 用于模型调用及聊天适配；当前没有 Vercel Workflow 执行器或开放式 Agent 循环。

代码：[TripState](../src/domain/trip-state/trip-state.ts)、[消息模型](../src/domain/trip-message/trip-message.ts)、[聊天 API](../src/app/api/trip-workspace/messages/route.ts)、[AI SDK 客户端](../src/platform/llm/ai-sdk-kimi-client.ts)。

## 1. 用户能从哪里进入

| 入口与操作 | 页面/组件 | 到达结果 |
| --- | --- | --- |
| 首页输入一句旅行想法 | [`/`](../src/app/page.tsx) → [NewTripComposer](../src/components/meri-shell/new-trip-composer.tsx) | 提取草稿，创建 Journey，开场成功后跳转 Workspace |
| 首页点最近旅程 | [RecentJourneys](../src/components/meri-shell/recent-journeys.tsx) | 打开既有 Journey，不重新提取草稿 |
| `/trips` 点旅程卡 | [旅程列表](../src/app/trips/page.tsx) | 打开已有 Workspace |
| Workspace 左侧新旅程 | [TripWorkspace](../src/components/trip-workspace/trip-workspace.tsx) | 返回首页输入入口 |
| `/trips/new` | [重定向](../src/app/trips/new/page.tsx) | 返回首页 |

### 1.1 访客身份、列表与刷新

1. 访客 cookie 提供 ownerGuestId；当前是访客所属 Journey，没有账号协作体系。
2. Workspace 加载先验证 Trip 属于访客，再加载 TripState 和保存的消息。
3. 不存在或不属于访客的 Journey 按 404 处理；Trip 存在但状态缺失属于不完整旅程错误。
4. 刷新读取保存的正文和 presentation，不因刷新重跑 Kimi 或重新生成卡片。
5. JourneySummary 是列表读模型，不作为修改或未来规划的事实基底。

代码：[页面加载](../src/app/trips/[id]/page.tsx)、[访客身份](../src/platform/identity/guest-identity.ts)、[JourneyService](../src/capabilities/journey/journey-service.ts)、[消息服务](../src/capabilities/conversation/trip-message-service.ts)、[列表查询](../src/capabilities/journey/my-journeys.ts)。

### 1.2 界面语言（中 / EN）

首页右上角、Profile 右边有「中 | EN」切换（[LanguageToggle](../src/components/ui/language-toggle.tsx)）。

1. 点击后浏览器写入 cookie `meri_locale`（`zh` 或 `en`，一年，全站，非 httpOnly——只存语言，不含私密信息），再 `router.refresh()`：服务端用新语言重画当前页面，网址不变（没有 `/en/...` 路由）。
2. 服务端每次渲染读 [requestLocale](../src/platform/locale/request-locale.ts)：有合法 cookie 用它；没有时按浏览器 `Accept-Language`，中文排在英文前面就用中文，其他情况（包括法语、德语、没有该请求头）用英文，因为 Meri 的用户来自各国。
3. 根布局据此设置 `<html lang>`（`zh-CN` / `en`）、页面标题与描述，并用 [LocaleProvider](../src/components/i18n/locale-context.tsx) 把语言交给客户端组件；界面文字都取自 [messages](../src/components/i18n/messages.ts) 的同一份中英字典，英文定结构、中文必须一一对应（缺一句类型检查就失败）。
4. 旅程名、地名、目的地等数据不翻译，按保存时的样子显示。

**当前范围：**按钮只在首页，但所有界面文字都跟随同一个 cookie：首页（1.0029）、旅程页面和「我的旅程」列表（1.0032）——页头、导航、对话框里的提示/状态/错误、旅程概览各字段与编辑器、目的地搜索、地点卡、日历（react-day-picker 的中/英 locale）、Generate plan 说明、小熊的话、聊天时间（昨天/Yesterday）、错误页和页面标题。纯函数（小熊、准备度、日期概括、时间）由调用方传入字典，不自己判断语言。精确天数按语言显示（7天 / 7 days），其余写法（7天6晚、大概一周）原样保留。品牌标语（Explore Further With Meri、Small steps. A wider world.）两种语言都保持英文。旧的 `destination-recommendation-picker.tsx` 不在主链路上，未翻译。**Meri 在代码里写的句子（1.0033）也跟按钮走**：「已加入…」「找到…相关的地点了」「暂时没找到…」、搜索提示、准备度句子、选卡确认（「好，已加入…」）、推荐卡上方的固定句和没推荐出来时的说明，都由 [meri-replies](../src/capabilities/conversation/meri-replies.ts) 按 cookie 取中文或英文，句子之间的连接（中文直接相连、英文加空格）、列表分隔（、/ , ）和引号（「」/ “”）也在那里。代码**不判断**用户写的是什么语言。**模型写的文字（1.0034）也以按钮为准**：聊天回复和开场回复（[workspace-conversation-prompt](../src/capabilities/conversation/prompts/workspace-conversation-prompt.ts)）、推荐卡理由（[destination-recommendation-prompt](../src/capabilities/recommendation/prompts/destination-recommendation-prompt.ts)，中文 ≤30 字、英文 ≤15 词）、首页第一句话提取出的旅程名（[trip-draft-prompt](../src/capabilities/journey/prompts/trip-draft-prompt.ts)）和聊天里改的旅程名，都由路由用 `requestLocale()` 读 cookie 后传进提示词（[reply-language-guidance](../src/capabilities/conversation/prompts/reply-language-guidance.ts) 一处写定措辞）。只有聊天/开场回复允许跟随：用户这条消息明显是另一种语言时，提示词要求模型改用那种语言回复，是否"明显"全由模型判断——地名或单个外来词不算换语言；推荐理由和旅程名始终用按钮选的语言，因为它们显示在界面里。实测（kimi-k2.6，跨语言用例各跑 3 次）模型仍一直用按钮语言回复，跟随尚未生效，暂不处理。地名：`destinationEdit` 里仍是用户打的原样（英文界面下打 Yunnan 就交给高德查 Yunnan；2026-10-04 实测高德查不到拉丁地名：Yunnan、Sichuan、Hainan、Lijiang、Sanya、Shangri-La、Dali、Chengdu、Guilin、Jade Dragon Snow Mountain 都是 unresolved，Hong Kong 返回 ambiguous，所以英文用户目前需要打中文地名或用目的地搜索，暂不处理），英文句子里模型可能写 Hainan、Sanya 这类通用英文名；推荐卡的省、市和配图地标仍是中文（schema 和高德要求）。**不翻译的：**已保存的消息、已保存的旅程名和地名是数据，切换语言后按保存时的样子显示。

中文标题「你想去哪里？」不走像素标题组件，而是普通 `<h1>`，字体按系统依次取苹方 → 思源黑体 → 微软雅黑（`--font-cjk-sans`，字重 500）：像素字体（Geist Pixel）没有中文字形，它自带的后备字体又以 monospace 结尾，Windows 上可能落到等宽中文字体。英文标题仍是像素字体。

## 2. Home 新建 Journey：输入一句话之后

```mermaid
flowchart TD
  U[非空用户原话] --> A[POST /api/trip-drafts]
  A --> B[Kimi 输出普通字段和 destinationEdit]
  B --> C{JSON 与领域校验通过？}
  C -->|否| X[错误提示，保留输入]
  C -->|是| D[POST /api/journeys]
  D --> E{有原话且有地点 edit？}
  E -->|是| G[applyDestinationEdit 查询高德]
  G --> H[准备固定正文与可用候选]
  H --> I[保存 Trip、TripState、原话及可选助手消息]
  E -->|否| I
  I --> J{已有固定开场？}
  J -->|是| W[进入 Workspace]
  J -->|否| K[Kimi opening 模式]
  K -->|成功| W
  K -->|失败| R[Journey 保留，可重试回复或先进入]
```

### 2.1 提取阶段：只理解，不保存旅程

[客户端模型](../src/components/meri-shell/new-trip-composer-model.ts)把 trim 后的非空原话作为 `{message}` 提交 [trip-drafts API](../src/app/api/trip-drafts/route.ts)。[TripDraftExtractor](../src/capabilities/journey/trip-draft-extractor.ts)调用结构化模型；[prompt](../src/capabilities/journey/prompts/trip-draft-prompt.ts)规定提取规则；[领域校验](../src/domain/trip-draft/trip-draft.ts)保证合法形状。

草稿包括 name、origin、startDate、endDate、duration、transportPreference 六个普通字段，另有 destinationEdit。目的地不再由模型拼一个包含所有旧地点的 destination.value。

普通字段支持 known、approximate、ambiguous、missing。日期解释使用参考日期和时区；交通 known 值只支持 self_drive、no_self_drive、public_transport、flexible。这一步没有 Journey ID、数据库副作用或助手正文。

模型输出由 [salvageTripDraft](../src/domain/trip-draft/trip-draft.ts)逐项读取：某个字段不合格就按 missing，destinationEdit 不合格（包括自造 providerId）就按 none，结束早于开始时丢弃结束日期，schema 外的键忽略；丢弃项记录 `trip_draft.parts_dropped` 警告。只有输出根本不是对象时才失败。以前一个坏字段就让用户无法创建旅程。浏览器提交到 journeys API 的草稿仍由 validateTripDraftDomain 严格校验。

### 2.2 创建阶段：地点提案与正式状态分开

客户端提交 `{draft, initialUserMessage}` 到 [journeys API](../src/app/api/journeys/route.ts)。[createJourneyWithOpening](../src/capabilities/journey/create-journey-with-opening.ts)再次校验草稿；有原话且 destinationEdit 不为 none 时，以 missing 目的地为基底执行地点操作。

- add/set 查询地点。**精确匹配**直接作为初始目的地：提供方只返回一个地点（或多条记录都落在同一省/市/spot 偏好），名称等于用户原话或只多出行政/景区后缀（大连→大连市、迪庆→迪庆藏族自治州、玉龙雪山→玉龙雪山风景区），或前面只多出它自己所在的市/区县（西湖→杭州西湖风景名胜区、稻城亚丁→甘孜稻城亚丁景区），**且这个表达确实出现在用户原话里**。名称匹配的完整规则见 3.2「名称匹配」。其余（错别字、多个可能、宽泛区域、模型改写过的名称）生成待选卡。
- 有候选或找不到的表达时，保存应用模板开场（[destinationEditReply](../src/capabilities/conversation/turn-reply.ts)）和 presentation，告知点击添加后才会记入旅程。
- 没结果或提供方失败时保存事实说明，不写无法验证的地点。
- 没有上述固定开场时（包括地点已精确写入），创建后执行 opening 模式；opening 看到已保存的目的地，不宣称是否可以生成计划，最多问一个问题。
- 没有 initialUserMessage 的接口调用返回 not_requested；首页正常路径提供原话。

[initializeTripState](../src/domain/trip-state/trip-state.ts)建立初始状态，目的地初始 missing；精确匹配的地点由 [JourneyService.createJourney](../src/capabilities/journey/journey-service.ts) 的 initialDestination 参数写入初始状态。草稿中的普通字段可保留；其余目的地由后续用户选择提交产生。

### 2.3 保存、回滚与开场重试

[JourneyService.createJourney](../src/capabilities/journey/journey-service.ts)顺序保存 Trip、TripState、用户原话及可选固定助手消息。状态/消息保存失败时尝试删除 Trip；清理失败保留创建与清理的两份错误。这是补偿回滚，并非整个调用链的一笔数据库事务。

[OpeningConversationService](../src/capabilities/conversation/opening-conversation-service.ts)调用 Kimi opening 模式：只允许 reply，拒绝 changes、目的地 edit 和推荐意图。因此开场不会再次修改已经创建的状态。

模型开场失败后 Journey 仍存在。首页进入 opening_failed，提供“重试 Meri 回复”和“先进入旅程”。重试调用 [conversation/initialize](../src/app/api/trips/[id]/conversation/initialize/route.ts)，服务检查现有消息及开场资格，使用确定的助手消息身份减少重复写入；不会重新创建 Journey。

**回复来源：**普通开场是 Kimi；地点候选/失败开场是应用模板。无保存消息时 [ConversationPanel](../src/components/trip-workspace/conversation-panel.tsx)还可能显示本地占位，它不代表数据库已有助手消息。

## 3. Workspace 聊天：每条输入如何分流

```mermaid
flowchart TD
  U[用户原话] --> A[POST /api/trip-workspace/messages]
  A --> B[验证 owner，读取状态与历史]
  B --> C[Kimi 输出四项 JSON]
  C --> D[校验输出并生成普通字段 patch]
  D --> E[保存普通字段]
  E --> F[applyDestinationEdit]
  F -->|add/set 精确且是用户原话| G1[直接写入，带预期目的地保存]
  F -->|add/set 不确定| G[候选或失败事实，目的地不变]
  F -->|remove| H[唯一目标删除，带预期目的地保存]
  F -->|none| I[判断推荐资格]
  G1 --> I
  H --> I
  I -->|within / elsewhere| J[正文后挂 pending 标记]
  I -->|不允许| K[模型 reply]
  G --> L[destinationEditReply 组装正文及 presentation]
  J --> L
  K --> L
  L --> M[保存真实用户和助手消息]
  M --> N[返回 interpretation、tripState、messages]
  N -->|最后一条是 pending| P[客户端 POST destination-recommendations]
  P --> Q[推荐工作流 → 卡片作为下一条助手消息]
```

### 3.1 模型实际决定什么

[interpretWorkspaceConversation](../src/capabilities/conversation/workspace-conversation-interpreter.ts)调用一次 generateStructuredOutput，输入当前 TripState、用户原话、参考日期/时区和最近对话。

[历史选择器](../src/capabilities/conversation/workspace-conversation-context.ts)最多取最近 5 轮、6000 字符，先合并连续助手消息，避免选卡确认因没有新用户原话而被遗漏。[conversation-history-content](../src/capabilities/conversation/conversation-history-content.ts)将持久化卡片转成上下文内容。

| 字段 | 合法值/形状 | 用途 |
| --- | --- | --- |
| presentationIntent | none / destination_recommendations / destination_recommendations_elsewhere | 推荐信号，应用再检查资格；elsewhere 表示扩大到尚未保存的省份 |
| changes | 六类普通字段的修改数组 | field、state、value；不能改 destination 或重复字段 |
| destinationEdit | none / add / set / remove | 本次用户提及的地点操作，不重写整个旧目的地 |
| reply | 非空文字 | 暂定自然回复；有地点事实时排在应用句子之后，有卡或失败时被省略 |

受限 JSON 示例（按规则构造，不代表某次线上原始输出）：

```json
{
  "presentationIntent": "none",
  "changes": [],
  "destinationEdit": {
    "operation": "add",
    "places": ["梅里雪山"],
    "broadRegion": null
  },
  "reply": "我帮你确认一下梅里雪山的位置。"
}
```

[destinationEdit schema](../src/domain/trip-state/destination-edit.ts)在严格模型输出里要求 operation、places、broadRegion 都出现；校验后的领域 none 只保留 operation，remove 不保留 broadRegion。places 最多 6 个表达、每个最多 80 字符，trim 后去重。

- add 是追加提议，保留现有目的地。
- set 用于首次提及地点，和 add 一样只生成追加卡；已有目的地时也不能清空旧项。只有用户明确表示不去某个已保存地点，才用 remove 删除对应省/市/spot。
- remove 是删除当前保存目标。
- broadRegion 表示潮汕等宽泛区域，places 为模型提出的具体表达，仍需高德验证，且总是出卡。
- places 应保留用户原话，包括错别字（大莲仍是大莲）。模型改写过的名称即使精确匹配也只出卡：应用检查表达是否出现在用户原话里，因为模型曾把“大莲”改写成“大理”并直接写入。

[Workspace prompt](../src/capabilities/conversation/prompts/workspace-conversation-prompt.ts)要求区分明确修改与提问、保留用户决定及具体景点表达、缺目的地时推荐或追问。不允许编造未研究的实时事实或直接写行程。其余规则：

- 回复不说地点“已记录/已添加/已加入”，目的地发生了什么由应用的句子说明。
- 不说旅程能否生成计划；用户问时不回答这一点，只问一个缺失信息（先问出发地）。
- 天气只可说季节特征（旱季/雨季、冷热、是否可能下雪），并说明是一般情况，不报温度、降雨等数字，建议临近出发查预报；价格、开放时间、人流、路况一律说暂时查不到。
- 每次回复最多一个问题。
- 明确要求推荐（“推荐一下”“有什么好地方”）本身就够出卡，不先追问日期或偏好；推荐回合的正文只说要推荐，不点名任何地点、不列举、不承诺数量、不提问。

当前没有 intent、destinationDisambiguation 和旧 resolve_location 前置工具。模型不能生成 providerId、宣称数据库操作成功或生成任意 React/CSS。LLM 判断语义，应用负责执行权限和事实边界。

### 3.2 应用实际决定什么

**名称匹配：**[resolveDestinationCandidates](../src/domain/location/destination-resolution-policy.ts)决定高德结果里哪些算用户说的地方，[namesSamePlace](../src/capabilities/destination/resolve-destination-place.ts)决定其中哪些"精确"到可以直接加入。按顺序：

| 规则 | 例子（2026-10-04 实测高德名称） | 结果 |
| --- | --- | --- |
| 与用户原话完全相同 | 大昭寺 → 大昭寺 | 精确，直接加入 |
| 原话＋行政/景区后缀 | 玉龙雪山 → 玉龙雪山风景区；大连 → 大连市 | 精确，直接加入 |
| 前面只多出它**自己所在**的市/区县（前缀取名称与该记录市/区县名开头相同的部分，至少 2 字，所以自治州的简称"甘孜"不需要民族名单） | 西湖 → 杭州西湖风景名胜区（杭州市）；稻城亚丁 → 甘孜稻城亚丁景区（甘孜藏族自治州） | 精确，直接加入；景点名用用户原话（杭州市 · 西湖） |
| 用户自己在前面加了地名，且该地名出现在记录的地区/地址里 | 杭州西湖 | 匹配 |
| 同一个市里同时有景点和同名区/县/县级市时，区县让位给景点；只有行政名称时不让（朝阳市/朝阳县仍是选择），市本身也不让（黄山市 与 黄山风景区 仍是选择） | 西湖 不再落到 西湖区；泰山、峨眉山、九寨沟、武夷山 不再和 泰山区、峨眉山市、九寨沟县、武夷山市 一起出卡 | 直接加入景点 |
| **兜底**：以上都没匹配上，且原话至少 3 个字，名称以原话结尾（可再带景区后缀），前面是别的字 | 松赞林寺 → 噶丹松赞林寺 | **不算精确，出卡确认**；景点名用高德全名 |
| **最后兜底「是这几个吗」**：仍没有匹配时，取高德归为**景点**的结果（风景名胜 11xxxx，城市广场 110105 除外；博物馆 1401xx），名称里含用户原话，且不是某景点的一部分（名称带 -、·、括号，如 故宫博物院-午门、…(建设中)），最多 3 个 | 故宫 → 故宫博物院；兵马俑 → 秦始皇兵马俑博物馆；洪崖洞 → 洪崖洞民俗风貌区；长城 → 八达岭/居庸关/慕田峪长城 | **出卡确认**，从不直接加入 |

至少 3 个字，是因为两个字的名字会被太多别的名字包含（西湖 是 瘦西湖 的结尾）。兜底只在没有更严格的匹配时才用，所以今天能匹配的地点结果不变。2026-10-04 用 45 个常见景点在真实高德上对比改动前后：9 个变化都是上述预期（西湖、松赞林寺、稻城亚丁、九寨沟、泰山、峨眉山、武夷山 变好；黄山 卡片少了 黄山区；张家界 多一条同为 张家界市 的记录，来自高德返回结果的波动，卡片上合并显示）。1.0031 加了最后兜底：故宫、兵马俑、洪崖洞、长城、东方明珠 从「没找到」变成出卡；其余 45 个地点结果不变。售票处、停车场、公交站、酒店、餐厅按高德的类别排除，不用关键词表（高德类别由 [AmapLocationProvider](../src/platform/location-provider/amap-location-provider.ts) 归一成地点的 `kind: sight | other`，取不到时不算景点）。「潮汕」曾因 潮汕站南广场（城市广场）被当成景点，所以城市广场不算景点。

**出卡和没找到时都提示可以自己搜：**出卡时回复末尾加「都不是的话，可以在「目的地」的「添加」里自己搜索。」；没找到时加「也可以在「目的地」的「添加」里自己搜索。」（[turn-reply.ts](../src/capabilities/conversation/turn-reply.ts)）。右侧的目的地搜索本来就有，不需要新入口。

**行政地名补查：**[LocationService.resolveExpression](../src/capabilities/destination/location-service.ts)先按原词查询。如果返回了 POI，但没有合理匹配，且原词为 2–12 个汉字、不以省/市/区/县/州/镇/乡/村结尾，最多再查询一次“原词＋市”。补查只接受名称精确匹配且 city 或 district 同名的行政地点；酒店、道路等不能替代城市。空结果、已有明确/歧义结果不补查，提供方失败仍报查询故障。例如“香格里拉”的酒店结果可通过“香格里拉市”补查恢复；仍需中国范围检查和显式确认。县级市在当前结构中归到所属地级市/自治州，偏好名称保留提供方行政全名，确认时用全名重新查询，避免再次落到同名酒店。

**结构校验：**解释器拒绝空输出、截断输出、非法 JSON，以及没有可用 reply 的回答。其余部分由 [salvageWorkspaceConversationInterpretation](../src/domain/trip-state/workspace-conversation.ts)逐项检查：字段名、状态和值及交通枚举不合法的 change、重复的字段（保留第一个）、不合法的 presentationIntent（按 none）、不合法的 destinationEdit（按 none，包括模型自造 providerId 的情况）、schema 外的键，都**丢弃这一部分**，其余照常执行，并记录 `workspace.conversation.parts_dropped` 警告。以前任何一部分不合格都会让整轮 502、用户原话丢失；本版本之前已出现过两次（列表多一项、清空交通）。missing 的 value 必须为 null，其他普通状态必须有非空 value。交通可以清空为 missing；有值时必须是 known 且为支持的四个值之一。严格版 validateWorkspaceConversationInterpretation 仍保留，遇到任何丢弃即报错。

**普通字段：**createTripStatePatchFromInterpretation 以当前 TripState 为参照，先丢弃不会改变字段的 change（重复当前值，或对已经 missing 的字段再写 missing），再转成 source=user 的 patch；剩余为空返回 null。模型习惯重复已有字段，若照写会让旧值覆盖新值。destination 不在普通 changes 中。

**地点执行：**[applyDestinationEdit](../src/capabilities/destination/apply-destination-edit.ts)接收用户原话，返回 destination、changed、added（已直接写入的地点）、choices，以及 unresolved、lookupFailed、notInDestination、ambiguousRemovals 等事实，供 route 决定保存和回复。精确判断由 [resolveDestinationPlace](../src/capabilities/destination/resolve-destination-place.ts) 的 `exact` 与 `namesSamePlace` 给出：提供方名称必须以用户表达开头，余下部分只能是行政后缀（省/市/县/区/自治州/自治区/特别行政区/地区/盟，可带民族名）或景区后缀（风景区/景区/风景名胜区/旅游区/国家公园/自然保护区）。

| 操作/查询结果 | 正式目的地行为 | 用户看到什么 |
| --- | --- | --- |
| none | 不变 | 有资格可推荐，否则模型 reply |
| add/set + resolved 精确且是用户原话 | 直接写入（已存在则不变） | “已加入…”，首次可规划时附一次准备度句子，再接模型 reply |
| add/set + resolved 不精确或模型改写 | 不变 | 待选卡（如错别字被提供方纠正） |
| add/set + area | 精确时直接写入为只有省的目的地；否则不变 | 精确：“已加入云南省”，可直接规划；否则省级候选卡 |
| add/set + ambiguous 落在同一偏好 | 同 resolved | 三个梅里雪山记录同属迪庆/梅里雪山，按一个地点判断精确 |
| add/set + ambiguous 跨省市 | 不变 | 按省/市/景点偏好归并；不同省市分别供选择 |
| add/set + unresolved | 不因该表达改变 | 暂未找到可靠地点 |
| add/set + provider_error | 不因该表达改变 | 查询暂不可用，可重试 |
| 多表达部分成功 | 精确项写入，其余仍为候选 | “已加入…”＋候选卡，并说明失败表达 |
| remove 唯一匹配 | 删除对应项 | 无失败时可用模型 reply；级联由领域规则执行 |
| remove 多匹配 | 不删这个表达的项 | 要求说明更具体目标 |
| remove 无匹配 | 不删这个表达的项 | 告知当前旅程没有该地点 |
| 多 remove 部分唯一 | 唯一目标可以删除 | 说明已移除可确认项及未处理项 |

add/set 使用 Promise.all 查询表达。解析层保留不同 provider ID，不把不同 POI 认成同一具体位置；生成旅程选择卡时，按省/市/spot 偏好身份归并。三个梅里雪山记录若归属同一省市且表达同一偏好，就是一个地点：精确时直接写入迪庆藏族自治州并附 spot「梅里雪山」，否则只出一个城市选择。这是目的地偏好的合并，不是具体 POI 消歧成功。不同省市、同市不同 spot 仍分别保留。候选数受消息模型上限约束。set 和 add 均生成 mode=add，提交时合并最新状态。旧版本保存的 mode=replace 卡仍按原基底、过期与幂等规则处理；本版本聊天不再生成整体替换卡。

聊天 remove 先匹配当前 areas 的精确名称，无精确匹配才允许唯一前缀；多匹配不能取第一个。UI 删除提交完整省/市/spot 元组，不用模糊前缀。

**实际分支顺序：**[messages route](../src/app/api/trip-workspace/messages/route.ts)先保存普通字段，再运行地点 edit；精确地点带 expectedDestination 写入。地点 edit 出了卡或有找不到/查询失败的表达时，本轮不推荐；否则由 [recommendationScopeForTurn](../src/capabilities/recommendation/destination-recommendation-use-case.ts)按写入后的状态判断推荐范围，因此“我想去云南，想爬山”可以在同一轮写入云南省并推荐省内城市。正文由 [destinationEditReply](../src/capabilities/conversation/turn-reply.ts)组装：已加入 → 候选 → 删除歧义/无匹配 → 查询失败 → 无结果，旅程首次变为可规划时附一次准备度句子；有卡或失败时省略模型 reply，否则接在后面。推荐回合只在助手消息上挂 `destination_recommendations_pending`，卡片由第二个请求生成（见 4.1）。

[workspace-turn-branch](../src/capabilities/conversation/workspace-turn-branch.ts)存在且有单测，但当前 route 没有调用它。这里以实际 route 条件为准，不能把该 helper 描述为正在运行的中央决策器。

**失败边界：**普通字段、目的地删除、推荐查询、消息保存不是同一笔跨步骤事务。后一步失败时前面状态可能已变。客户端因此提示发送结果未确认，需刷新核对。

| 聊天错误 | HTTP | 定位含义 |
| --- | --- | --- |
| 请求/状态无效 | 400 | 未通过输入规则 |
| Journey/状态不存在 | 404 | owner 或持久化读取失败边界 |
| 状态并发冲突 | 409 | 重读后不能安全提交 |
| 模型配置缺失 | 503 | 未配置服务 |
| 模型超时 | 504 | 超过请求时间 |
| 模型请求或输出失败 | 502 | 外部调用失败、非 JSON、截断或没有可用 reply；单个字段不合格不会到这里 |
| 其他错误 | 500 | 未分类失败 |

响应带 requestId，可与结构化日志关联。[Transport](../src/components/trip-workspace/workspace-chat-transport.ts)处理完整响应与客户端状态同步。

### 3.3 输入示例与实际路径

下面是按代码推导的示例；实际提案取决于模型输出，应用不会只靠自然语言关键词绕过解释器。

| 输入及状态 | 预期结构与路径 | 结果 |
| --- | --- | --- |
| 缺目的地：“人少安静，彻底放空” | none + 推荐信号 | 先显示模型的简短引导，卡片随后作为下一条消息出现，目的地不变 |
| 缺目的地：“你推荐一下呗” | none + 推荐信号；明确要求即可 | 同上，不先追问日期 |
| 缺目的地：“想出去玩” | none，无推荐信号 | Kimi 追问，无状态变化 |
| “我想去云南” | add/set，查询省级 area，精确 | 直接写入云南省（全省），首次可规划 |
| “云南，想爬山” | set 云南 + 推荐信号 | 同一轮写入云南省，再挂 pending，卡片限云南省内 |
| “我还想去大莲”（错字） | add，places 保留“大莲” | 不直接写入；提供方给出的地点作为卡片供确认，或说明没找到 |
| 已有城市：“推荐下别的省份” | none + destination_recommendations_elsewhere | 卡片只来自尚未保存的省份，已保存的全部保留 |
| 已有浙江福建：“还想去潮汕” | add，broadRegion=潮汕，核验相关市 | 广东城市可多选追加，旧目的地保留 |
| 已有云南后说“我想去青岛” | add；模型误用 set 也只追加 | 精确时直接追加山东/青岛，保留云南 |
| “想去梅里雪山” | 保留表达并查真实行政归属 | 直接写入迪庆藏族自治州，spots=[梅里雪山]，名称不被自治州吞掉 |
| “朝阳”返回多个地点 | ambiguous，保留不同 provider 身份 | 用户区分候选，不自动取第一项 |
| “不去潮州了” | remove 当前保存名 | 唯一目标删除，最后一个城市删除后省仍在 |
| “不去梅里雪山了” | remove 当前 spot | 删除 spot，保留城市和省 |
| “时间改到十一月底左右” | startDate approximate | 普通字段变化，Kimi reply |
| “梅里雪山现在开放吗” | 应识别为问题 | 地点核验不能当成开放证据 |
| “可以生成计划了吗” | 普通 reply | 聊天无计划执行分支，按钮只检查准备度 |

## 4. 推荐卡、候选卡和点击后的动作

### 4.1 推荐如何触发

**中国目的地范围：**Meri 的用户可以来自任何国家，目的地限定在中国境内（含港澳台，仍需提供方核验）。草稿、开场、聊天和推荐提示词明确该范围；聊天只在用户提到中国以外的目的地时简短说明“目前只规划中国境内的旅行”，其余回复不提范围，不使用“国内/国外”的说法，也不询问去中国还是境外。纯境外请求不提出目的地增改或推荐卡。范围在提示词里是有条件的规则而不是固定话术：1.0021 曾让模型照念一句固定话术，结果无关回复（如“我想安静一点的地方”）也以它开头。提示词约束不等于普通正文经过地理核验。[china-destination-scope](../src/domain/location/china-destination-scope.ts)维护 34 个省级行政区的完整名称和常用简称；这是服务范围校验，不是地点归属映射，也不承诺提供方能核验每一个城市/景点。模型推荐 schema 的 province 使用完整名称枚举，运行时校验再次检查名单；含范围外省份的整批输出作为无效模型输出处理，不创建卡片，沿用推荐失败路径。城市名称仍在用户确认时核验，不能仅凭模型写了一个中国省名就保存。

**聊天自动触发：**presentationIntent 只是模型信号。[recommendationScopeForTurn](../src/capabilities/recommendation/destination-recommendation-use-case.ts)按本轮写入后的状态和 [isDestinationOpenToRecommendations](../src/domain/trip-state/trip-state.ts)决定范围：

- `destination_recommendations` → within：目的地 missing 或只有没选城市的省，卡片限已保存省份内。
- `destination_recommendations_elsewhere` → elsewhere：已有至少一个省份时扩大范围，卡片只来自尚未保存的省份，已保存的全部保留；什么都没保存时按 within 处理。
- 已定城市时的普通偏好（“想找个人少的地方”）仍是 none，不提供替代地点；legacyText 不作为已验证省范围。
- 本轮地点 edit 出了卡或有找不到的表达时不推荐。模型要推荐但被拒绝时记录 `recommendation.intent.declined`。

**没有推荐按钮：**推荐只从聊天触发。缺目的地时，聊天下方的 Generate plan 不可用，悬停或聚焦时提示用户：在对话里说出想去的地方、对 Meri 说“帮我推荐几个地方”，或点击提示里的链接打开右侧目的地搜索（见 5.4）。旧版“帮我推荐 / 我自己选”引导消息及其 API 已删除；旧旅程历史里保存的那条引导消息仍按普通助手消息显示，不再带按钮，[其稳定 ID](../src/capabilities/conversation/destination-missing-guidance.ts) 只用于开场判断时跳过它。

**先回复，后出卡：**推荐需要一次 Bocha 搜索和第二次 Kimi 调用。为了不让用户等待两次模型调用才看到任何字，聊天请求只保存模型的简短引导，并在助手消息上挂 `{type:"destination_recommendations_pending", scope}`。[ConversationPanel](../src/components/trip-workspace/conversation-panel.tsx)发现最后一条消息是 pending 时显示“正在挑选推荐的地方…”、小熊进入思考状态、输入框暂停，并调用 `POST /api/trips/[id]/destination-recommendations`（body 只有 `{messageId}`）。重新打开 Journey 时如果最后一条仍是 pending，会自动再请求一次。

推荐回合的引导语由 [recommendationLeadIn](../src/capabilities/conversation/turn-reply.ts)去掉问句：卡片本身就是这一轮的问题，提示词虽然禁止，模型仍会追问日期；全是问句时换成“好，我挑几个地方给你看看。”。

[该 route](../src/app/api/trips/%5Bid%5D/destination-recommendations/route.ts)从保存的对话中读出 pending 消息之前的那条用户原话和更早历史（[pendingRecommendationRequest](../src/capabilities/recommendation/destination-recommendation-use-case.ts)），浏览器不提供推荐内容。卡片消息 ID 由 pending 消息派生（[destinationRecommendationCardsMessageId](../src/capabilities/conversation/destination-selection-message-id.ts)），通过 createAssistantIfAbsent 保存，重复请求返回同一条。

| 情况 | HTTP | 结果 |
| --- | --- | --- |
| 卡片已存在 | 200 | 返回已保存的卡片消息，不再运行工作流 |
| pending 仍是最新消息且状态仍允许该范围 | 200 | 运行工作流，保存卡片或“没有筛出”说明 |
| 用户之后又发了消息 | 409 recommendations_stale | 不出卡，界面不再等待 |
| 期间目的地已定城市等 | 409 recommendations_stale | 同上 |
| 不是 pending 消息 / 请求体错误 / 无 owner | 404 / 400 / 404 | 不写入 |
| 工作流失败 | 502 | 不写入；界面显示“推荐暂时没有生成出来”和重试按钮 |

**实际推荐流水线：**

1. [构造上下文](../src/capabilities/recommendation/destination-recommendation-context.ts)：TripState、scope、最多 10 条/6000 字符对话；追加触发推荐的真实原话并使用 source=conversation（唯一入口），来源标记只存在于本次调用上下文。
2. [Discovery Search](../src/platform/search/discovery-search.ts)：Bocha 取最多 8 条启发信息，失败退化为空搜索上下文。
3. [推荐生成器](../src/capabilities/recommendation/destination-recommendation-generator.ts)：Kimi 输出省、市/州和理由。
4. [领域校验](../src/domain/location/destination-recommendations.ts)：形状校验、去重、最多 12 个地点。
5. 生成器每个地点还给出一个代表地标（`landmark`，如丽江市→玉龙雪山），只用来配图，不当作计划或已核验事实。工作流**不再查图**：地标随卡片存进消息，卡片先到，照片随后由浏览器单独请求（见 5.6）。
6. [workflow](../src/capabilities/recommendation/destination-recommendation-workflow.ts)：within 用 withinSettledProvinces 按规范化省名限制已定省，并采用用户保存的省名拼写；elsewhere 用 outsideSavedProvinces 丢弃所有已保存省份，即使模型换了写法。给卡项赋 ID。
7. 卡片作为 pending 之后的下一条助手消息保存 destination_recommendations presentation（每张卡带 landmark、还没有 image），正文是工作流的固定句子，UI 适配为统一多选卡。卡项仍是建议，提交时才高德复核。地点名称只出现在这条卡片消息里，因此不会再出现正文列举的地点和卡片不一致。

该执行链没有访问检查或风险排序；照片只是装饰（见 5.6）。搜索上下文不能证明开放、安全或可达。搜索失败可降级，模型失败仍可能令请求失败。

### 4.2 用户点击卡片

[DestinationChoicesCard](../src/components/trip-workspace/destination-choices-card.tsx)按省分组，每个省一行、用 Embla 左右滑（拖动不会误勾选，行宽放不下时出现左右箭头）。每张卡上方是照片（4:3，底部写照片内容，见 5.6）；照片还在查、或图片文件还在下载时，照片位置显示呼吸闪烁的骨架块（[Skeleton](../src/components/ui/skeleton.tsx)），照片到了淡入，确实没有照片时显示定位图标。复选框和“已在行程”叠在照片上，下方是地名、想去的景点和推荐理由（最多三行）。逐项勾选后统一提交“添加所选”；历史 replace 卡提交“替换为所选目的地”，新聊天的 set/add 均生成追加卡。没有逐行添加按钮。勾选只改变本地 picked，不写服务器。

| 动作/状态 | UI 判定 | 结果 |
| --- | --- | --- |
| 多选 | 记录暂选 ID 并显示数量 | 一次提交整组 |
| 第二轮新城市 | 按候选身份判断，不按整个 destination.state 禁用 | 可以继续追加广东等地点 |
| 已有市的新 spot | 检查 province/city/spot 元组 | 市存在仍可加新景点 |
| 已经添加 | 以当前 TripState 判断：add 模式勾选并锁定，名称后显示“已在行程”；只读卡同样勾选当前仍在行程中的地点 | 不重复；replace 可选已有城市 |
| 同省市、同景点偏好的多个 POI | 按目标省/市/spot 分组 | 显示一个城市主项，附景点偏好，具体位置在规划阶段再确认 |
| 同名但不同省市 | 目标行政归属不同 | 保留独立选择，不仅按名称合并 |
| 旧卡无可靠身份 | legacyUnverified | 禁用，提示重新搜索 |
| 任一选择正在保存 | selectionInFlight + pending | 暂停全部聊天选择卡，避免重入 |
| 保存失败，且状态未确认写入 | 最新有效卡显示可重试错误 | 不伪称已添加 |
| 已确认/继续聊天/后续新卡 | 原卡变成只读 | 禁用复选框和提交，显示“历史选项，仅供查看” |
| 点击 Generate plan，或在其提示里打开目的地搜索 | 立即关闭当前卡的本地操作资格 | 新返回的候选卡按新消息判断资格 |
| replace 的目的地基底已变化 | 比较 baseDestination 和当前 destination | 原卡只读，不能覆盖新的决定 |

[UI adapter](../src/components/trip-workspace/trip-message-ui-adapter.ts)兼容新 destination_choices、旧 destination_recommendations 和旧 location_candidates。旧独立 location-candidate-selection API 已移除。

[destination-choice-identity](../src/domain/trip-message/destination-choice-identity.ts)定义偏好身份和历史卡分组。新卡的城市偏好 ID 由省/市/spot 构造，不依赖某条 POI。旧卡显示归并时保留组内全部原 ID，提交仍从保存的 offer 验证，不能伪造新 ID。暂选数量按显示行计数。

旧卡一组多个 ID 提交时，服务端先确认它们都属于原 offer，再把同一省/市/spot 合成一次偏好核验，避免对相同表达重复查询高德。不会合并不同省市或不同景点意图。

卡片资格由 [ConversationPanel](../src/components/trip-workspace/conversation-panel.tsx) 的 offerIsActive 判断：必须是消息列表最后一条，未在本地关闭，且 replace 基底未变化。正在聊天、推荐或保存时暂停选择；保存期间暂停发送聊天，避免本窗口同时提交两种决定。确认成功立即关闭原卡；follow_up_unavailable 也关闭，因为状态已经保存，并显示刷新核对提示。刷新后按持久化消息顺序恢复资格，后面已有确认或新对话的卡保持只读。本地按钮关闭记录只在当前页面有效，不将只读准备度查询当作新的持久化对话。

#### 请求与服务器验证

统一 [POST /api/trips/{id}/destination-recommendation-selection](../src/app/api/trips/[id]/destination-recommendation-selection/route.ts)只接受精确两键 body：

```json
{"messageId":"已保存助手消息 ID","destinationIds":["候选 ID 1","候选 ID 2"]}
```

服务端不信任客户端传入地名、行政区、spot 或 verified 标记。实际顺序：

1. 校验访客与 Journey 所有权，messageId 非空，destinationIds 非空且无重复。
2. 从本 Journey 保存的助手消息取 offer，每个 ID 必须属于它。
3. 检查消息顺序：非最后一条 offer 且没有同组合确认记录，返回 409、code=offer_expired。replace 首次检查 baseDestination；已变化则 409。
4. [verifyDestinationChoice](../src/capabilities/destination/verified-destination-choice.ts)重新高德查询所选项。新偏好 ID 校验查询结果中是否存在相同省/市/spot 的合理匹配，不能跨行政区保存，也不能把机场等相关 POI 当景点。旧 provider ID 仍核对身份；旧随机推荐 ID 需精确规范名匹配，多个记录若都代表同一个省市且不是景点，可确认该城市。已验证省级合成项有专门分支。
5. 任一选中项核验失败则整批 409，不部分保存。

   中国范围也在 verifyDestinationChoice 中检查，包括历史卡及省级合成 ID 的快捷分支；不支持省份返回 unresolved，再由接口按核验失败返回 409。新省/市/spot 必须通过范围与现有身份核验，不能借旧卡写入境外地点。
6. 查询结束重读最新 TripState；同组合已有确认且当前结果仍匹配时返回原确认、不写状态。否则再次读取消息，若有后续消息或该组合已消费，返回 offer_expired，防止查询期间继续聊天后旧卡落库。未过期时：add 合并最新 areas；replace 再检查基底，从空 areas 构造整体替换。
7. 按 offer 顺序处理，使请求 ID 顺序变化仍一致；省市合并、spot 同名去重。
8. 带 expectedDestination 保存，避免覆盖查询期间的目的地修改。
9. [destinationSelectionReply](../src/capabilities/destination/destination-selection-reply.ts)按保存前后状态生成固定确认，只说这次新增的部分（[destinationAdditions](../src/domain/trip-state/destination-areas.ts)）：“好，已加入浙江省 杭州市、舟山市。”；全部已在旅程里则说“这些地点已经在旅程里了。”。这次选择使旅程首次可规划时，再附准备度句子和可补充的信息。以前每次都念整个目的地，四个省时很长。保存助手消息。
10. 返回 `{tripState,assistantMessage}`，客户端同步聊天与右侧。

#### 重试、过期与保存一半

- [确认 ID](../src/capabilities/conversation/destination-selection-message-id.ts)由 Journey、原消息及所选组合确定，ID 顺序变化不会产生新确认身份。
- 已有确认且所选仍存在时 add 可返回原回复；replace 还要求当前整个目的地与这次替换结果一致。
- 确认存在不表示可以忽略后来删除/替换；旧 add 不能恢复后来删除的地点，旧 replace 不能覆盖新的决定。已消费卡不能换一组选项再次提交。客户端收到 offer_expired 后锁定卡片，提示刷新或重新搜索。
- 状态已保存但确认失败返回 500、code=follow_up_unavailable 和已保存 tripState。[客户端异常](../src/components/trip-workspace/workspace-conversation-model.ts)先同步真实状态，关闭卡片，再显示“目的地已保存，但确认回复未完成”的刷新提示。
- 非法 body 为 400；无权限/消息/选项不存在 404；核验、基底或并发冲突 409；其他保存失败 500。

## 5. 右侧 Journey overview 的直接操作

| 操作 | 实际行为 | LLM/聊天副作用 |
| --- | --- | --- |
| 修改名称 | 文本编辑后 [state PATCH](../src/app/api/trips/[id]/state/route.ts)，校验普通字段 | 无 LLM，无聊天正文 |
| 选择交通偏好 | 一次点选四个选项之一，再点已选项清除；state PATCH | 无 LLM，无聊天正文 |
| 选择“何时” | [TripDatesField](../src/components/trip-workspace/trip-dates-editor.tsx)范围日历 + 天数步进器；state PATCH 只发送用户选的值，服务器补算第三个 | 无 LLM，无聊天正文 |
| 修改出发地 | [LocationEditor](../src/components/trip-workspace/location-editor.tsx)、[suggestions API](../src/app/api/locations/suggestions/route.ts)、选中后 state PATCH | 仍是 origin 身份结构，不走 destinationEdit |
| 展开目的地搜索 | 目的地行右侧“＋ 添加”（展开后变“收起”） | 本地展开，无状态写入 |
| 搜索城市/景点 | GET /api/trips/{id}/destinations?q=… | 高德，无 LLM，无消息 |
| 添加搜索结果 | POST 同路径 `{query,id}` | 重查身份后保存，无助手消息 |
| 删除省、市、spot | DELETE 同路径 `{province,place,spot}` | 确定性级联，同步状态 |
| 清除旧文本 | DELETE `{legacy:true}` | 删除 legacyText，保留已添加 areas |
| Generate plan（唯一，位于聊天下方） | [GeneratePlanAction](../src/components/trip-workspace/generate-plan-action.tsx) 调用 [planning-readiness API](../src/app/api/trips/[id]/planning-readiness/route.ts) | 只检查，不执行规划；右侧面板不再有 Generate plan |
| 返回、重开、刷新 | 读持久化状态与消息 | 不调用模型 |
| 删除 Journey | [DELETE /api/trips/{id}](../src/app/api/trips/[id]/route.ts)，校验 owner | 列表反馈，不调用模型 |

### 5.1 普通字段编辑体验

[ExpeditionBriefPanel](../src/components/trip-workspace/expedition-brief-panel.tsx)按“从哪出发 → 去哪 → 何时 → 怎么去”排列：出发地、目的地、何时、交通偏好，旅程名称放最后。不再显示“N / 7 已理解”计数、示意封面、重复的目的地/日期/交通摘要和“即将开放”快捷按钮。

每行状态由 [field-certainty](../src/components/trip-workspace/field-certainty.tsx)统一为 18px 圆形：known 实心绿圆带勾；missing 空心灰圈；approximate 琥珀色圈内一点，并在值后显示“大致”；ambiguous 红褐色圈内“!”，并显示“待确认”。完整状态文字仍以屏幕阅读器可读的隐藏文本提供。聊天选择卡的复选框保持圆角方形，表示“可勾选”，与状态圆区分。

- 旅程名称：文本编辑，Enter/失焦提交，Escape 取消。用户没改过名称时，名称随目的地派生为“…之旅”：只有一个城市用城市名，否则用省名；超过两个省时只列前两个并写总数，如“云南省、四川省等4省之旅”（[destinationAreasTitle](../src/domain/trip-state/destination-areas.ts)）。
- 出发地、何时和旅程名称共用浅绿圆角铅笔编辑入口：浅绿图形区域 30px、图标 15px；字段值与图标仍是同一个至少 44px 高的按钮，触屏可点整行。悬停显示具体编辑提示并轻微划动一次，按下轻微缩小，键盘聚焦及浮层打开时加深底色；减少动态效果偏好下关闭动画。保留各字段原有编辑与保存方式。
- 交通偏好：四个选项（自驾、不自驾、公共交通、灵活）一次点选，再点已选项清除为 missing；Meri 从对话记下的近似原话（如“可能自驾吧”）显示在选项下方，直到用户点选。
- 何时：一行概括开始、结束和时长，例如“10月1日 → 10月7日 · 7天”；近似原话原样显示并标“大致”。点开为范围日历（宽屏两个月、窄屏一个月，今天之前不可选）：第一次点为开始、第二次点为结束，结束早于开始时改为新的开始；选完两端才保存。只选了开始就填天数或关闭浮层，会连同开始一起保存。天数可用 −/+ 或直接输入（1–366）。“清除日期”把三项都设为 missing。
- 成功采用服务器状态，失败显示错误。[createDirectTripStatePatch](../src/components/trip-workspace/trip-state-persistence-model.ts)与 [createTripDatesPatch](../src/components/trip-workspace/trip-dates-model.ts)构造 source=user 修改；客户端及服务端均禁止通过通用 PATCH 改 destination。

收起详细字段时保留目的地和何时。页头日期行与“何时”使用同一 [tripDatesSummary](../src/components/trip-workspace/trip-dates-model.ts)；旅程标题等由 [workspace-presentation](../src/components/trip-workspace/workspace-presentation.ts)派生，不是另一份事实。

**日期补算规则：**开始、结束、时长描述同一段时间，任意两项确定第三项，天数按含首尾计算（1号到7号为 7天，即 7天6晚）。[deriveTripDates](../src/domain/trip-state/trip-dates.ts)在 [applyTripStatePatch](../src/domain/trip-state/trip-state.ts)中执行，因此右侧编辑和聊天修改都遵守同一规则：

| 本次修改 | 已有 | 补算 |
| --- | --- | --- |
| 开始 + 结束 | — | 时长 |
| 开始 + 时长 | — | 结束 |
| 结束 + 时长 | — | 开始 |
| 只改开始 | 时长 | 保持时长，移动结束 |
| 只改开始 | 结束（无时长） | 时长 |
| 只改结束 | 开始 | 时长 |
| 只改结束 | 时长（无开始） | 开始 |
| 只改时长 | 开始 | 保持开始，移动结束 |
| 只改时长 | 结束（无开始） | 开始 |

只有 state=known 且格式精确的值参与：日期为真实日历日 `YYYY-MM-DD`，时长为 `N天`（可带“M晚”）。“周末”“十月底”“大概一周”等近似或非精确写法不参与，也不会被改写；结束早于开始时不补算。补算出的值 source=system。已保存的旧旅程不回填，下次修改日期时才补算。对话模型的字段说明要求精确天数写成 `N天`（“玩七天”→“7天”）。

### 5.2 目的地搜索、核验、保存

目的地标题行右侧是“＋ 添加”按钮，采用与铅笔入口同色的浅绿圆角矩形（高 30px、宽 66px、圆角 8px）。展开后显示“− 收起”，宽度不变；悬停、键盘聚焦和展开时底色加深，按下轻缩至 0.97；减少动态效果偏好下关闭动画。其下横跨整行，每个省一块浅底区域：省名在左、删除省的 ✕ 统一在右；每个城市占一行：城市是带 ✕ 的标签，想去的景点以带定位图标的浅色标签排在同一行城市右侧，景点多时只在右侧区域内换行（例如“丽江市 · 玉龙雪山”一行、“迪庆藏族自治州 · 香格里拉市 · 梅里雪山”一行）。以前所有标签挤在一行里换行，第二行的景点看起来像属于上一行的城市。没有城市的省显示“全省”标签和“规划时按整省考虑”，表示整省范围的目的地，而不是未完成项。展开后搜索横跨字段行。手动搜索仍用单个结果添加，聊天则多选统一提交。

- 至少 2 字开始查询，250ms 防抖，新输入/收起取消旧请求；已取消响应不得覆盖新列表。
- [picksFromSearch](../src/capabilities/destination/resolve-destination-place.ts)过滤省份缺失或不在中国省级名单内的结果；POST 重查后使用同一过滤，无法核验则返回 409，不写入目的地。聊天地点解析也执行相同范围检查。已有历史记录保持可读、可删除，不自动清理或搬到其他省份。
- [destinations API](../src/app/api/trips/[id]/destinations/route.ts)限制表达 2–80 字符，最多返回 12 项，GET 响应 no-store。
- 候选提供 id、name、province、city、spot、detail，前端 Zod 校验，spot 必须有 city。
- 详情可显示规范名称差异、区县及地址；无法区分的同名结果要求细化搜索。
- POST 用 query 和 id 重新查高德，身份消失返回 409，不信任缓存候选。
- 核验后重读最新状态再合并；busy/inFlight 防重入，成功使用返回 TripState，没有乐观假保存。
- 已有城市但新 spot 未添加仍可保存；追加时保留待确认旧文本。

### 5.3 层级、级联与具体景点偏好

正式 destination 示例：

```json
{
  "state": "known",
  "source": "user",
  "areas": [
    {"province":"云南省","places":[{"name":"迪庆藏族自治州","spots":["梅里雪山"]}]},
    {"province":"广东省","places":[{"name":"潮州市","spots":[]}]},
    {"province":"福建省","places":[]}
  ]
}
```

[resolveDestinationPlace / picksFromSearch](../src/capabilities/destination/resolve-destination-place.ts)取得高德省市父级。匹配城市本身时不建 spot；具体 POI 进入所属市的 spots，适当保留用户表达，否则采用规范名。直辖市以省名作市级父项，UI 显示“市内”标签避免重复。

[destination-areas](../src/domain/trip-state/destination-areas.ts)纯函数负责：

| 删除元组 | 影响 |
| --- | --- |
| province + place=null + spot=null | 删除省及所有城市/景点 |
| province + place + spot=null | 删除市及其 spots，保留省 |
| province + place + spot | 只删景点，市与省保留 |
| 最后一个城市删除 | 保留省，表示整省范围的目的地，仍可规划 |
| 所有省删除且无 legacyText | destination 回到 missing |

最终 spots 是名称字符串，不含 provider ID/坐标。聊天卡选择城市及景点偏好，使用偏好身份，不展示某条 POI 地址来暗示已选精确位置；手动搜索和历史原始候选可保留 provider 身份与地址，确认后也不复制进 spots。未来规划须重新查询具体地点。spots 表示用户想去，不表示强制行程或已经验证开放/安全/可达。

城市删除连带删 spots；未来规划读取当前 TripState，不能从历史聊天恢复这些偏好。历史消息保留是对话记录，不是当前意图清单。

### 5.4 Generate plan 当前只检查准备度

[evaluateGeneratePlanReadiness](../src/domain/trip-state/planning-readiness.ts)是纯状态判断，没有高德调用：

| 当前目的地 | 返回 | 下一步 |
| --- | --- | --- |
| missing | destination_missing | 按钮不可用；悬停/聚焦提示三种添加途径 |
| 存在 legacyText | destination_unverified | 按钮不可用；提示重新搜索添加或清除旧记录 |
| 已有省（无论是否选了市）且无旧文本 | canProceed=true，destination=selected | 可点击，提示规划功能尚未开放 |

出发地、日期、时长、交通不是当前硬门槛。只有省、没有市也算已有目的地，规划会以整省为范围；只有旧文本未确认时不能规划。

按钮始终显示。不可用时使用 `aria-disabled` 而非 `disabled`，保持可聚焦，使键盘用户也能读到提示；提示卡位于按钮所在容器内，指针从按钮移到提示上不会关闭，可点击其中的“在旅程信息里搜索并添加目的地”。该链接通过 [TripWorkspace](../src/components/trip-workspace/trip-workspace.tsx) 递增编辑器打开请求，右侧 [DestinationEditor](../src/components/trip-workspace/destination-editor.tsx) 重新挂载为展开状态并自动聚焦搜索框。点击可用按钮时的检查结果仍只在按钮下方显示，并随目的地变化失效。

[准备度 UI 模型](../src/components/trip-workspace/planning-readiness-model.ts)将结果关联 destination 快照。目的地改变后旧准备度不再展示，避免新决定沿用旧检查结果。

### 5.5 旅程列底部：地球装饰、照片环与小熊

右侧列在 Journey overview 下方依次是装饰地球（外加照片环）和小熊：

- [JourneyOrbit](../src/components/trip-workspace/journey-orbit.tsx)把已选地点的照片排成绕地球旋转的椭圆环（土星环）：每个地点一张，最多 8 张；转到后方的照片变小、变淡，压在地球线框下面，转到前方的变大、变清晰，盖在地球上面；约 48 秒转一圈，鼠标悬停时暂停，点击某张会沿最短方向转到正前方；系统要求减少动态效果时静止不转；图片加载失败的那张不显示。没有已选地点时只有地球。动画只用免费的 `motion` 包（useAnimationFrame / useTransform），没有使用付费的 Motion+ 组件。

- [JourneyGlobe](../src/components/trip-workspace/journey-globe.tsx)改写自 cult-ui 的 Illustration Globe（MIT），纯 SVG 线框半球，光点沿经线流向节点。节点数等于已选地点数（有市的按市计，只有省的按 1 计，最多 6 个），只为“看着好看”，不表示真实地理位置，没有坐标、没有地图功能。系统要求减少动态效果时只显示静止节点。
- [MeriWorld](../src/components/companion/meri-world.tsx)的小熊在桌面端固定在列底部（滚动时保持可见），旁边气泡显示一句话（见第 6 节速查表），`aria-live=polite` 让读屏软件播报变化。聊天面板把当前活动（idle / thinking / error：发送中、选卡保存中或推荐卡片生成中为 thinking，发送结果未确认或选卡保存失败为 error）上报给 [TripWorkspace](../src/components/trip-workspace/trip-workspace.tsx)，再传给小熊。
- 小熊是坐在营地小桌（格子桌布）后的像素精灵图：[bear-sprites.png](../public/companion/bear/bear-sprites.png) 含站着、坐下、看地图、放下/拿起地图、吃饭团、站起来、欢呼、担心 9 个动画共 42 帧，由 [生成脚本](../assets/companion/bear/generate_bear_sprites.py)从同一张插画合成，以 2 倍整数缩放显示。
- 做什么由 [bear-behavior](../src/components/companion/bear-behavior.ts)决定：气泡的状态同时作为“反应”——出错时站起来担心，Meri 回复时坐着认真看地图（站着则原地等），可以生成计划时站起来欢呼一次（旅程内容再变化才会再欢呼）。其余时间按权重随机：看地图 45、站着 25、吃饭团 20、放空 10，同一活动最多连续两次，吃完 60 秒内不再吃，坐着时更愿意继续坐着。姿势变化总是播放过渡（坐下、放下地图等），不瞬移；新反应在下一帧接管，但不打断正在进行的过渡。
- [CompanionBear](../src/components/companion/companion-bear.tsx)负责计时播放；标签页隐藏时暂停、回来接着播；系统要求减少动态效果时只显示坐着看地图的一帧。
- 宽度 ≤800px 时小熊不固定，随内容排在列尾。

### 5.6 地点照片：从哪来、存在哪、怎么缓存

照片只用于装饰卡片、照片环和标题左侧缩略图，不代表地点现状，没有照片是正常情况而不是错误。

**来源：**[AmapPlacePhotoProvider](../src/platform/place-photos/amap-place-photo-provider.ts)调用高德 v5 地点搜索并加 `show_fields=photos`。高德返回的图片地址多为 http，页面是 https 会被浏览器拦截；同一主机支持 https（2026-10-03 实测），所以直接把协议换成 https，不做代理。只接受 [placePhotoHosts](../src/platform/place-photos/place-photo-provider.ts) 列出的两个主机（`store.is.autonavi.com`、`aos-comment.amap.com`），[next.config.ts](../next.config.ts) 也只允许 next/image 从这两个主机取图。图片最宽约 500px，部分来自用户评论。

**查什么：**[photoQueriesFor](../src/capabilities/destination/place-images.ts)按从具体到宽泛的顺序尝试，第一张找到就停：

1. 用户说过的景点（梅里雪山）→ 在所属市内按名称查；景点本身是县级市/县/区名（香格里拉市、大理市）→ 在它境内找国家级景点（普达措、大理古城），因为城镇本身的图最没代表性；
2. 推荐生成器给出的代表地标（丽江市 → 玉龙雪山）→ 在该市内按名称查；
3. 该市的国家级景点（高德类别 110202；普通“风景名胜”类别实测会给购物中心、纪念馆）；
4. 只有省、没有市的目的地才查该省的国家级景点。市的卡片查到第 3 步为止，查不到就不配图：退到省级会给出别处的照片（柳州市配上桂林的芦笛岩），比没有图更糟。

同一批卡片、以及照片环里，同一张照片只出现一次（[withoutRepeatedImages](../src/capabilities/destination/place-images.ts)）：第一个地点保留，后面重复的不配图，避免两个城市看起来是同一个地方。

**推荐卡：先出卡，照片随后流式补上。**以前推荐接口要等 12 张卡的照片都查完（约 4 秒）才返回卡片；现在：

1. `POST /api/trips/[id]/destination-recommendations` 拿到模型结果就保存并返回卡片，每张卡带 `landmark`，`image` 未设置。
2. 卡片一出现，[ConversationPanel](../src/components/trip-workspace/conversation-panel.tsx)对这条卡片消息调用 `POST /api/trips/[id]/destination-recommendation-photos`（[streamRecommendationPhotos](../src/components/trip-workspace/destination-recommendation-model.ts)）。还没有答案的卡显示骨架块。
3. 服务器（[findRecommendationPhotos](../src/capabilities/recommendation/recommendation-photos.ts)）同时开始每张卡的查图，由高德共用队列排开；**每查到一张就推一行 JSON**（`{"id":…,"image":{url,caption}|null}`，NDJSON），浏览器收到就把照片放到对应卡片上淡入。同一批里已经出现过的照片，后到的卡不再用（先到先得）。
4. 全部查完后，把结果一次写回这条卡片消息的 presentation（[saveRecommendationPhotos](../src/capabilities/conversation/trip-message-service.ts)，只改 presentation），然后结束响应。刷新后直接读出，不再查询。

卡片的 `image` 有三种状态：**未设置**＝还没人查过（显示骨架并会去查）；**照片**；**null**＝查过、没有可用照片（显示定位图标，不再查）。存储的 image 不合法时按 null 处理，不让整张卡失效，也不会每次加载都重查。一次只为一条卡片消息请求照片；打开旅程时，旧的、还没查过照片的推荐卡（包括 1.0025 之前的卡）也会这样补上照片。

浏览器中途离开（刷新、关页）时，服务器照样查完并保存；保存失败只记 `recommendation.photos.failed`，下次打开再查一次。请求失败时卡片保持原样（定位图标），下次加载再试。高德被限流时整个队列暂停，表现为骨架多闪一会儿，不单独提示。

**存在哪：**
- 推荐卡：见上，`image: {url, caption}` 或 null 存进那条卡片消息的 presentation，只存链接和说明文字，不存图片本身。
- 地点候选卡（聊天里“潮汕”这类的待选卡，通常 1–3 张）仍在出卡时一并查好，没有 null 状态：没有 image 就显示定位图标。图片链接失效时卡片显示兜底样式。
- 已选地点的照片不进 TripState：[selectedPlaceImages](../src/capabilities/destination/place-images.ts)按当前目的地现查，删掉地点照片也随之消失。某地点若在对话的卡片上展示过照片（[imagesShownInConversation](../src/capabilities/destination/place-images.ts)），沿用那张，保证从卡片选进来的丽江仍显示卡片上的玉龙雪山，而不是重新查到的玉水寨。
- 页面服务端渲染时带上照片（最多等 1.5 秒，超时则不带，浏览器打开后再请求），刷新时不闪烁。目的地变化后，[TripWorkspace](../src/components/trip-workspace/trip-workspace.tsx)调用 `GET /api/trips/[id]/destination-photos` 重新取。
- 标题左侧缩略图是第一个已选地点的照片（[coverPhoto](../src/components/trip-workspace/destination-photos-model.ts)），只在第一个地点变化时才换；没有地点时仍是默认风景图。

**缓存：**[PlacePhotoMemory](../src/platform/place-photos/amap-place-photo-provider.ts)在服务器进程内存里保存查询结果 7 天（最多 500 条），**只保存真实答案**（找到照片，或高德确认这里没有照片），被限流、超时、接口错误都不保存。不用 Next 的 `fetch` 缓存（`next.revalidate`），因为高德被限流时仍返回 HTTP 200，fetch 缓存会把“被限流”当成答案保存 7 天。长期运行的服务器（自托管 VPS）缓存持续有效；Vercel 这类短生命周期实例命中率低，代价只是多查一次，卡片照片本身已存在消息里。将来换成 Redis 等共享缓存时，替换的就是这一层，规则不变。地点搜索/核验不缓存。图片文件本身由 next/image 缓存（自托管在 `.next/cache/images`），浏览器另有图片缓存。查图失败记录 `place_photo.lookup.failed`（带高德 infocode），不影响聊天或保存。

**防盗链：**高德的 http 图片地址会检查 Referer，网页里直接用 `<img src="http://...">` 加载常返回 400；https 地址带 Referer 也正常（2026-10-03 实测）。Meri 的照片都经 next/image：浏览器只请求本站的 `/_next/image`，由服务器无 Referer 地去高德取图，所以部署在任何域名都不受防盗链影响。不要在页面里直接使用高德原始图片地址。

**高德限流：**同一个 key 每秒能发起的请求有限，超出时仍是 HTTP 200，但 body 为 `status: "0"`、infocode 10021（`CUQPS_HAS_EXCEEDED_THE_LIMIT`）。实测：并行 12 个请求被拒 5 个；每 0.34 秒一个从不失败，每 0.25 秒或更快会间歇失败。所以所有高德调用（地点核验、输入建议、照片）都经过 [amap-fetch](../src/platform/amap/amap-fetch.ts) 的同一个队列：两次请求的开始时间至少相隔 350ms。被限流时**整个队列**暂停 1 秒（已经在排队的请求也一起等，避免接着撞上限制），被拒的请求排到队首重试，最多重试 3 次，每次记录 `amap.rate_limited`（带第几次、是否还会重试）。每个请求的超时（核验/建议 8 秒、照片 6 秒）从它**真正发出时**开始计算：以前超时在排队前就开始计时，12 张卡排在队尾的查图还没发出就超时了，最后一张卡因此没有照片。一次推荐 12 张卡的查图约需 4 秒，现在发生在卡片出现之后、逐张补上；“潮汕”这类同时核验 3 个城市约多 0.7 秒。

| 接口 | 请求 | 结果 |
| --- | --- | --- |
| `GET /api/trips/[id]/destination-photos` | 无 body；guest cookie 决定 owner | 200 `{photos: [{key, label, image}]}`，`Cache-Control: private, no-store`；无 owner/旅程 404；其他失败 500，界面只显示地球 |
| `POST /api/trips/[id]/destination-recommendation-photos` | `{messageId}`（只此一个字段），guest cookie 决定 owner | 200 流式 `application/x-ndjson`：每张还没照片的卡一行 `{id, image\|null}`，查完并保存后结束；没有待查的卡时为空响应。带 `X-Accel-Buffering: no`（nginx 反向代理默认缓冲，会把所有行攒到最后），`Cache-Control: private, no-store, no-transform`。body 不合法 400；无 owner、旅程不存在或该消息不是推荐卡 404；读取消息失败 500。保存失败不影响已发出的行 |

## 6. 回复到底是谁写的：速查表

| 场景 | 正文来源 | 卡片/状态来源 |
| --- | --- | --- |
| Home 普通开场 | Kimi opening reply | 初始 TripState |
| Home 地点候选/失败 | destinationEditReply 固定模板 | 高德及 applyDestinationEdit |
| Home 地点精确写入 | Kimi opening reply | 初始 TripState 已含该地点 |
| 普通提问、闲聊、普通字段修改 | Kimi reply | 校验后的普通 patch |
| 地点 add/set 精确写入 | destinationEditReply“已加入…”（首次可规划时加一次准备度句）＋ Kimi reply | 直接写入的目的地 |
| 地点 add/set 候选 | destinationEditReply 固定说明 | 高德候选，正式目的地不变 |
| 地点未找到/查询失败 | route 固定事实说明 | 无结果/故障事实 |
| remove 成功无失败项 | Kimi reply | 实际删除；成功措辞仍依赖模型 |
| remove 歧义/无匹配 | route 固定说明 | 当前保存状态匹配结果 |
| 聊天推荐回合 | 本轮解释 Kimi reply（不点名地点；[recommendationLeadIn](../src/capabilities/conversation/turn-reply.ts)去掉其中的问句）＋ pending 标记 | 无卡；客户端随后请求卡片 |
| 推荐卡片消息 | workflow 固定句 | 另一次 Kimi 推荐生成、Bocha 上下文及应用过滤，第二个请求生成 |
| 聊天推荐无卡 | workflow 固定失败正文 | 无可展示建议 |
| 聊天选卡提交成功 | destinationSelectionReply 固定确认（首次可规划时才附准备度） | 保存前后状态和准备度 |
| 右侧直接编辑/搜索/删除 | 固定加载、按钮、错误提示 | 不新增聊天正文 |
| Generate plan | planningReadinessMessage 固定句 | 状态检查，不生成行程 |
| 右下角小熊的一句话 | [companionStatus](../src/components/companion/companion-status-model.ts) 固定句 | 由当前 TripState 与聊天活动决定，不调用模型：出错 > 思考中 > 可生成（并列出可选的缺项：出发地、出行时间、交通方式）> 缺目的地/旧目的地待确认 |

[AI SDK 客户端](../src/platform/llm/ai-sdk-kimi-client.ts)默认 kimi-k2.6，LLM_MODEL 可覆盖；MOONSHOT_API_KEY 认证，MOONSHOT_BASE_URL 可覆盖地址。默认超时 60 秒，maxRetries=0。仓库默认配置不等于实时服务保证。

[WorkspaceChatTransport](../src/components/trip-workspace/workspace-chat-transport.ts)取得服务端完整 JSON 后适配 useChat，替换临时用户 ID、同步真实状态。[conversation-reveal](../src/components/trip-workspace/conversation-reveal.ts)提供客户端逐字显示；这不代表 API 正在逐 token 流式生成或保存。

## 7. 持久化与几个需要留意的实现差异

### 7.1 各记录的职责

- Trip：Journey 身份、owner、生命周期。
- TripState：当前七类字段，目的地省市/景点；不包含 UI 布局决定。
- TripMessage：真实用户/助手文本，助手可带受限 presentation，刷新重读。
- 推荐操作：只从聊天触发（source=conversation），未定义独立持久化实体；历史 `trip_user_actions` 表由 [0007](../drizzle/0007_trip_user_actions.sql) 创建、[0009](../drizzle/0009_drop_trip_user_actions.sql) 定义删除，当前 schema 不包含该表。具体环境是否执行迁移需另行检查。
- JourneySummary：列表投影，不能作为修改基底。

当前的短期上下文来自最近 5 轮/6000 字符（推荐上下文最多 10 条/6000 字符）和当前 TripState。数据库里的完整聊天记录可刷新恢复，但并非每次全部发送给模型；尚未实现跨旅程长期偏好记忆、对话摘要记忆或检索式 memory。本轮国内范围变更未扩大历史窗口。

数据库定义：[schema](../src/platform/persistence/database/schema/index.ts)。状态仓库：[postgres-trip-state-repository](../src/platform/persistence/postgres/postgres-trip-state-repository.ts)。

### 7.2 并发写入与比较并交换

[updateTripState](../src/capabilities/journey/journey-service.ts)每次读最新状态、应用 patch，再 compareAndUpdate，最多尝试 3 次。普通字段冲突重读重算，保留并发新增目的地，避免用旧整个状态覆盖。

目的地变更传 expectedDestination，重读后与预期不同则 TripStateConflictError/409；不能重套旧目的地 patch。聊天删除、手动变更和选卡提交都走这个边界。

[Postgres CAS](../src/platform/persistence/postgres/postgres-trip-state-repository.ts)读取原始 JSON、验证领域对象与预期状态，再用原始 JSONB 作 UPDATE 条件，检查返回 ID。即使旧 JSON 在读取时被适配，也能原子阻止旧状态覆盖新写入。

生产 Postgres 和内存仓库实现 CAS；接口仍允许没有 compareAndUpdate 的测试替身退回 update，不能把替身路径当生产并发保护。

### 7.3 旧数据与实现局限

旧字符串 places、旧卡片 presentation 在领域读取边界适配。旧 free-text destination.value 保留为 known、areas=[]、legacyText；显示待确认，不把景点强转为城市。

追加已核验地点保留 legacyText，明确清除旧记录才移除；用户提交 replace 整体替换则采用新目的地。没有清库或新增地理实体数据库。

当前限制：

- 聊天状态与消息不是同一跨步骤事务，失败需刷新核对。
- 选卡组合有确认身份与去重，普通聊天/推荐 POST 还无全局重试幂等保证。
- 手动路由 ownerAndTrip 把加载异常统一当未找到，不能由 404 区分数据库故障。
- 最终 spot 按名称保存/去重，不能单靠 TripState 区分两个同名 POI，未来须再核验。
- 手动搜索的同名不可区分项仍禁用；聊天只确认省市及景点偏好，精确 POI/地图消歧留到规划阶段。
- 未实现删除撤销、省内限定搜索、Research Agent 或真正计划生成。
- 通用 [state PATCH](../src/app/api/trips/[id]/state/route.ts) 仍接受领域校验通过的 destination patch，没有统一地点核验；前端普通字段模型拒绝直接编辑目的地，不等于服务端限制。该 route 当前也未将 TripStateConflictError 单独映射为 409；专用目的地 route 的并发响应不能泛化到它。

### 7.4 下一版 Generate Plan 的交接边界（计划）

未来规划应从当前 TripState 取得省范围、已选城市、spots 偏好及日期/交通。只有省的目的地以整省为范围、旧文本需重新确认，均有明确处理规则；未提交候选不能当已选，已删除景点不能从历史恢复。

生成前重新核验 POI，保存证据和新鲜度，再研究交通、天气、开放/访问与风险。准备度通过不代表这些事实已成立。执行、失败恢复、研究预算及持久化规划产物尚未接入；本轮只记录边界，不预先实现框架。

### 核心文件索引

| 业务/操作 | 文件 | 追踪细节 |
| --- | --- | --- |
| Home 提交和失败重试 | [composer model](../src/components/meri-shell/new-trip-composer-model.ts) | 两次请求、phase、导航 |
| 草稿提取 | [extractor](../src/capabilities/journey/trip-draft-extractor.ts) | 模型 JSON 与校验 |
| 创建开场协调 | [create-journey-with-opening](../src/capabilities/journey/create-journey-with-opening.ts) | 高德候选、opening 分支 |
| 创建/读取/并发更新 | [journey-service](../src/capabilities/journey/journey-service.ts) | 所有权、回滚、CAS |
| 初始状态与读取兼容 | [trip-state](../src/domain/trip-state/trip-state.ts) | authority、初始化、旧数据 |
| 目的地操作契约 | [destination-edit](../src/domain/trip-state/destination-edit.ts) | 受限 schema、四种操作 |
| 层级纯函数 | [destination-areas](../src/domain/trip-state/destination-areas.ts) | 合并、包含、唯一匹配、级联 |
| 城市与景点偏好归并 | [destination-choice-identity](../src/domain/trip-message/destination-choice-identity.ts) | 目标身份、同省市同偏好合并、历史原 ID 保留 |
| 聊天模型解释 | [interpreter](../src/capabilities/conversation/workspace-conversation-interpreter.ts) | 四项 JSON、opening 限制 |
| 普通字段校验 | [workspace-conversation](../src/domain/trip-state/workspace-conversation.ts) | changes → user patch，丢弃不改变字段的 change |
| 实际聊天分支 | [messages route](../src/app/api/trip-workspace/messages/route.ts) | 保存顺序、固定正文、错误 |
| 历史上下文 | [conversation-context](../src/capabilities/conversation/workspace-conversation-context.ts) | 5 轮/6000 字符、助手合并 |
| 地点操作执行 | [apply-destination-edit](../src/capabilities/destination/apply-destination-edit.ts) | 精确且为用户原话才写入、其余候选、部分失败 |
| 高德层级映射 | [resolve-destination-place](../src/capabilities/destination/resolve-destination-place.ts) | 省市、spot、不同 POI 保留 |
| 提供方解析 | [location-service](../src/capabilities/destination/location-service.ts)、[Amap adapter](../src/platform/location-provider/amap-location-provider.ts) | 解析状态、规范化错误 |
| 推荐资格与 pending | [recommendation-use-case](../src/capabilities/recommendation/destination-recommendation-use-case.ts) | within/elsewhere 范围、pending 请求还原 |
| 推荐卡片请求 | [destination-recommendations route](../src/app/api/trips/[id]/destination-recommendations/route.ts) | 最新消息检查、派生 ID、幂等 |
| 应用自己的句子 | [turn-reply](../src/capabilities/conversation/turn-reply.ts) | 已加入/候选/失败正文、准备度只说一次 |
| 推荐流水线 | [workflow](../src/capabilities/recommendation/destination-recommendation-workflow.ts) | 搜索、生成、省范围过滤，卡片带地标、不带照片 |
| 推荐卡照片 | [recommendation-photos](../src/capabilities/recommendation/recommendation-photos.ts)、[photos route](../src/app/api/trips/[id]/destination-recommendation-photos/route.ts)、[stream reader](../src/components/trip-workspace/destination-recommendation-model.ts)、[Skeleton](../src/components/ui/skeleton.tsx) | 卡片出现后逐张流式补照片，查完写回卡片消息 |
| 地点照片 | [place-images](../src/capabilities/destination/place-images.ts)、[Amap photo provider](../src/platform/place-photos/amap-place-photo-provider.ts)、[destination-photos route](../src/app/api/trips/[id]/destination-photos/route.ts) | 查询顺序、卡片配图、已选地点照片、7 天缓存 |
| 照片环与标题图 | [journey-orbit](../src/components/trip-workspace/journey-orbit.tsx)、[photos model](../src/components/trip-workspace/destination-photos-model.ts)、[workspace-header](../src/components/trip-workspace/workspace-header.tsx) | 旋转、暂停、点击转到前方、封面 |
| 统一选卡提交 | [selection route](../src/app/api/trips/[id]/destination-recommendation-selection/route.ts) | offer 校验、整批核验、替换、重试 |
| 提交身份复核 | [verified-choice](../src/capabilities/destination/verified-destination-choice.ts) | provider ID 与历史规范名 |
| 手动搜索/添加/删除 | [destinations route](../src/app/api/trips/[id]/destinations/route.ts) | 精确 body、重查、完整删除元组 |
| 聊天多选卡 | [choices card](../src/components/trip-workspace/destination-choices-card.tsx) | 分省、暂选、批量确认 |
| 聊天同步/恢复 | [conversation-panel](../src/components/trip-workspace/conversation-panel.tsx)、[transport](../src/components/trip-workspace/workspace-chat-transport.ts) | pending、保存状态、消息 ID |
| 右侧目的地 | [destination-editor](../src/components/trip-workspace/destination-editor.tsx) | 层级、搜索防抖、busy、删除 |
| 右侧普通字段 | [brief panel](../src/components/trip-workspace/expedition-brief-panel.tsx)、[location-editor](../src/components/trip-workspace/location-editor.tsx) | 编辑、origin、准备度快照 |
| 历史卡片适配 | [trip-message](../src/domain/trip-message/trip-message.ts)、[UI adapter](../src/components/trip-workspace/trip-message-ui-adapter.ts) | 领域读取与统一展示 |
| 规划准备度 | [planning-readiness](../src/domain/trip-state/planning-readiness.ts) | missing/unverified/selected |
| 原子数据库更新 | [postgres state repository](../src/platform/persistence/postgres/postgres-trip-state-repository.ts) | 原始 JSONB 条件更新 |
| 模型 SDK | [ai-sdk-kimi-client](../src/platform/llm/ai-sdk-kimi-client.ts) | 模型配置、超时、日志 |

“用户入口 → 模型 JSON → 领域校验 → 地点核验/推荐 → 显式选择 → 状态保存 → UI 恢复”展开。每层说明业务规则、权威来源和失败边界，区分提案、候选与已保存决定。
