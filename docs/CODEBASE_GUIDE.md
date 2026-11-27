# Meri 代码库讲解与 AI 阅读导航

> 核对日期：2026-10-01。本文解释当前仓库的目录、分层和每个项目文件的职责，供 AI 定位代码及向用户讲解。路径相对仓库根目录 `C:\Merlin Programe\Meri-Road-Trip`。这是源码导航，不是未来实施计划；业务操作、请求体、状态变化和失败边界详见 [USER_FLOW_CURRENT.md](USER_FLOW_CURRENT.md)。

## 1. 怎么读这份文件

- 开始任务先读根目录 [AGENTS.md](../AGENTS.md)，以及 [PROJECT.md](PROJECT.md)、[ARCHITECTURE.md](ARCHITECTURE.md)、[CODING_PRINCIPLES.md](CODING_PRINCIPLES.md)。再读本文第 1–5 节建立代码地图。
- 第 6 节是完整文件索引，按任务查找对应模块，再阅读真实源码和相邻测试。不要求每次把所有文件全文放入上下文；引用文档路径也不等于 AI 已经读取了文件内容。
- 修改用户操作、聊天、API 或持久化时，阅读 `USER_FLOW_CURRENT.md` 的对应详细章节；它保留操作与代码映射，不用本文替代。
- 数据库表、字段、关系与迁移的专门目录见 [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)；改 schema/repository/migration 时查阅。
- 天地图接口的请求形态、真实返回、字段含义与已证伪的猜想见 [TIANDITU_FIELDS.md](TIANDITU_FIELDS.md)；改 `src/platform/tianditu/` 或排查地点核验问题时查阅。
- 核对实现时以实际入口及调用链为准。一个 helper 有导出和测试，不代表页面正在调用它；历史 SQL 也不代表当前数据库表仍存在。
- 文件索引覆盖版本控制内的源码、测试、配置、迁移、文档和资源，每个文件单独列出。不枚举 `.git/`、`node_modules/`、`.next/`、本地环境密钥、日志及生成缓存。`next-env.d.ts` 和 `*.tsbuildinfo` 是本地生成文件，按 `.gitignore` 排除。
- 此文是维护时的源码快照。增删或移动项目文件时同步索引和引用；文档无法代替实际检查 `git status`、diff 和当前源码。

## 2. 根目录与架构层对应关系

### 2.1 根目录

| 目录地址 | 大体职责 | 架构归属 |
| --- | --- | --- |
| `src/` | 应用入口、界面、业务规则、应用用例和外部系统适配 | 运行时代码，包含下述各层 |
| `docs/` | 产品目标、当前架构、开发原则、详细业务流程和代码导航 | 文档，不参与运行 |
| `docs/product/` | 尚未落地的产品方向说明 | 设计资料，不能当作已实现功能 |
| `docs/agent-planner/` | Planner Agent 的规划讨论与 Agent 课程笔记 | 规划资料，定稿并实现后写入 `src/agents/README.md` |
| `public/` | 通过网站 URL 直接访问的背景、品牌、角色图片等静态文件 | 展示资源 |
| `assets/` | 设计参考、品牌预览、角色原图和素材处理脚本 | 设计与素材制作，不是业务层 |
| `drizzle/` | 按顺序执行的数据库迁移 SQL 及生成元数据 | 基础设施：数据库演进 |
| `drizzle/meta/` | 迁移 journal 与历史 schema snapshot | Drizzle 工具元数据 |
| `scripts/` | 人工运行的真实提供方/模型验证工具 | 开发工具，不是 Web API |
| `evals/plan/` | Generate plan 评测集：用例 JSON（`cases/`）和每次批量运行的结果（`results/`） | 评测数据，不参与运行 |
| 根目录配置文件 | npm、TypeScript、ESLint、Next.js、Drizzle 配置与 AI 入口 | 工程配置及开发约定 |

### 2.2 `src/` 内的分层

| 目录地址 | 职责与常见内容 | 程序员常用层名称 |
| --- | --- | --- |
| `src/app/` | Next.js App Router 页面、layout、manifest、HTTP 路由 | 框架入口层；页面是展示入口，API 是接口/控制器入口 |
| `src/app/api/` | 接收请求、读 cookie、校验输入、调用应用服务、转换 HTTP 响应 | 接口层；部分业务流程编排当前也在 route 中 |
| `src/app/trips/` | Journey 列表、Workspace 页面和删除入口 | 页面层，含服务端读取与客户端操作组件 |
| `src/components/` | React UI 和前端请求/展示模型 | 表现层（presentation layer） |
| `src/components/meri-shell/` | 首页外壳、创建输入、最近旅程 | 首页表现层 |
| `src/components/intro/` | 品牌介绍、教程轮播与本地示例照片 | 介绍页表现层；不执行规划或改写旅程状态 |
| `src/components/i18n/` | 界面文字的中英字典和把当前语言交给客户端组件的 Provider | 表现层 |
| `src/components/companion/` | 小熊：一句话规则、行为规则、精灵图播放器和帧清单 | Companion 表现层 |
| `src/components/trip-workspace/` | 聊天、右侧字段编辑、目的地卡、状态同步、准备度按钮 | Workspace 表现层 |
| `src/components/ui/` | 已使用的基础 UI：动画 Popover、动画复选框、像素标题、骨架占位块 | UI 基础组件 |
| `src/domain/` | 数据类型、校验、状态变换、纯业务规则，无网络/数据库 IO | 领域层（domain layer），回答“什么是合法业务状态” |
| `src/domain/trip/` | Trip 身份、访客归属、生命周期及错误 | Journey 根实体 |
| `src/domain/trip-state/` | 权威旅程字段、目的地层级、删除规则、准备度及聊天修改契约 | 状态与领域规则 |
| `src/domain/trip-draft/` | 首页自然语言提取的草稿契约 | 输入领域模型 |
| `src/domain/trip-message/` | 持久化消息、支持的 presentation、选择项偏好身份 | 会话领域模型 |
| `src/domain/location/` | 地点候选、建议、合理匹配规则和推荐校验 | 地点领域模型及纯规则 |
| `src/domain/catalog/` | Meri 目录条目的 schema、标签归并表、入库行的拼法（RAG 第 1 步） | 领域层；目录数据本身在私有仓库，不进本仓库 |
| `src/domain/locale/` | 支持的语言（zh/en）与 `<html lang>` 取值 | 领域层基础类型 |
| `src/capabilities/` | 围绕具体能力组织服务、用例、prompt 和流程编排 | 应用层（application layer），回答“完成一个操作需要哪些步骤” |
| `src/capabilities/journey/` | 创建、加载、更新、删除 Journey 和草稿提取 | Journey 应用用例 |
| `src/capabilities/conversation/` | 模型解释、开场、历史上下文和消息保存 | 对话应用用例 |
| `src/capabilities/destination/` | 地点查询协调、层级映射、候选准备、提交复核 | 目的地应用用例 |
| `src/capabilities/recommendation/` | 搜索启发、结构化推荐、省份过滤和消息编排 | 推荐应用用例；确定性 workflow |
| `src/agents/` | Mastra 入口、Agent、工具和工作流（工具是对 platform 端口的一层薄包装） | Agent 层；Scout 试验，以及计划页通过 plan-generation 工作流调用的调研、天地图定位、路线和选点 |
| `src/agents/tools/` | Agent 可调用的工具：地点核验、网页搜索 | Agent 工具 |
| `src/agents/planner/` | 规划的各部分，都是可单独调用的函数：调研、天地图定位、路线、选点、配图 | Agent 与固定步骤 |
| `src/agents/workflows/` | Mastra 工作流：只导入 planner 函数并编排顺序、并行和进度事件 | 编排层（工作流） |
| `src/platform/` | 提供外部调用接口和具体实现 | 基础设施/集成层（infrastructure layer），端口与适配器 |
| `src/platform/llm/` | 模型客户端契约、Kimi 调用、SDK 错误与超时适配 | 模型提供方适配 |
| `src/platform/location-provider/` | 地点搜索/输入建议接口（实现在 `src/platform/tianditu/`） | 地图提供方适配 |
| `src/platform/search/` | Discovery Search 接口及 Bocha、Kimi Search Pro 请求/响应适配 | 搜索提供方适配 |
| `src/platform/catalog/` | 读 Meri 目录（catalog_entries）某个州/市的景点和特色菜；`CATALOG_ENABLED` 开关 | 数据库只读适配器（RAG 第 2 步） |
| `src/platform/embedding/` | 百炼向量接口（兼容 OpenAI 的 /embeddings），每天调用上限和总开关 | 外部集成适配器（RAG 第 3 步） |
| `src/platform/rail/` | 火车：12306-mcp 子进程、请求节奏和每日上限、城市名转换、查余票适配（1.2108） | 外部集成适配器 |
| `src/platform/place-photos/` | 地点照片接口、本地图集（地区与名称匹配），以及推荐卡的运行时补图（Wikimedia 先、Pixabay 后：客户端、身份判断、媒体目录存储） | 照片提供方适配 |
| `src/platform/persistence/` | repository 接口，隔离应用层与数据库实现 | 持久化端口；这里的接口不等于 SQL 实现 |
| `src/platform/persistence/postgres/` | PostgreSQL repository，读取校验、错误包装、CAS 更新 | 持久化适配器 |
| `src/platform/persistence/in-memory/` | 内存 repository，用于测试替身 | 持久化测试适配器 |
| `src/platform/persistence/database/` | Neon/Drizzle 连接与 schema | 数据库连接及表结构 |
| `src/platform/identity/` | guest cookie 创建和读取 | 访客身份基础设施 |
| `src/platform/locale/` | 语言 cookie 的读写规则与按请求取语言（cookie → Accept-Language） | 访客偏好基础设施 |
| `src/platform/observability/` | 结构化日志、错误序列化及脱敏 | 可观测性基础设施 |

“业务层”容易同时指两层：`domain` 定义规则，`capabilities` 编排用例。“数据调用层”最好具体说成持久化适配器、地图适配器或模型适配器；数据库、HTTP 提供方和 LLM 是不同边界。

## 3. 向用户讲解当前架构

### 3.1 总体结构与调用方向

Meri 是一个以 Journey 为中心的 Next.js 全栈应用。代码在同一仓库、同一应用内分模块组织，可以称为分层的模块化单体；不是微服务。`capabilities` 按业务能力分目录，`domain` 保留可测试的纯规则，`platform` 封装数据库和外部提供方。

```text
浏览器：React 组件 + 前端模型
    ↓ HTTP 请求
Next.js route：输入/身份检查 + 响应转换 + 部分流程编排
    ↓ 调用
应用用例：Journey / Conversation / Destination / Recommendation
    ├─ 领域规则：校验、合并、删除、准备度（纯函数，无 IO）
    └─ 外部端口：Repository / LocationProvider / 模型客户端 / Search
           ↓ 具体适配器
       Neon PostgreSQL / 天地图 / Kimi / Bocha
    ↓ 返回保存的状态和消息
UI 同步状态；刷新从数据库恢复
```

这是当前代码的职责划分，不要包装成严格执行全部 Clean Architecture 约束的框架：repository/provider 端口目前放在 `platform`；`*-instance.ts` 装配生产实现；某些 route 自己协调多个步骤；部分组件直接请求本应用 API；搜索上下文类型也存在跨目录引用。未来是否调整要由具体问题驱动。

### 3.2 三种核心数据与一个读模型

| 名称 | 保存什么 | 权威与边界 |
| --- | --- | --- |
| Trip | ID、ownerGuestId、status、时间戳 | Journey 身份与生命周期根；不重复保存旅程字段 |
| TripState | name、origin、destination、startDate、endDate、duration、transportPreference | 当前用户决定的权威状态 |
| TripMessage | 用户/助手原文，助手可附受限 presentation | 真实历史和待选卡，不等于已保存偏好 |
| JourneySummary | 从 Trip + TripState 投影出的列表信息 | 读模型，不是另一份可写事实来源 |

当前数据库 schema 有 `trips`、`trip_states`、`trip_messages`。推荐只从聊天触发（`source=conversation`），没有推荐按钮入口，也不写独立 action 表。历史迁移 `0007` 曾创建 `trip_user_actions`，`0009` 已定义删除该表；仓库文件不能证明任何环境已经实际执行迁移。

普通字段可以 known/approximate/ambiguous/missing。destination 只有 missing/known，known 保存 `areas: [{ province, places: [{ name, spots: string[] }] }]`，可能带待确认旧文本 `legacyText`。展示文案从结构派生；spot 目前是想去的名称，不是精确 POI ID 或坐标。

### 3.3 AI 和应用各自决定什么

LLM 解释自然语言并提出受限 JSON；应用校验、决定是否执行、核验地点并保存。助手建议即使经过天地图核验，仍需要用户显式确认才成为目的地。Gen UI 是受限数据驱动的预写 React 组件，不是模型生成 JSX。

推荐是确定性流程：Meri 目录的城市匹配（开关打开且够相似时）或 Discovery Search → Kimi 结构化推荐（含配图用的代表地标）→ 校验/去重 → 省份过滤 → 保存建议（卡片带地标、无照片）→ 浏览器另行请求照片，服务器按地标和地区查询当前照片提供方、逐张流式返回并写回卡片消息 → 显式选中时复核地点。推荐流程没有接入访问检查或排序，推荐卡照片只作装饰。Generate plan 检查准备度后将保存的状态和偏好交给真实计划页。独立调研脚本读取同一交接契约，调用 Research Agent 返回有来源的候选景点。PWA 有 manifest 和图标，没有离线 service worker。

### 3.4 两条实际操作链

**首页新建：**`new-trip-composer` → `POST /api/trip-drafts` → extractor + prompt + 领域校验 → `POST /api/journeys` → `createJourneyWithOpening` → JourneyService 保存身份/状态/原话及候选开场，或在创建后生成普通 opening → Workspace。

**聊天选目的地：**`conversation-panel` + transport → `POST /api/trip-workspace/messages` → interpreter → 普通字段 patch 保存 → `applyDestinationEdit`（用户原话中的精确地点直接写入，其余准备候选）→ 保存用户/助手消息 → `destination-choices-card` 多选 → selection route 从保存的 offer 校验 ID、资格和目标 → 高德复核 → JourneyService CAS 更新 → 保存固定确认消息 → UI 同步。

右侧手动搜索独立走 destinations API；出发地输入建议走 locations/suggestions API；普通字段编辑走 state PATCH。不能把它们都描述为聊天模型调用。

## 4. 必须保留的业务边界与实现局限

1. 同省/市/spot 的多个 POI 可在聊天卡中合并成一个偏好选择；不同省市或不同 spot 仍独立。合并偏好不等于精确 POI 消歧。
2. add/set 只追加，不删除已保存项。用户原话里、被天地图精确匹配的地点直接写入；错别字、多个可能、宽泛区域、模型改写的名称生成追加待选卡。用户明确不去某个地点才通过 remove 删除对应项。历史 replace 卡仍按原基底和过期规则处理，新聊天不再生成整体替换卡。
3. 删除 city 同时删除其 spots，并保留 province；删除 spot 保留 city；删除 province 删除全部子项。聊天删除用当前状态的精确名称或唯一前缀，手动删除传完整省/市/spot 元组。
4. 已确认卡片和后续对话之前的旧卡只读。服务端也检查过期，安全的同组选项重试复用确认消息；不能让旧卡恢复后来删除的地点。
5. CAS（比较并交换）以读取的状态为前提更新。生产 PostgreSQL 用原始 JSONB 作为条件；JourneyService 最多重试 3 次。目的地操作带 expectedDestination，冲突拒绝套用旧目的地；普通字段重试重算，保留并发变更。
6. 状态更新与会话保存仍是分开的步骤，不是跨全部流程的一笔事务。选卡状态成功而确认消息失败时，返回实际 TripState 和 `follow_up_unavailable`；普通聊天失败则需刷新核对。
7. 旧自由文本保留 `legacyText`，不伪造行政身份。准备度只要求已有目的地且无待确认旧记录；只有省、没有市也可以开始规划。未来研究应从当前 TripState 取偏好，不能从旧聊天恢复删除项。
8. 通用 state PATCH 当前接受领域校验后的 patch，仍能包含 destination；它并非所有目的地请求都统一地点核验的入口。专用目的地接口有更明确的核验/并发边界。state route 的错误映射当前也未将 TripStateConflictError 单独映射成 409。这些是实现边界，本文没有顺带修改代码。
9. `workspace-turn-branch.ts` 和旧 `destination-recommendation-picker.tsx` 仍在仓库并有测试，但当前主聊天链路不使用它们；实际聊天分支在 messages route，当前卡片在 `destination-choices-card.tsx`。

旧 `destination-refactor-plan.md` 已完成历史使命。其有效决定在本节及当前业务文档中保留；旧设计中稳定地理 ID、spot 坐标、撤销提示、省内限定搜索等建议没有实现，也不因此成为待执行任务。历史审查和具体旧方案可从 Git 历史查看。

## 5. 给 AI 的按任务阅读路径及后续扩展原则

| 任务 | 应读源码与对应测试 | 应读业务文档 |
| --- | --- | --- |
| 首页创建或 opening 重试 | composer/model、trip-drafts/journeys/initialize routes、journey extractor/create-with-opening/service、opening service | USER_FLOW_CURRENT 第 1–2 节 |
| 聊天解释、字段更新、推荐触发 | messages route、interpreter/prompt、workspace-conversation、recommendation use case、历史上下文和 transport | 第 3 节及第 6 节 |
| 目的地省市/spot、搜索、删除 | destination-areas、apply-edit、resolve-place、location service/provider、destinations route、destination editor | 第 3.2、5.2–5.3 节 |
| 卡片合并、过期或安全重试 | choice identity、verified choice、selection route、selection message ID、UI adapter、choices card、conversation panel | 第 4 节及第 7.2–7.3 节 |
| 推荐生成与搜索降级 | recommendation context/generator/prompt/workflow/use case、Discovery Search/Bocha | 第 4.1 节 |
| 日期/交通/出发地直接编辑 | brief panel、location editor/model、trip-state persistence model、state/suggestions routes | 第 5.1 节 |
| Generate plan 交接 | planning-readiness、planning-handoff route/model、generate-plan action、真实计划页 | 第 5.4 节 |
| Agent、工具、Planner | `src/agents/README.md`（先读）、`docs/agent-planner/README.md`（规划决定）、`src/agents/` 源码与测试、`src/agents/workflows/plan-generation.ts`、`src/capabilities/planning/plan-run-service.ts`、`scripts/verify-agent-tools.ts`、`scripts/verify-plan-research.ts`、`scripts/verify-plan-draft.ts`、`scripts/eval-plan.ts`（评测集） | 调研和整个工作流都可用脚本独立验证，评测集批量跑固定用例；计划页生成、进度事件和计划版本见 USER_FLOW 第 5.4 节 |
| 保存、并发、列表或删除 | Journey/Trip services、repository 接口、Postgres 实现、schema、my-journeys 和相关页面 | 第 1.1、2.3、7 节 |
| 视觉或动画 | 对应 TSX/CSS、现有 UI 组件及引用的 public 资源 | 涉及操作变化时同步相应业务章节 |

当前规模适合保留一个完整导航文件；“能够列全”不意味着“每次必须读全”。根 `AGENTS.md` 放共用规则，`CLAUDE.md` 引用它并提供导航，避免两份入口复制后逐渐分叉。

以后某模块出现独立规则或复杂文档时，再在该目录增加局部说明/指令，根入口仅保留索引和共用约束；是否自动加载取决于实际使用的工具，不能假定所有 AI 都递归加载。全量文件目录可以按模块拆分，但详细业务流程仍保留。此次没有提前搭建分层文档系统或增加各目录 AGENTS。

## 6. 项目文件逐项索引

下表按目录分类，每个路径都有独立一行。测试不是运行时业务层；同目录测试主要验证对应层的规则或适配边界，多数使用 mock/内存替身，不据此宣称真实提供方已验证。

本次索引按路径去重共 521 个文件，其中 123 个测试文件（2026-11-15 按本节表格行数统计）。

### 6.1 根目录配置与入口

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [.env.example](../.env.example) | 工程配置 | 服务端环境变量模板，提供数据库、Kimi、天地图、Bocha、时区和日志配置示例；末尾一组是 Generate plan 提供方试验的变量名（高德 JS 地图、和风天气、RollingGo、途牛、TypeSafe、AnySearch、天地图、阿里云百炼、华为位置服务），目前只有验证脚本读取；不放真实密钥。 |
| [.gitignore](../.gitignore) | 工程配置 | 忽略依赖、构建结果、环境密钥、日志和 TypeScript 生成文件。 |
| [AGENTS.md](../AGENTS.md) | 文档/开发约定 | 所有 AI 的共同入口：必读文档（Agent 工作另读 `src/agents/README.md`）、Git 修改保护、当前业务边界及 Next.js 本地指南要求。 |
| [.claude/launch.json](../.claude/launch.json) | 开发工具配置 | Claude 浏览器预览面板启动 `npm run dev`（端口 3000）的配置，不影响应用运行。 |
| [CLAUDE.md](../CLAUDE.md) | 文档/开发约定 | Claude 入口，以 @AGENTS.md 引用共用规则，补充导航链接，避免复制规则。 |
| [README.md](../README.md) | 文档/开发约定 | 本地运行、环境变量、检查命令、架构入口和部署说明。 |
| [drizzle.config.ts](../drizzle.config.ts) | 工程配置 | 加载本地环境，指定 PostgreSQL schema 和迁移目录，检查 DATABASE_URL。 |
| [eslint.config.mjs](../eslint.config.mjs) | 工程配置 | ESLint flat config，组合 Next.js 和 TypeScript 规则及忽略项。 |
| [next.config.ts](../next.config.ts) | 工程配置 | Next.js 配置入口：允许 next/image 从照片提供方的白名单主机取图；开发模式下 `images.dangerouslyAllowLocalIP`，因为本机 Mihomo TUN 的 fake-IP（198.18.x.x）会被优化器当内网地址拒绝，远端照片全部 400。 |
| [.gitattributes](../.gitattributes) | 工程配置 | `* text=auto eol=lf`：所有文本文件在任何平台上都按 LF 检出（图片等二进制按 binary 处理）。没有它，Windows 上 `core.autocrlf=true` 会把快照转成 CRLF，中文 prompt 锁定测试因行尾不同而失败（2026-10-23）。 |
| [package-lock.json](../package-lock.json) | 工程配置 | 锁定 npm 依赖解析结果，保证安装版本可重现。 |
| [package.json](../package.json) | 工程配置 | 项目信息、依赖（1.2104 起有 Leaflet，画计划页地图）与 dev/build/start/lint/test/typecheck 命令；`test` 跑 `src/` 和 `scripts/` 下的测试。 |
| [tsconfig.json](../tsconfig.json) | 工程配置 | TypeScript 编译/检查、路径别名及 Next.js 类型配置。 |

### 6.2 文档

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) | 文档/开发约定 | 当前模型权威、模块分工、目的地选择和并发边界；区分已实现与未来研究。 |
| [docs/DEPLOY_BRIEF.md](../docs/DEPLOY_BRIEF.md) | 文档/部署交接 | 2026-11-21：给负责部署 VPS 的 agent 的交接说明：先定国内还是港日服务器、天地图和密钥的硬规定、部署步骤、上线前仍需的代码改动。 |
| [docs/PHOTO_CATALOG_BRIEF.md](PHOTO_CATALOG_BRIEF.md) | 交接文档 | B1：给另一个 agent（`codex` 分支）的目录景点和菜小照片任务：复用 Wikimedia 客户端和许可证规则，景点 320px、菜 200px AVIF，清单带作者和许可证，先做大理、迪庆试点再停。 |
| [docs/PDF_EXPORT_BRIEF.md](../docs/PDF_EXPORT_BRIEF.md) | 文档/开发交接 | 2026-11-22：给另一个 agent 的 PDF 导出交接说明：只做 PDF、不用 LLM、现场生成不存储、Playwright 打印专用页面、版式、图片规则、进度条、在 `pdf-export` 分支上做、不合并 main。 |
| [docs/CODEBASE_GUIDE.md](../docs/CODEBASE_GUIDE.md) | 文档/开发约定 | 本文件：目录/分层解释、实际调用链、阅读路径及完整逐文件索引。 |
| [docs/CODING_PRINCIPLES.md](../docs/CODING_PRINCIPLES.md) | 文档/开发约定 | 代码命名、扁平流程、外部适配、校验、日志和交付检查约定。 |
| [docs/DATABASE_SCHEMA.md](../docs/DATABASE_SCHEMA.md) | 文档/开发约定 | 数据库相关目录、三张表的字段/约束/关系、JSONB 状态、读写代码和迁移历史。 |
| [docs/PROJECT.md](../docs/PROJECT.md) | 文档/开发约定 | 产品愿景、当前 MVP、用户决定原则、规划方向及当前非目标。 |
| [docs/USER_FLOW_CURRENT.md](../docs/USER_FLOW_CURRENT.md) | 文档/开发约定 | 向用户讲解的详细业务材料：入口、模型 JSON、每个操作的 API/代码、状态变化、错误、并发与兼容。 |
| [docs/TODO.md](../docs/TODO.md) | 文档/开发约定 | 待办清单（T1–T7）：天地图 429 重试、输入联想 infocode、建议词过滤、上下文搜索回退、别名归一、© 天地图署名、向人工客服索取商用与审图号书面答复；以及明确不做的三件事（照片、全国景点索引、LLM 排序）。 |
| [docs/agent-planner/README.md](../docs/agent-planner/README.md) | 文档/规划 | Planner Agent 的规划工作区（中文，边讨论边改）：背景与用户思考、业务、记忆、页面、运行、工具、数据草案、远期方向和决策记录，每节标明已定/草案/待讨论；不是已实现行为。 |
| [docs/agent-planner/implementation-plan.md](../docs/agent-planner/implementation-plan.md) | 文档/交接 | Generate Plan 的最新流程、数据交接、分阶段待办和首轮验收。 |
| [docs/agent-planner/page-mockup-brief.md](../docs/agent-planner/page-mockup-brief.md) | 文档/规划 | 计划页效果图说明：过渡页、只有目的地时、信息填全后三张图的内容、共同视觉风格和可直接复制的英文生成提示；讨论稿，不是实现要求。 |
| [docs/agent-planner/agent-lessons.md](../docs/agent-planner/agent-lessons.md) | 文档/规划 | 规划时讲过的 Agent 概念笔记：Agent 循环、生成者与验证者、MCP、记忆，用 Meri 的试验举例。 |
| [docs/product/adaptive-workspace.md](../docs/product/adaptive-workspace.md) | 文档/开发约定 | 精简的未来界面方向：按用户决定调整信息重点，保留状态和受控组件边界，不预选框架。 |
| [docs/product/companion-bear.md](../docs/product/companion-bear.md) | 文档/开发约定 | 小熊设计说明：营地小桌精灵图方案、动作清单和“反应优先、自由时间随机”的行为逻辑；素材与行为已实现，文中列出仍待定的部分。 |
| [docs/product/workspace-red-panda.md](../docs/product/workspace-red-panda.md) | 文档/交接 | 工作区小熊猫 V1 的素材路径、试样记录、实现和验收点。 |
| [docs/product/visual-media-direction.md](../docs/product/visual-media-direction.md) | 文档/设计探索 | 保存页面评审与图像、视频、Web3D、分享产物讨论，区分已认可方向、待讨论细节和灵感；记录高德照片的当前展示位置，未在本次实施功能。 |

### 6.3 App Router 页面与 HTTP 接口

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/app/api/health/route.ts](../src/app/api/health/route.ts) | HTTP 接口层 | GET /api/health 返回 ok 并记录请求日志，不检查数据库或提供方健康。 |
| [src/app/api/journeys/route.ts](../src/app/api/journeys/route.ts) | HTTP 接口层 | POST /api/journeys 获取/创建访客身份，校验草稿和原话，创建 Journey 并协调 opening。 |
| [src/app/api/locations/suggestions/route.test.ts](../src/app/api/locations/suggestions/route.test.ts) | 测试（对应模块边界） | 验证建议 API 的正常输出、空/过长 query、提供方失败及不暴露请求密钥。 |
| [src/app/api/locations/suggestions/route.ts](../src/app/api/locations/suggestions/route.ts) | HTTP 接口层 | GET /api/locations/suggestions 校验 query，返回规范化输入建议及提供方错误。 |
| [src/app/api/trip-drafts/route.ts](../src/app/api/trip-drafts/route.ts) | HTTP 接口层 | POST /api/trip-drafts 校验原话，带上访客语言调用模型草稿提取（旅程名用该语言），返回草稿或模型错误；不创建 Journey。 |
| [src/app/api/trip-workspace/messages/route.ts](../src/app/api/trip-workspace/messages/route.ts) | HTTP 接口层 | POST 聊天的实际编排：归属/历史、模型解释、普通字段保存、地点 edit（精确地点直接写入）、推荐范围判断与 pending 标记、保存真实消息及错误映射。；第 2 步：Kimi 被站点上限拒绝时回 503 和 `code`（`daily_quota` / `paid_calls_paused`） |
| [src/app/api/trips/[id]/conversation/initialize/route.ts](../src/app/api/trips/%5Bid%5D/conversation/initialize/route.ts) | HTTP 接口层 | POST opening 重试：检查访客和 Journey，返回保存的开场或按访客语言初始化合资格开场。 |
| [src/app/api/trips/[id]/destination-recommendation-selection/route.ts](../src/app/api/trips/%5Bid%5D/destination-recommendation-selection/route.ts) | HTTP 接口层 | POST 多选确认：取持久化 offer、验证选择和过期、复核高德、合并/替换、保存确认，处理安全重试和半成功。 |
| [src/app/api/trips/[id]/destination-recommendations/route.ts](../src/app/api/trips/%5Bid%5D/destination-recommendations/route.ts) | HTTP 接口层 | POST 推荐卡片：只接受 `{messageId}`，从保存的对话还原 pending 请求，仅为仍是最新消息的 pending 运行推荐工作流，以派生 ID 保存卡片；已存在则直接返回，过期 409，失败 502。 |
| [src/app/api/trips/[id]/destination-recommendation-photos/route.ts](../src/app/api/trips/%5Bid%5D/destination-recommendation-photos/route.ts) | HTTP 接口层 | POST 推荐卡照片：只接受 `{messageId}`，owner 检查，为该推荐卡消息里还没查过照片的卡逐张查图（本地没有时经 createRemotePhotoFinder 查 Pixabay），每查到一张以 NDJSON 推一行，全部查完写回消息再结束；Pixabay 这次查不了的卡不推、保存时仍为未查，并记 `recommendation.photos.deferred`；浏览器离开也查完并保存；非推荐卡 404。 |
| [src/app/media/place-photos/[file]/route.ts](../src/app/media/place-photos/%5Bfile%5D/route.ts) | HTTP 接口层 | GET 运行时下载的照片：只接受 `pixabay-<数字>.<jpg|png|webp>` 且来源记录已写完的文件，从 `MERI_MEDIA_DIR` 读出，带 Content-Type、nosniff 和一年 immutable 缓存；其他一律 404。生产模式下新下载的文件不重启即可访问。 |
| [src/app/api/trips/[id]/destination-photos/route.ts](../src/app/api/trips/%5Bid%5D/destination-photos/route.ts) | HTTP 接口层 | GET 已选地点照片：owner 检查，按当前目的地和对话里卡片展示过的照片返回每个地点一张，private/no-store，不写入任何数据。 |
| [src/app/api/trips/[id]/destinations/route.ts](../src/app/api/trips/%5Bid%5D/destinations/route.ts) | HTTP 接口层 | GET 手动搜索、POST 按 query/id 或建议完整名称/地区重查并添加、DELETE 完整元组/旧记录；搜索词是几个整省的合称（江浙沪）时由模型的地点解读（兜底表）直接给出这几个省，不查地图，POST 用同一份结果核对；归属检查、唯一目标核验及目的地并发控制。 |
| [src/app/api/trips/[id]/planning-handoff/route.ts](../src/app/api/trips/%5Bid%5D/planning-handoff/route.ts) | HTTP 接口层 | POST 校验访客归属与准备度，返回保存的 TripState、偏好、语言、时区和参考日期。 |
| [src/app/api/trips/[id]/preferences/route.ts](../src/app/api/trips/%5Bid%5D/preferences/route.ts) | HTTP 接口层 | GET 列出、POST 添加旅程偏好。 |
| [src/app/api/trips/[id]/preferences/[preferenceId]/route.ts](../src/app/api/trips/%5Bid%5D/preferences/%5BpreferenceId%5D/route.ts) | HTTP 接口层 | DELETE 把一条偏好标为 removed。 |
| [src/app/api/trips/[id]/preferences/dependencies.ts](../src/app/api/trips/%5Bid%5D/preferences/dependencies.ts) | 装配 | 偏好接口用到的旅程服务、repository 和标签模型。 |
| [src/app/api/trips/[id]/plan-runs/route.ts](../src/app/api/trips/%5Bid%5D/plan-runs/route.ts) | HTTP 接口层 | POST 接收交接快照，交给 plan-run-handler：返回已保存的计划、正在跑的运行，或在后台开始新运行（202）。 |
| [src/app/api/trips/[id]/plan-runs/[runId]/events/route.ts](../src/app/api/trips/%5Bid%5D/plan-runs/%5BrunId%5D/events/route.ts) | HTTP 接口层 | GET 以 Server-Sent Events 推送一次运行的进度，按 Last-Event-ID（或回答后新连接的 `?after=`）补发漏掉的事件。 |
| [src/app/api/trips/[id]/plan-runs/[runId]/answer/route.ts](../src/app/api/trips/%5Bid%5D/plan-runs/%5BrunId%5D/answer/route.ts) | HTTP 接口层 | POST 回答运行正在等的问题（选项或「你来定」），交给 plan-run-handler，成功后运行在后台恢复（202）。 |
| [src/app/api/trips/[id]/plan/route.ts](../src/app/api/trips/%5Bid%5D/plan/route.ts) | HTTP 接口层 | GET 返回旅程最新的计划版本（是否过期）和最近一次运行。 |
| [src/app/api/trips/[id]/plan/pdf/route.ts](../src/app/api/trips/%5Bid%5D/plan/pdf/route.ts) | HTTP 接口层 | POST 读取访客 cookie，把 PDF 请求交给进程内的导出服务。 |
| [src/app/api/trips/[id]/plan/getting-there/route.ts](../src/app/api/trips/%5Bid%5D/plan/getting-there/route.ts) | HTTP 接口层 | 1.2107：POST 计划页补填出发地（和交通方式），装配旅程服务、运行 repository 和天地图交通依赖，交给 getting-there。；1.2115 起也接受只补交通方式 |
| [src/app/api/trips/[id]/plan/leg-mode/route.ts](../src/app/api/trips/%5Bid%5D/plan/leg-mode/route.ts) | 入口/HTTP | 1.2115：`POST`，把启程或回程在已经查到的火车和航班之间切换，只改这份计划；不调用模型、不重新查。 |
| [src/app/api/trips/[id]/plan/weather/route.ts](../src/app/api/trips/%5Bid%5D/plan/weather/route.ts) | 入口/HTTP | 2026-11-22：`POST`「重新查天气」：给最新一版计划重新查天气、配穿搭，就地写回；不算一次规划，调一次 Kimi，受每 IP 的 Kimi 限额约束。 |
| [src/app/api/trips/[id]/planning-readiness/route.ts](../src/app/api/trips/%5Bid%5D/planning-readiness/route.ts) | HTTP 接口层 | GET 读取新鲜 TripState，返回 missing/unverified/selected 准备度；不生成计划。 |
| [src/app/api/trips/[id]/route.ts](../src/app/api/trips/%5Bid%5D/route.ts) | HTTP 接口层 | DELETE /api/trips/[id] 只删除当前访客拥有的 Trip，数据库级联清理状态和消息。 |
| [src/app/api/trips/[id]/state/route.ts](../src/app/api/trips/%5Bid%5D/state/route.ts) | HTTP 接口层 | GET 状态/PATCH 领域校验后的 patch；调用 JourneyService，不自行做高德核验，冲突错误当前未单独映射 409。 |
| [src/app/intro/page.tsx](../src/app/intro/page.tsx) | 页面/框架入口 | /intro 服务端入口，按访客语言生成标题/描述，用本地图集的三座城市代表图渲染 IntroPage，不调用业务或远程接口。 |
| [src/app/plan-preview/page.tsx](../src/app/plan-preview/page.tsx) | 页面/框架入口 | /plan-preview：计划页的设计预览（1.1000），按访客语言生成标题，渲染 PlanPreview；示例数据，不读数据库、不调用任何远程接口，不对搜索引擎开放，也没有从旅程链接进来。 |
| [src/app/globals.css](../src/app/globals.css) | 页面/框架入口 | 全站基础样式与通用视觉变量。 |
| [src/app/layout.tsx](../src/app/layout.tsx) | 页面/框架入口 | 根布局、字体、全局样式及站点 metadata/图标；按访客语言设置 `<html lang>`、标题/描述，包上 LocaleProvider。 |
| [src/app/manifest.ts](../src/app/manifest.ts) | 页面/框架入口 | PWA Web App Manifest，声明名称、启动地址、显示方式和图标；不提供离线缓存。 |
| [src/app/page.tsx](../src/app/page.tsx) | 页面/框架入口 | 首页 / 的服务端页面入口，渲染 MeriAppShell。 |
| [src/app/photo-credits/page.tsx](../src/app/photo-credits/page.tsx) | 页面/框架入口 | 只列介绍页使用的三张本地示例照片及署名，语言跟随现有 cookie，署名复用 PhotoSourceCredit 外链确认，返回链接指向 /intro。 |
| [src/app/photo-credits/photo-credits.module.css](../src/app/photo-credits/photo-credits.module.css) | 页面/框架入口 | 介绍页示例照片署名页的排版、可聚焦链接及窄屏单列样式。 |
| [src/app/trips/[id]/error.tsx](../src/app/trips/%5Bid%5D/error.tsx) | 页面/框架入口 | Workspace 页面错误边界，按访客语言提供失败提示和重试入口。 |
| [src/app/trips/[id]/plan/page.tsx](../src/app/trips/%5Bid%5D/plan/page.tsx) | 页面/框架入口 | 真实计划页，服务端先核对旅程归属，再挂载交接页面。；2026-11-21：把这趟旅程最近一次运行的交接快照传给页面，没有标签页快照时也能打开计划 |
| [src/app/trips/[id]/plan/print/page.tsx](../src/app/trips/%5Bid%5D/plan/print/page.tsx) | 页面/框架入口 | PDF 打印页，核对旅程归属，从最新完整的计划版本渲染只读手册。 |
| [src/app/api/trips/[id]/plan/dates/route.ts](../src/app/api/trips/%5Bid%5D/plan/dates/route.ts) | 接口入口 | 2026-11-21 `POST` 补填日期，按 MERI_TIMEZONE 算今天 |
| [src/app/trips/[id]/page.tsx](../src/app/trips/%5Bid%5D/page.tsx) | 页面/框架入口 | Workspace 服务端加载入口，检查归属、读取状态/消息，区分 404 与缺失状态；最多等 1.5 秒带上已选地点照片；页面标题与缺失状态提示按访客语言。；2026-11-21：旅程有过 Generate plan 运行就跳到计划页（旅程锁） |
| [src/app/trips/journey-delete-action.tsx](../src/app/trips/journey-delete-action.tsx) | 页面/框架入口 | 列表页客户端删除控件，调用 owner-scoped DELETE 并更新页面，文字按访客语言。 |
| [src/app/trips/new/page.tsx](../src/app/trips/new/page.tsx) | 页面/框架入口 | 旧 /trips/new 入口重定向至首页，统一新建入口。 |
| [src/app/trips/page.tsx](../src/app/trips/page.tsx) | 页面/框架入口 | /trips 服务端列表，按访客读取 JourneySummary，按访客语言呈现旅程卡、状态和空状态及页面标题。 |
| [src/app/trips/trips.module.css](../src/app/trips/trips.module.css) | 页面/框架入口 | Journey 列表、卡片、背景和响应式布局样式。 |

### 6.4 首页表现层

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/components/meri-shell/home-entrance.tsx](../src/components/meri-shell/home-entrance.tsx) | 表现层 | Motion 首页分区入场动画，支持减少动态效果偏好；不是背景水彩显露动画。 |
| [src/components/meri-shell/meri-app-shell.module.css](../src/components/meri-shell/meri-app-shell.module.css) | 表现层 | 首页背景、品牌、输入区、角色、布局及响应式样式。 |
| [src/components/meri-shell/meri-app-shell.tsx](../src/components/meri-shell/meri-app-shell.tsx) | 表现层 | 首页服务端外壳，读取最近旅程、它们的封面照片（最多等 1.5 秒）和访客语言，组合「认识 Meri」按钮（深蓝胶囊加发光小太阳，进入 /intro 的唯一入口）、Profile、语言切换、品牌、标题（英文像素字体，中文用系统字体的普通 h1）、输入和 HomeEntrance。 |
| [src/components/meri-shell/new-trip-composer-model.test.ts](../src/components/meri-shell/new-trip-composer-model.test.ts) | 测试（对应模块边界） | 验证空输入、提取/创建失败、保留输入、真实 Trip ID 导航及重试不重复创建。 |
| [src/components/meri-shell/new-trip-composer-model.ts](../src/components/meri-shell/new-trip-composer-model.ts) | 表现层 | 首页 reducer 与请求模型：提取草稿、创建 Journey、处理 opening_failed 和导航。 |
| [src/components/meri-shell/new-trip-composer.tsx](../src/components/meri-shell/new-trip-composer.tsx) | 表现层 | 首页客户端业务容器，组合 ChatComposer 展示组件，绑定阶段、错误、创建导航和 opening 重试操作。 |
| [src/components/meri-shell/recent-journey-actions.tsx](../src/components/meri-shell/recent-journey-actions.tsx) | 表现层 | 首页单张卡片的操作菜单，触发删除并隔离卡片导航。 |
| [src/components/meri-shell/recent-journey-deletion.test.ts](../src/components/meri-shell/recent-journey-deletion.test.ts) | 测试（对应模块边界） | 验证 owner-scoped DELETE、失败不报成功及并发重复删除的控制。 |
| [src/components/meri-shell/recent-journey-deletion.ts](../src/components/meri-shell/recent-journey-deletion.ts) | 表现层 | 首页删除请求及请求去重，失败时仍允许重试。 |
| [src/components/meri-shell/recent-journeys-markup.test.tsx](../src/components/meri-shell/recent-journeys-markup.test.tsx) | 测试（对应模块边界） | 验证旅程导航和操作控件为同级元素，避免交互控件嵌套造成误导航；有封面的卡显示照片，没有的只留插画。 |
| [src/components/meri-shell/recent-journeys-model.test.ts](../src/components/meri-shell/recent-journeys-model.test.ts) | 测试（对应模块边界） | 验证空/单/多旅程、显示数量、首尾循环切换与交互目标的导航规则。 |
| [src/components/meri-shell/recent-journeys-model.ts](../src/components/meri-shell/recent-journeys-model.ts) | 表现层 | 纯前端规则：最近列表、可见数量、首尾循环的下一索引及点击导航边界。 |
| [src/components/meri-shell/recent-journeys.module.css](../src/components/meri-shell/recent-journeys.module.css) | 表现层 | 最近旅程卡片、轮播箭头及操作样式；局部圆角与透明遮罩柔化两侧卡片及视口切口，中央卡片保持清晰。 |
| [src/components/meri-shell/recent-journeys.tsx](../src/components/meri-shell/recent-journeys.tsx) | 表现层 | 最近旅程 React 组件，适配 Aceternity Carousel 的居中平移轨道、透视缩放及 Motion 悬停视差；支持循环切换、手势、键盘、导航和删除后的列表更新；有封面照片的卡在插画上叠放该照片。 |
| [src/components/i18n/messages.ts](../src/components/i18n/messages.ts) | 表现层 | 界面文字中英字典（介绍页与示例照片署名、首页、最近旅程、旅程页面各区域、我的旅程列表），英文定结构、中文类型上必须对应，带参数的句子与日期格式为函数；`photoCredits` 提供照片来源确认弹窗、来源按钮和缩小副本说明。；第 2 步加聊天的「额度用完」「演示暂停」两句 |
| [src/components/i18n/locale-context.tsx](../src/components/i18n/locale-context.tsx) | 表现层 | LocaleProvider 与 useLocale/useMessages；Provider 之外默认英文（仅测试中出现）。 |

### 6.4a 介绍页表现层

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/components/intro/intro-page.module.css](../src/components/intro/intro-page.module.css) | 表现层 | 介绍页营地山景、品牌字标、首屏入场、教程、功能和示例照片布局；适配窄屏与减少动态效果，不使用小熊。 |
| [src/components/intro/intro-page.test.tsx](../src/components/intro/intro-page.test.tsx) | 测试（对应模块边界） | 验证介绍页当前能力与规划能力的标记、教程控件、开始旅程表单导航及本地示例照片署名；并扫描源码确认介绍页只能经首页「认识 Meri」等点击链接进入，没有任何自动跳转。 |
| [src/components/intro/intro-page.tsx](../src/components/intro/intro-page.tsx) | 表现层 | 介绍页客户端界面：教程定时轮播/手动选择/暂停、当前与 Coming soon 能力说明、示例照片与署名、语言切换；进入和返回首页时安全记下已访。 |
| [src/components/intro/intro-photos.ts](../src/components/intro/intro-photos.ts) | 表现层 | 介绍页与其署名页共用的服务端本地照片读取：按 scenic 明确取大理白族自治州、丽江市和拉萨市代表图，缺图跳过，不查远程。 |

### 6.5 Workspace 表现层

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/components/companion/bear-behavior.test.ts](../src/components/companion/bear-behavior.test.ts) | 测试（对应模块边界） | 用固定随机数模拟数百次计划：验证不瞬移、同一活动不连续三次、饭后 60 秒冷却、坐着偏好、反应优先及每次旅程变化只欢呼一次，并校验帧清单。 |
| [src/components/companion/bear-behavior.ts](../src/components/companion/bear-behavior.ts) | 表现层 | 小熊行为纯规则：反应（出错/思考/可生成）优先，自由时间按权重随机选看地图/站着/吃饭团/放空，并补上坐下、放下地图等过渡步骤。 |
| [src/components/companion/bear-sprite-sheet.ts](../src/components/companion/bear-sprite-sheet.ts) | 表现层 | 读取并用 Zod 校验生成的 bear-sprites.json，导出帧尺寸、每个动画的行号/帧数/时长和精灵图地址。 |
| [src/components/companion/companion-bear.tsx](../src/components/companion/companion-bear.tsx) | 表现层 | 精灵图播放器：按计划逐帧播放，计划结束或反应变化时向行为规则要下一步（过渡中不打断），标签页隐藏时暂停，减少动态效果时只显示一帧。 |
| [src/components/companion/companion-status-model.test.ts](../src/components/companion/companion-status-model.test.ts) | 测试（对应模块边界） | 验证小熊一句话的优先级（出错 > 思考 > 可生成 > 缺目的地）、可选缺项列举和旧目的地提示。 |
| [src/components/companion/companion-status-model.ts](../src/components/companion/companion-status-model.ts) | 表现层 | 小熊一句话的纯规则：由 TripState 与聊天活动决定情绪和文案（文案取自传入的字典），不调用模型。 |
| [src/components/companion/companion.module.css](../src/components/companion/companion.module.css) | 表现层 | 小熊区域在旅程列底部的固定位置、对话气泡和像素化精灵图样式。 |
| [src/components/companion/meri-world.tsx](../src/components/companion/meri-world.tsx) | 表现层 | 旅程列底部的小熊猫和独立状态气泡，气泡文案来自 companionStatus。 |
| [src/components/companion/workspace-red-panda.tsx](../src/components/companion/workspace-red-panda.tsx) | 表现层 | 工作区透明视频动作队列、海报衔接、离屏暂停与静态降级。 |
| [src/components/trip-workspace/conversation-panel.tsx](../src/components/trip-workspace/conversation-panel.tsx) | 表现层 | 聊天主组件：useChat、已保存消息、候选卡、卡片关闭/只读、确认及消息逐字显示；最后一条为 pending 时请求推荐卡片并显示加载/重试；推荐卡还有未查照片时逐条消息请求照片流，收到一张补一张；向外上报 idle/thinking/error 活动供小熊使用。；第 2 步：站点上限时显示额度用完或演示暂停，不显示刷新 |
| [src/components/trip-workspace/conversation-reveal.test.ts](../src/components/trip-workspace/conversation-reveal.test.ts) | 测试（对应模块边界） | 验证只对已提交文本按字符步进显示，不越界或改写正文。 |
| [src/components/trip-workspace/conversation-reveal.ts](../src/components/trip-workspace/conversation-reveal.ts) | 表现层 | 已提交助手正文的客户端可见字符数/显示节奏纯函数；不是服务端 token 流。 |
| [src/components/trip-workspace/destination-choices-card.test.tsx](../src/components/trip-workspace/destination-choices-card.test.tsx) | 测试（对应模块边界） | 验证同市新 spot 可添加、replace 可选已有市、重复 POI 归并及历史/已确认卡禁用。 |
| [src/components/trip-workspace/destination-choices-card.tsx](../src/components/trip-workspace/destination-choices-card.tsx) | 表现层 | 当前聊天多选卡：每省一行 Embla 横滑、照片在上的地点卡（查照片或下载中显示骨架块、照片淡入，失败或没有照片显示兜底），同偏好归并、统一提交，处理已在行程（勾选锁定）/只读/pending/失败状态，拖动不误勾选；`creditsHref` 为图集和运行时照片提供来源解析地址，署名按钮由 PhotoSourceCredit 先打开确认弹窗，再访问外部作者／原图页；Commons 保留作者、许可与缩小副本说明，提供方自己的照片没有链接。 |
| [src/components/trip-workspace/photo-source-dialog.tsx](../src/components/trip-workspace/photo-source-dialog.tsx) | 表现层 | 照片来源确认弹窗：请求同域来源 JSON，展示说明、作者、平台及完整目标网址，确认后才在新标签页访问；加载／失败／重试、取消／关闭／Escape／遮罩关闭及焦点恢复；portal 放在地点卡 label 外，署名点击不触发选卡。 |
| [src/components/trip-workspace/photo-source-dialog.module.css](../src/components/trip-workspace/photo-source-dialog.module.css) | 样式 | 照片来源弹窗、遮罩、网址预览和按钮样式，适配小屏幕。 |
| [src/components/trip-workspace/photo-source-dialog.test.tsx](../src/components/trip-workspace/photo-source-dialog.test.tsx) | 测试（对应模块边界） | 验证外部目标白名单、同域 JSON 请求不跟随跳转并带取消信号／no-store、失败／畸形／危险响应拒绝，以及中英文初始署名按钮、无外链和 Commons 缩小副本说明。 |
| [src/components/trip-workspace/destination-editor.tsx](../src/components/trip-workspace/destination-editor.tsx) | 表现层 | 右侧目的地行：“＋ 添加”展开搜索；每省一块，每个城市一行、其景点标签排在同一行右侧，均可删除，无城市的省显示“全省”；单字建议和完整搜索结果均可一键添加，建议按完整名称/地区提交核验；精确删除及旧记录清除，处理 busy 和错误。 |
| [src/components/trip-workspace/destination-recommendation-model.test.ts](../src/components/trip-workspace/destination-recommendation-model.test.ts) | 测试（对应模块边界） | 验证推荐卡选择资格、省分组、统一提交请求及旧 Picker 渲染兼容。 |
| [src/components/trip-workspace/destination-recommendation-model.ts](../src/components/trip-workspace/destination-recommendation-model.ts) | 表现层 | 提交推荐选卡、请求 pending 回复的推荐卡片、读取推荐卡照片的 NDJSON 流（跨块拼行、坏行跳过、坏照片当无图）、按省归组及选择资格等前端辅助规则。 |
| [src/components/trip-workspace/destination-photos-model.ts](../src/components/trip-workspace/destination-photos-model.ts) | 表现层 | 请求已选地点照片并丢弃不合法项；封面取第一个地点的照片。 |
| [src/components/trip-workspace/destination-photos-model.test.ts](../src/components/trip-workspace/destination-photos-model.test.ts) | 测试（对应模块边界） | 验证照片请求解析与封面选择。 |
| [src/components/trip-workspace/destination-recommendation-picker.module.css](../src/components/trip-workspace/destination-recommendation-picker.module.css) | 表现层 | 目的地候选/推荐多选列表的分组、checkbox、确认及状态样式。 |
| [src/components/trip-workspace/expedition-brief-panel.tsx](../src/components/trip-workspace/expedition-brief-panel.tsx) | 表现层 | Journey overview 字段面板，按出发地、目的地、何时、交通偏好、旅程名称排列；交通一键点选，名称文本编辑。 |
| [src/components/trip-workspace/field-certainty.tsx](../src/components/trip-workspace/field-certainty.tsx) | 表现层 | 字段把握程度的共享展示：统一 18px 圆形状态（known 实心绿勾、missing 空圈、approximate 琥珀点、ambiguous “!”）、屏幕阅读器文字、把握程度文字（CertaintyLabel）和“大致/待确认”标签，文字取自字典。 |
| [src/components/trip-workspace/generate-plan-action.tsx](../src/components/trip-workspace/generate-plan-action.tsx) | 表现层 | 唯一的 Generate plan，Halo 式旋转渐变边框按钮，位于聊天下方并始终可见；不可用时保持可聚焦并在悬停/聚焦时说明添加目的地的途径（可打开右侧搜索），准备度通过时交接到真实计划页。2026-11-22 起可以规划时外面多一张卡：「可以开始规划了：目的地」，没有出发日期时加一句补日期会有天气和穿搭。 |
| [src/components/trip-workspace/missing-field-chips.tsx](../src/components/trip-workspace/missing-field-chips.tsx) | 表现层 | 2026-11-22：Meri 最新一条纯文字回复下面的「还可以告诉 Meri」按钮（何时出发和玩几天、怎么去），点开就地用右侧同样的日期编辑器或交通选项保存；不改模型的回复，有卡片或卡片在路上时不显示。 |
| [src/components/trip-workspace/missing-fields-model.ts](../src/components/trip-workspace/missing-fields-model.ts) | 表现层模型 | 由代码按 TripState 判断还缺哪几项：出发日期和天数都准确才不算缺，交通偏好没填就算缺。 |
| [src/components/trip-workspace/missing-fields-model.test.ts](../src/components/trip-workspace/missing-fields-model.test.ts) | 测试 | 只缺什么问什么：只有天数或模糊日期仍算缺日期，填齐后不再显示。 |
| [src/components/trip-workspace/journey-globe.tsx](../src/components/trip-workspace/journey-globe.tsx) | 表现层 | 装饰地球：改写自 cult-ui Illustration Globe（MIT）的 SVG 线框半球，节点数随已选地点数变化，无地理含义；减少动态效果时静止；由 journey-orbit 包裹。 |
| [src/components/trip-workspace/journey-orbit.tsx](../src/components/trip-workspace/journey-orbit.tsx) | 表现层 | 照片环：已选地点照片绕地球旋转，前大后小、前后遮挡，悬停暂停、点击转到正前方、减少动态效果时静止。 |
| [src/components/trip-workspace/location-editor-model.test.ts](../src/components/trip-workspace/location-editor-model.test.ts) | 测试（对应模块边界） | 验证 query 长度、完整建议解析及已选地点 patch 身份/坐标。 |
| [src/components/trip-workspace/location-editor-model.ts](../src/components/trip-workspace/location-editor-model.ts) | 表现层 | 输入 query 标准化、建议响应校验和出发地 selection patch 构造。 |
| [src/components/trip-workspace/location-editor.tsx](../src/components/trip-workspace/location-editor.tsx) | 表现层 | 当前用于 origin 的输入建议编辑控件，防抖查询、显式选中并保存普通字段；状态图标/标签来自 field-certainty。 |
| [src/components/trip-workspace/message-timestamp.ts](../src/components/trip-workspace/message-timestamp.ts) | 表现层 | 按本地今天/昨天/更早日期格式化聊天时间标签，文字由传入的字典决定（昨天/Yesterday）。 |
| [src/components/trip-workspace/planning-handoff-model.ts](../src/components/trip-workspace/planning-handoff-model.ts) | 表现层 | 请求并校验交接结果，在当前标签页存取按旅程区分的快照。 |
| [src/components/trip-workspace/planning-readiness-model.test.ts](../src/components/trip-workspace/planning-readiness-model.test.ts) | 测试（对应模块边界） | 验证只读 readiness 请求、响应校验及缺失/旧文本说明文案。 |
| [src/components/trip-workspace/planning-readiness-model.ts](../src/components/trip-workspace/planning-readiness-model.ts) | 表现层 | 准备度请求、响应校验和说明文案（取自传入的字典）。 |
| [src/components/trip-workspace/trip-dates-editor.tsx](../src/components/trip-workspace/trip-dates-editor.tsx) | 表现层 | “何时”行：一行概括日期与时长，点开为 react-day-picker 范围日历（宽屏两月，中/英 locale 随界面语言）和天数步进器；两次点击定起止后保存，支持清除。 |
| [src/components/trip-workspace/trip-dates-model.test.ts](../src/components/trip-workspace/trip-dates-model.test.ts) | 测试（对应模块边界） | 验证“何时”概括文案、近似原话的标记、日历日与存储日互转不偏移时区，以及 patch 只含用户所选值。 |
| [src/components/trip-workspace/trip-dates-model.ts](../src/components/trip-workspace/trip-dates-model.ts) | 表现层 | “何时”纯辅助：按传入字典的概括文案（精确天数按语言显示，其他写法原样）与整体 certainty、日历 Date 与 YYYY-MM-DD 互转、日期 patch 构造。 |
| [src/components/trip-workspace/trip-message-ui-adapter.test.ts](../src/components/trip-workspace/trip-message-ui-adapter.test.ts) | 测试（对应模块边界） | 验证消息顺序、ID/角色/正文不变、时间格式、历史卡适配和去重追加。 |
| [src/components/trip-workspace/trip-message-ui-adapter.ts](../src/components/trip-workspace/trip-message-ui-adapter.ts) | 表现层 | TripMessage → UIMessage，读取时间/presentation（含 pending 推荐标记），将历史卡转换为统一 choices，按 ID 避免重复追加；列出待查照片的推荐卡、把流式到达的照片放到对应卡上。 |
| [src/components/trip-workspace/trip-state-persistence-model.test.ts](../src/components/trip-workspace/trip-state-persistence-model.test.ts) | 测试（对应模块边界） | 验证确定性状态/来源保留、清空字段、目的地拒绝及服务端响应检查。 |
| [src/components/trip-workspace/trip-state-persistence-model.ts](../src/components/trip-workspace/trip-state-persistence-model.ts) | 表现层 | 普通字段直接编辑的 user patch 与 state PATCH 请求/响应校验，前端拒绝直接 destination 编辑。 |
| [src/components/trip-workspace/trip-workspace.module.css](../src/components/trip-workspace/trip-workspace.module.css) | 表现层 | Workspace 主布局、字段行、聊天、角色区及移动端样式。 |
| [src/components/trip-workspace/trip-workspace.tsx](../src/components/trip-workspace/trip-workspace.tsx) | 表现层 | Workspace 客户端容器，协调权威状态、聊天、右侧编辑和界面区域，持有已选地点照片并在目的地变化后重新请求，把“打开目的地搜索”请求从聊天传到右侧，并把聊天活动传给小熊。 |
| [src/components/trip-workspace/workspace-chat-transport.test.ts](../src/components/trip-workspace/workspace-chat-transport.test.ts) | 测试（对应模块边界） | 验证实际 JSON 契约、临时/持久化消息 ID、presentation 和成功后状态同步。 |
| [src/components/trip-workspace/workspace-chat-transport.ts](../src/components/trip-workspace/workspace-chat-transport.ts) | 表现层 | 把完整聊天 JSON 响应适配为 AI SDK ChatTransport 事件，同步已提交 ID 和状态。 |
| [src/components/trip-workspace/workspace-conversation-model.test.ts](../src/components/trip-workspace/workspace-conversation-model.test.ts) | 测试（对应模块边界） | 验证合法/非法响应、浏览器 fetch 接收者及失败提示，不把未确认发送当已保存。 |
| [src/components/trip-workspace/workspace-conversation-model.ts](../src/components/trip-workspace/workspace-conversation-model.ts) | 表现层 | 请求聊天、解析响应及 selection/推荐过期相关错误类型，校验服务端返回状态和消息。；第 2 步：接口回 503 带 `daily_quota` / `paid_calls_paused` 时抛 `WorkspaceLimitError`，聊天显示额度用完或演示暂停，不提示刷新；第 3 步：429 `too_many_requests` 也是 `WorkspaceLimitError` |
| [src/components/trip-workspace/workspace-header.tsx](../src/components/trip-workspace/workspace-header.tsx) | 表现层 | 品牌/返回首页、旅程标题（左侧缩略图为第一个地点的照片，没有时为默认图）、日期/出发地/交通摘要；日期与“何时”同一写法；保存标签为当前 UI 展示。 |
| [src/components/trip-workspace/workspace-presentation.ts](../src/components/trip-workspace/workspace-presentation.ts) | 表现层 | 页头使用的字段和日期（复用 tripDatesSummary，按传入的字典）显示转换。 |
| [src/components/trip-workspace/workspace-title.ts](../src/components/trip-workspace/workspace-title.ts) | 表现层 | 从当前 name 字段派生 Workspace 标题，缺失时显示调用方传入的默认标题。 |
| [src/components/companion/oil-motion-frame-animator.ts](../src/components/companion/oil-motion-frame-animator.ts) | 表现层 | oil-motion 原版帧控制器、片段播放器与 CSS 图集渲染器，保留 MIT；处理阻尼、媒体反向、取消和稳定停帧。 |
| [src/components/companion/red-panda-look-model.ts](../src/components/companion/red-panda-look-model.ts) | 表现层 | 鼠标相对眼部位置到二维 yaw/pitch 网格的纯投影、行列取帧与暂停条件。 |
| [src/components/companion/red-panda-look-model.test.ts](../src/components/companion/red-panda-look-model.test.ts) | 测试 | 覆盖各方向和斜向、连续映射、非方形行距、异常坐标与暂停条件。 |
| [src/components/companion/red-panda-look.module.css](../src/components/companion/red-panda-look.module.css) | 表现层 | 首页小熊猫的输入边缘遮罩、120/96px 尺寸、互斥媒体表面与静态降级。 |
| [src/components/companion/red-panda-look.tsx](../src/components/companion/red-panda-look.tsx) | 表现层 | 首页焦点装饰与持久媒体节点，挂载/清理探头和转头运行时。 |

### 6.5a 计划页表现层（设计预览，1.1000 起）

Generate plan 背后的计划页先用示例数据做出完整页面（设计决定见 [docs/agent-planner/README.md](agent-planner/README.md) 4.7）。字段按以后 Planner 要返回的形状定；Planner 做好后由保存的计划填充。

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/components/trip-plan/pdf-export/export-button.tsx](../src/components/trip-plan/pdf-export/export-button.tsx) | 表现层 | 行程安排标题、导出按钮、禁用原因、版本和过期提示、进度与重试。 |
| [src/components/trip-plan/pdf-export/export-button.module.css](../src/components/trip-plan/pdf-export/export-button.module.css) | 样式 | 响应式标题和按钮、禁用提示、版本标签和进度条。 |
| [src/components/trip-plan/pdf-export/pdf-download.ts](../src/components/trip-plan/pdf-export/pdf-download.ts) | 表现层 | 读取 PDF 导出 NDJSON，解码并下载文件。 |
| [src/components/trip-plan/pdf-export/pdf-download.test.ts](../src/components/trip-plan/pdf-export/pdf-download.test.ts) | 测试 | 验证分块 NDJSON、中文文件名，以及请求与流结束错误。 |
| [src/components/trip-plan/pdf-export/print/handbook.tsx](../src/components/trip-plan/pdf-export/print/handbook.tsx) | 表现层 | A4 手册封面、路线总览、目录、交通、打包清单和来源。 |
| [src/components/trip-plan/pdf-export/print/handbook.module.css](../src/components/trip-plan/pdf-export/print/handbook.module.css) | 样式 | A4 纸张、页码、分页、字号及手册的打印配色。 |
| [src/components/trip-plan/pdf-export/print/handbook-day.tsx](../src/components/trip-plan/pdf-export/print/handbook-day.tsx) | 表现层 | 每日天气、穿搭、分时段景点、营业与预约、路段。 |
| [src/components/trip-plan/pdf-export/print/handbook-city.tsx](../src/components/trip-plan/pdf-export/print/handbook-city.tsx) | 表现层 | 城市住宿、参考价格、特色菜和餐厅核实状态。 |
| [src/components/trip-plan/pdf-export/print/handbook-photos.tsx](../src/components/trip-plan/pdf-export/print/handbook-photos.tsx) | 表现层 | 现有照片的打印尺寸、来源与署名。 |
| [src/components/trip-plan/plan-handoff-page.tsx](../src/components/trip-plan/plan-handoff-page.tsx) | 表现层 | 真实计划页，展示快照里的旅程事实，挂「Meri 记得」和行程区块（回答计划的问题后让「Meri 记得」重新读取），没有交接时提示回旅程；1.2107 起补填出发地后换成服务器给的新交接并存回本标签页。；2026-11-21：左上角改为「回到主页」；没有标签页快照时用服务端的快照 |
| [src/components/trip-plan/plan-handoff-page.module.css](../src/components/trip-plan/plan-handoff-page.module.css) | 样式 | 真实计划页的事实、偏好和行程区块布局。 |
| [src/components/trip-plan/plan-draft-section.tsx](../src/components/trip-plan/plan-draft-section.tsx) | 表现层 | 开始或接上计划运行，用 EventSource 跟随进度：活动流、问题卡（回答后从最后一个事件重新连接，并通知刷新「Meri 记得」）、路线条和逐块出现的每日卡片；运行结束后换成保存的版本，显示统计、冲突、按时段分组的每日卡片、当天照片、时间锚点、待核实字段和出处；失败时按错误码说明并可重试；1.2013 起每站显示核实标签（当天开放、部分关闭、需预约、从第 N 天换来）、开放与预约的事实行和「当天关闭」冲突；1.2100 起在每天的卡片上面放天地图地图卡片，选中的天和展开的卡片联动。；1.2115：有出发地、没交通方式时在启程卡下面显示交通方式按钮；火车超过 12 小时又有航班时显示切换按钮；1.2117：每天的卡片标题显示当地天气，展开写预报或「出发前再看预报」，户外景点在天气差或海拔差 300 m 以上时写自己的预报；有天气时末尾写「天气为预报，出发前请再查看」和 Open-Meteo 的署名链接；1.2117 穿衣：地图下面放换装间，日程卡里一行「今日穿搭」跳过去，日程后面放打包清单；1.2117 住宿：每座城最后一天后面放住宿卡，「在地图上看」把酒店标到地图上 |
| [src/components/trip-plan/plan-weather.tsx](../src/components/trip-plan/plan-weather.tsx) | 表现层 | 1.2117：天气徽章、当天预报行、户外景点自己的预报、「天气为预报，出发前请再查看」和 Open-Meteo 署名，中英文；1.2117 导出 `SkyIcon` 给换装间的天数标签用 |
| [src/components/trip-plan/plan-weather-view.ts](../src/components/trip-plan/plan-weather-view.ts) | 表现层纯函数 | 1.2117：一天的城市天气或「太远」、户外景点何时单独显示、是否需要署名 |
| [src/components/trip-plan/plan-weather-view.test.ts](../src/components/trip-plan/plan-weather-view.test.ts) | 测试 | 当天天气、超出预报、户外景点的显示条件、署名。 |
| [src/components/trip-plan/plan-outfit.tsx](../src/components/trip-plan/plan-outfit.tsx) | 表现层 | 1.2117 穿衣：地图下面的「今天穿什么」换装间（一只小熊猫，每天一个标签，跟着展开的那天走；像素小舞台的雨雪风晴；衣服一件件穿上；10 个装备格，点一件显示理由；像素温度计；温差提醒和 Meri 的提示）和日程后面的打包清单（勾选存在本机浏览器） |
| [src/components/trip-plan/plan-outfit.module.css](../src/components/trip-plan/plan-outfit.module.css) | 表现层样式 | 换装间和打包清单：游戏装备界面的像素细节，用计划页的配色；手机上单列；照顾减少动画 |
| [src/components/trip-plan/plan-outfit-view.ts](../src/components/trip-plan/plan-outfit-view.ts) | 表现层纯函数 | 部位和理由的中英文、每个装备格里放什么、温差提醒和提示、日程卡上的一行穿搭、温度计位置 |
| [src/components/trip-plan/plan-outfit-view.test.ts](../src/components/trip-plan/plan-outfit-view.test.ts) | 测试 | 装备格、理由、提示、一行穿搭、温度计、占位像素不出格、Codex 素材清单的格式检查。 |
| [src/components/trip-plan/outfit-art.ts](../src/components/trip-plan/outfit-art.ts) | 表现层素材 | 换装间的画：Codex 的纸娃娃素材清单（`public/companion/outfit/manifest.json`，本体一张静态图 + 每样基础款一张同画布的透明叠层）的格式和读取，读不到就用 32×40 的占位像素小熊猫和衣服 |
| [src/components/trip-plan/plan-stay-card.tsx](../src/components/trip-plan/plan-stay-card.tsx) | 表现层 | 1.2117 住宿：每座城最后一天后面的「住哪里」卡：Meri 推荐（有偏好时）和三档酒店，每家最多 5 张可左右滑动的照片、星级、每晚和整段参考价、距离、地址、复制酒店名、在地图上看、在 RollingGo 查看（不带推广参数的第三方页面）、详情（电话、入住退房、设施）；一行声明：个人作品、不收费不卖广告、第三方链接、不收佣金不代订、参考价、信息和图片来自 RollingGo |
| [src/components/trip-plan/plan-stay-card.module.css](../src/components/trip-plan/plan-stay-card.module.css) | 表现层样式 | 住宿卡：三列酒店，窄屏改单列横排 |
| [src/components/trip-plan/plan-food-card.tsx](../src/components/trip-plan/plan-food-card.tsx) | 表现层 | 1.2117 吃什么：每座城最后一天后面、住宿卡下面的「吃什么」卡：特色菜（介绍和出处）、推荐餐厅（招牌、地址、距离、复制店名、在地图上看、出处）、文章里提到的（地址待查、出处）；一行声明 |
| [src/components/trip-plan/plan-tips-card.tsx](../src/components/trip-plan/plan-tips-card.tsx) | 表现层 | RAG 第 5 步：城市分组头部的「Meri 的提示」卡，先整城提示，再淡一些的「当地节庆」（照原话写时间），卡底说明不是实时信息。 |
| [src/components/trip-plan/plan-tips-card.module.css](../src/components/trip-plan/plan-tips-card.module.css) | 样式 | 提示卡样式，和吃什么卡同一套外观。 |
| [src/components/trip-plan/plan-module-chips.tsx](../src/components/trip-plan/plan-module-chips.tsx) | 表现层 | 2026-11-27 布局：一排小块，每块一行摘要，点开在下面显示它的卡，同一时间只开一块；城市的住、吃、提示用它。 |
| [src/components/trip-plan/plan-module-chips.module.css](../src/components/trip-plan/plan-module-chips.module.css) | 样式 | 小块的样式。 |
| [src/components/trip-plan/plan-food-card.module.css](../src/components/trip-plan/plan-food-card.module.css) | 表现层样式 | 吃什么卡：特色菜网格、餐厅列表，没核实地址的用虚线框 |
| [src/components/trip-plan/plan-dates-picker.tsx](../src/components/trip-plan/plan-dates-picker.tsx) | 表现层 | 2026-11-21 计划页「补填出发日期」：已知天数选一天、否则选一段，写明会重新生成并锁定，成功后交回新交接 |
| [src/components/trip-plan/plan-dates-picker.module.css](../src/components/trip-plan/plan-dates-picker.module.css) | 表现层样式 | 补填日期的按钮、日历（Meri 的绿色）和确认区 |
| [src/components/trip-plan/plan-draft.module.css](../src/components/trip-plan/plan-draft.module.css) | 样式 | 行程草稿的统计胶囊、时段时间轴、锚点、出处展开、提示卡和骨架加载。 |
| [src/components/trip-plan/plan-memories.tsx](../src/components/trip-plan/plan-memories.tsx) | 表现层 | 「Meri 记得」：交接提取的偏好、用户在计划页添加的偏好和回答计划问题得到的偏好（后者算作已用于本次计划），添加面板复用 PreferenceSheet；新偏好不触发重新规划。 |
| [src/components/trip-plan/plan-memories.module.css](../src/components/trip-plan/plan-memories.module.css) | 样式 | 偏好卡片、标签和提示。 |
| [src/components/trip-plan/plan-preferences-model.ts](../src/components/trip-plan/plan-preferences-model.ts) | 表现层模型 | 调用偏好接口读取、添加、删除；常用选项按顺序对应类型。 |
| [src/components/trip-plan/plan-draft-model.ts](../src/components/trip-plan/plan-draft-model.ts) | 表现层模型 | 调用 plan-runs、回答与 plan 接口并映射错误；SSE 地址（可带 after）和事件解析（只认本次运行）；运行错误码到页面说明；按时段分组和列出有出处的事实。；第 2 步加三种上限失败（`daily_runs`、`daily_quota`、`paid_calls_paused`），不给重试；第 3 步加 `guest_runs`、`address_runs` |
| [src/components/trip-plan/plan-progress-view.ts](../src/components/trip-plan/plan-progress-view.ts) | 表现层纯函数 | 把进度事件逐条推成页面状态：十个阶段（1.2106 起含查转场）的状态、计时起点、摘要和当前活动（调研按城市各一行，其他阶段只留最新一行），路线、已到的天、景点卡、照片、等待中的问题、等待时长和已回答的问题、结束状态；重复事件不改变状态；路线已定但未到的天；记下每站的核实结果（spot.checked）；1.2117 加每天的穿衣（`day.outfit`） |
| [src/components/trip-plan/plan-run-activity.tsx](../src/components/trip-plan/plan-run-activity.tsx) | 表现层 | 实时活动流：运行中的阶段转动 ✻、计时，⎿ 显示正在做什么；等待回答时显示「?」和标签、总计时停住；完成的阶段收成 ✓ 一行带数字和用时，调研、定位、路线（含问答）可展开明细；问题卡（选项、「你来定」，1.2018 起还有写自己想法的输入框）；中英文案。；1.2117 加「查 N 处天气」 |
| [src/components/trip-plan/plan-run-activity.module.css](../src/components/trip-plan/plan-run-activity.module.css) | 样式 | 活动流的终端式排版、等宽计时、⎿ 缩进行、等待标签、问题卡和选项按钮、减少动态效果时停止转动和动画、窄屏换行。 |
| [src/components/trip-plan/plan-preview.tsx](../src/components/trip-plan/plan-preview.tsx) | 表现层 | 预览页的编排：右下角预览开关切换三种状态（生成中：按定时的假事件逐步点亮进度、区块从骨架填进内容；只有目的地：第 1 天排好、其余锁住；全部填好）；在页面上点选天数、日期、出发地、交通方式后，只让依赖它的区块"重新规划"一下；顶部事实点"修改"会重新锁住对应区块；修改对话框带小熊猫，提交后显示"修改还没接上"的示例回复。1.1001 起：天气按出发日期分预报 / 往年同期；手动添加偏好后出现"按新偏好重新规划"，点了只重排各天；导出菜单下载日历、打印时所有天展开。 |
| [src/components/trip-plan/plan-view.ts](../src/components/trip-plan/plan-view.ts) | 表现层纯函数 | 计划页的数据形状（日程、景点、路程、核实来源、天气、住宿、交通选项、记忆、运行统计），以及规则：每个区块需要哪些事实、某个事实影响哪些区块、一次运行有哪些步骤（第 1 天先排）、某步完成后哪个区块就绪、时长文字、核实计数、日期推算。 |
| [src/components/trip-plan/plan-view.test.ts](../src/components/trip-plan/plan-view.test.ts) | 测试（对应模块边界） | 验证只有目的地时只有第 1 天可排、改一个事实只重排用到它的区块、运行步骤顺序和跳过锁住的区块、中英文时长、示例数据自洽（每两个景点间一段路）、日期跨月推算。 |
| [src/components/trip-plan/plan-actions.ts](../src/components/trip-plan/plan-actions.ts) | 表现层纯函数 | 1.1001：景点在高德 / Apple 地图 / Google 地图打开的外链（只是链接，不要 key；坐标原样发出，高德用 `coordinate=wgs84` 自己换算；中文界面高德在前、英文 Google 在前；Apple 的参数尚未对照官方页面复核）；某天是预报还是往年同期（16 天）；把计划写成 .ics 日历（每个非住宿景点一个日程，东八区时间、地点坐标、开放时间和提示）。 |
| [src/components/trip-plan/plan-actions.test.ts](../src/components/trip-plan/plan-actions.test.ts) | 测试（对应模块边界） | 验证三种地图链接和中英排序、16 天预报界线、日历的事件数、开始结束时间、坐标和首尾格式。 |
| [src/components/trip-plan/plan-preferences.tsx](../src/components/trip-plan/plan-preferences.tsx) | 表现层 | 1.1001：手动添加偏好的面板，手机上从底部弹出、电脑上是小窗；可输入一句话或点常用标签；保存只加进"Meri 记得"，不自动重排。 |
| [src/components/trip-plan/plan-sample.ts](../src/components/trip-plan/plan-sample.ts) | 示例数据 | 云南 5 天（丽江 → 大理、带父母）的示例计划：景点用真实经纬度和本地图集照片；时间、价格、来源、天气（逐几小时、风、日出、因天气调整的理由）、航班和酒店都是编的（酒店名虚构），来源不带链接。 |
| [src/components/trip-plan/plan-header.tsx](../src/components/trip-plan/plan-header.tsx) | 表现层 | 顶栏（Meri 标志、回到旅程、"示例数据"标记、语言切换）；标题和一句话总览、一眼概览（天数、城市、路上时长、核实数）、事实条（没填的虚线标出，点一下跳到对应区块；填了的可修改）、记忆标签（自动记下的悬停看原话，手动加的标"你添加的"，可删，末尾"＋ 添加"）、导出菜单（添加到日历、打印 / 存为 PDF，长图分享和离线保存标"即将推出"）。 |
| [src/components/trip-plan/plan-sections.tsx](../src/components/trip-plan/plan-sections.tsx) | 表现层 | 生成进度（当前步骤、进度条、步骤列表，完成后收成一行运行统计）、规划中的骨架区块、锁住的区块（天数、出发日期、出发地 + 交通方式，各自写明要什么、就地点选）、怎么去（只展开推荐的一班，其余折叠；自驾时只给说明）、核实情况卡。 |
| [src/components/trip-plan/day-card.tsx](../src/components/trip-plan/day-card.tsx) | 表现层 | 一天的卡片：收起时一行（第几天、日期、城市、标题、天气）；展开时照片、上午/下午天气、时间线（时间、景点、开放时间和核实标记及来源、提示、"我选了 X"的替换候选、两点之间的车程或步行）、可行性一句话、还不知道的事、住哪里和每晚价格；没日期时天气和价格显示锁住的说明；悬停景点会在地图上标亮。1.1001：天气块（预报：上午/下午、逐几小时温度、风、日出日落、因天气这样安排的理由；太远：往年同期加说明），每个景点名旁的导航按钮（选地图 App）。 |
| [src/components/trip-plan/plan-map.tsx](../src/components/trip-plan/plan-map.tsx) | 表现层 | 示意地图（SVG）：湖、山脊、道路、城镇，当天景点按顺序编号并连线（步行虚线），其他天的点淡显；按天/全程切换，镜头平滑移过去；地名统一中文；只用于设计预览页，真实计划页的地图见 plan-tianditu-map.tsx（1.2100）。 |
| [src/components/trip-plan/plan-tianditu-map.tsx](../src/components/trip-plan/plan-tianditu-map.tsx) | 表现层 | 计划页地图。1.2104 起用 Leaflet 画，瓦片来自自己的中转接口 `/api/map-tiles/...`，网页里没有任何 key，浏览器也不直接请求天地图；矢量底图加中文注记（英文注记被天地图防火墙拦过，暂不使用），地图只能在中国范围内拖动，角落写「天地图 · GS(2026)4921号」。1.2105 起每天一种颜色（和那天卡片的天数方块同色），全程视图每天按自己的颜色画；选中那天的景点带编号，开车画白边粗实线、步行画细点线、没路处和一大片区域的段画虚线，其他天灰色小点；地图下方有三种线的图例；没有定位景点的那天用它的颜色显示所在城市（1.2101）。；1.2117 加 `hotel`：选中的酒店画成方形床的标记，地图移过去；1.2117 吃什么：选中的餐厅画成红色方块刀叉标记 |
| [src/app/api/map-tiles/[layer]/[z]/[x]/[y]/route.ts](../src/app/api/map-tiles/[layer]/[z]/[x]/[y]/route.ts) | 接口层 | 1.2104：地图瓦片中转，每个服务器进程一个中转和一个限流器。 |
| [src/capabilities/map/map-tiles-handler.ts](../src/capabilities/map/map-tiles-handler.ts) | 应用层 | 1.2104：只给自己的页面（Sec-Fetch-Site 或 Referer，可被伪造，只挡随手盗用）、只给中国范围内的瓦片、每个 IP 每分钟最多 400 张；失败只说「地图暂时不可用」，不带天地图细节；浏览器可以缓存一天，服务器不存。；第 3 步起用 `client-address` 认 IP |
| [src/capabilities/map/map-tiles-handler.test.ts](../src/capabilities/map/map-tiles-handler.test.ts) | 测试 | 图层、缩放、中国范围、key 只在服务器、拒绝后暂停、限流、来源检查。 |
| [src/domain/map/map-tile.ts](../src/domain/map/map-tile.ts) | 领域层 | 1.2104：中转接受的瓦片：vec、cva 两层，缩放 3–18，瓦片必须碰到中国范围（经度 73–136、纬度 3–54）。 |
| [src/platform/tianditu/tianditu-tiles.ts](../src/platform/tianditu/tianditu-tiles.ts) | 外部集成适配器 | 1.2104：用服务端 key 取天地图瓦片；单独的队列，每 120 毫秒放出一张（一次性并发十几张曾被防火墙拦截）；遇到 418 或拦截页就暂停 5 分钟，期间不再请求。 |
| [src/platform/http/rate-limiter.ts](../src/platform/http/rate-limiter.ts) | 基础设施 | 1.2104：按客户端计数的滑动窗口限流，存在内存里，单进程。；第 3 步起也用于每个 IP 的 Kimi 请求和每位访客的聊天句数 |
| [src/components/trip-plan/plan-leg-text.ts](../src/components/trip-plan/plan-leg-text.ts) | 表现层模型 | 1.2103：每个景点前那一行的文字：步行写步行；开车按用户交通方式写「开车 / 打车 / 车程约」；路线头尾超过 300 米没路、或整段没路时如实写出，并列出常见方式（坐船、索道、步行），不替用户猜；1.2105 起一头离路超过 1 公里时那头是一大片区域（如洱海），只写「洱海是一大片区域，车程要看具体从哪里出发，无法估算」，不写分钟和公里。 |
| [src/components/trip-plan/plan-transfer-text.ts](../src/components/trip-plan/plan-transfer-text.ts) | 表现层模型 | 1.2106：启程、转场、回程卡的文字：类别名（启程 / 转场 / 回程），两端地名（出发地没写时写「出发地」），开车估算「车程约 2 小时 40 分钟 · 186 公里（估算）」（自驾写「开车约」，一小时以上按 10 分钟取整），超过 6 小时加一句可以考虑火车或飞机；没有时间时说明原因（出发地没写、不确定、地图上没找到、没路、还没查到）；1.2108 起每趟火车一行（车次、时间和车站、历时、最便宜座位的票价和余票），以及来源和参考车次的说明；1.2109 起拆成票面要用的几块：日期、时刻和跨天标记、座位、开车的标题和细节、一句说明、查询时间、参考车次提示；1.2110 起中转行程的换乘城市和总历时、两趟车次和等车时间、各自座位、跨站换乘提示；1.2111 起航班的航班号和历时、经停和代码共享、最便宜舱位和剩余座位、另付机建燃油、「也有航班 / 火车参考」的对比、飞常准查询时间。；1.2113：转机航班写「在成都转机 · 共…」、两个航班号和等待时间、「两段分开买 ¥…」，换机场时 `flightChangeWarning` 写明要换机场；1.2114：飞机转火车的标题、两段票价、机场到火车站的提醒 |
| [src/components/trip-plan/plan-transfer-text.test.ts](../src/components/trip-plan/plan-transfer-text.test.ts) | 测试 | 时长格式与取整、自驾和非自驾的措辞、长途提示、各种没有时间的原因。 |
| [src/components/trip-plan/plan-origin-picker.tsx](../src/components/trip-plan/plan-origin-picker.tsx) | 表现层 | 1.2107：启程卡里的出发地填写：和 Workspace 同一个天地图地点建议接口（停止输入 0.25 秒后查，只列带天地图坐标的建议），点选后可「换一个」；交通方式没填时给自驾 / 高铁 / 飞机 / 让 Meri 判断（默认最后一个）；确认后锁定，出错时说明原因。；1.2115：`askOrigin=false` 时只显示交通方式按钮，给有出发地、没交通方式的计划 |
| [src/components/trip-plan/plan-getting-there-model.ts](../src/components/trip-plan/plan-getting-there-model.ts) | 表现层模型 | 1.2107：哪些建议可以点选、发送补填请求并把 409 的原因码映射给页面。；1.2115：出发地可以为空（只发交通方式），`requestLegMode` 切换火车和航班 |
| [src/components/trip-plan/plan-getting-there-model.test.ts](../src/components/trip-plan/plan-getting-there-model.test.ts) | 测试 | 可点选的建议、请求内容、拒绝原因的映射。；1.2115：只发交通方式 |
| [src/components/trip-plan/plan-transfer-card.tsx](../src/components/trip-plan/plan-transfer-card.tsx) | 表现层 | 1.2106 起的交通卡，1.2109 改成车票存根：左边存根写类别（启程 / 转场 / 回程）和日期，虚线打孔；票面左出发右到达，有推荐火车时写大号时刻、车次和历时、城市下面的车站，中间实线带两端停靠点；开车时中间是虚线和「车程约…」；下面是参考车次提示、座位和票价、Meri 的理由、可展开的其他车次小表、开车参考和来源；没有时间的段写原因；转场是更窄的虚线票；出发地选择放在启程票里。；1.2113：转机航班的票面和换机场提示；1.2115 加 `below`：在详情下面放交通方式按钮或切换按钮，详情照常显示；1.2114：飞机转火车画成机票，下面是换乘提醒、票价、理由和其他走法 |
| [src/components/trip-plan/plan-transfer-card.module.css](../src/components/trip-plan/plan-transfer-card.module.css) | 表现层样式 | 1.2109：车票存根的样式（打孔的半圆缺口、票面三栏、火车实线和开车虚线、参考车次的提示条、座位标签、车次小表）；560px 以下存根变成顶部横条。 |
| [src/components/trip-plan/plan-day-colors.ts](../src/components/trip-plan/plan-day-colors.ts) | 表现层模型 | 1.2105：每天的颜色（森林绿、赤陶、湖蓝、赭黄、梅紫、石板灰蓝，第 7 天起循环）和淡色底，地图的线、圆点、天数标签和卡片的天数方块共用；其他天的淡灰色。 |
| [src/components/trip-plan/plan-leg-text.test.ts](../src/components/trip-plan/plan-leg-text.test.ts) | 测试 | 交通方式的措辞、1.2102 旧计划、到不了的尾段、整段没路、一大片区域（1.2105）。 |
| [src/components/trip-plan/plan-tianditu-map-model.ts](../src/components/trip-plan/plan-tianditu-map-model.ts) | 表现层模型 | 从保存的计划取出有坐标的景点（保留它在当天的序号）、按天筛选、中转接口的瓦片地址（1.2104 起，不含 key）、按天着色的编号图标和城市圈的 SVG data URL、三种线型的描边（`lineStrokes`，1.2105），`dayOnMap` 决定某天显示自己的景点、所在城市还是全程；纯函数。 |
| [src/components/trip-plan/plan-tianditu-map-model.test.ts](../src/components/trip-plan/plan-tianditu-map-model.test.ts) | 测试 | 未定位和旧计划的景点不画但保留序号、英文界面用英文注记、编号图标、没有定位景点的天按同城景点放置或显示全程。 |
| [src/components/trip-plan/plan-map-model.ts](../src/components/trip-plan/plan-map-model.ts) | 表现层纯函数 | 丽江—大理一带的平面投影、把一组点放进方框的取景、镜头插值，以及粗略画的湖泊、山脊和道路坐标。 |
| [src/components/trip-plan/plan-map-model.test.ts](../src/components/trip-plan/plan-map-model.test.ts) | 测试（对应模块边界） | 验证北在上东在右、取景后所有点落在留白之内且单个点不会无限放大、镜头插值。 |
| [src/components/trip-plan/trip-plan.module.css](../src/components/trip-plan/trip-plan.module.css) | 样式 | 和 Workspace 同一张纸张卡片和阿尔卑斯背景；桌面两栏（日程 + 固定的地图），手机单栏（进度、地图、日程）；页面自己滚动，地图才能固定；减少动态效果时不做过渡；偏好面板手机上从底部弹出；打印时去掉背景、地图和工具，所有天展开。 |

### 6.6 基础 UI 组件

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/components/ui/chat-composer.tsx](../src/components/ui/chat-composer.tsx) | 表现层 | 受控多行输入、自动增高、滚动示例提示、发送/加载状态及禁用的文档和语音占位按钮；可选 redPanda 仅由首页启用；不调用 API，父组件提供文案与事件。 |
| [src/components/ui/chat-composer.module.css](../src/components/ui/chat-composer.module.css) | 表现层 | 输入框与工具栏样式，移动端和减少动态效果适配。 |
| [src/components/ui/animated-popover.tsx](../src/components/ui/animated-popover.tsx) | 表现层 | Radix Popover + Motion 封装，提供受控开关、浮层入退场及减少动态效果支持。 |
| [src/components/ui/animated-checkbox.module.css](../src/components/ui/animated-checkbox.module.css) | 表现层 | 动画复选框的方框、选中、聚焦、禁用与减少动态效果样式。 |
| [src/components/ui/animated-checkbox.tsx](../src/components/ui/animated-checkbox.tsx) | 表现层 | 保留原生 checkbox 语义的复选框，Motion 绘制对勾；用于两个目的地多选卡。 |
| [src/components/ui/pixel-heading-character.module.css](../src/components/ui/pixel-heading-character.module.css) | 表现层 | 像素标题字符布局、字体和动画相关样式。 |
| [src/components/ui/pixel-heading-character.tsx](../src/components/ui/pixel-heading-character.tsx) | 表现层 | 像素字符标题组件，处理字体/字符动画模式和减少动态效果。 |
| [src/components/ui/language-toggle.module.css](../src/components/ui/language-toggle.module.css) | 表现层 | 语言切换的胶囊样式，尺寸配色与首页 Profile 一致，当前语言高亮。 |
| [src/components/ui/language-toggle.tsx](../src/components/ui/language-toggle.tsx) | 表现层 | 「中 \| EN」切换：每种语言用自己的文字命名，点击写 `meri_locale` cookie 并刷新页面。 |
| [src/components/ui/language-toggle.test.tsx](../src/components/ui/language-toggle.test.tsx) | 测试（对应模块边界） | 验证两种语言的名称、lang 属性和当前语言的按下状态。 |
| [src/components/ui/skeleton.module.css](../src/components/ui/skeleton.module.css) | 表现层 | 骨架块底色与呼吸闪烁动画，减少动态效果时静止。 |
| [src/components/ui/skeleton.tsx](../src/components/ui/skeleton.tsx) | 表现层 | 仿 shadcn/ui Skeleton 的占位块（CSS Modules，无 Tailwind），用于推荐卡照片到达前。 |

### 6.7 领域层

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/domain/location/destination-recommendations.test.ts](../src/domain/location/destination-recommendations.test.ts) | 测试（对应模块边界） | 验证省份拼写、顺序、同名变体去重及最多 12 个地点等结构边界。 |
| [src/domain/location/destination-recommendations.ts](../src/domain/location/destination-recommendations.ts) | 领域层 | Zod 推荐省份/城市/理由校验，检查中国省级范围、控制总量并规范化去重；配图地标的英文名 `landmarkEn`、其他叫法和备选地标不合法时只丢该字段。 |
| [src/domain/location/china-destination-scope.ts](../src/domain/location/china-destination-scope.ts) | 领域层 | 中国目的地省级行政区完整名/简称名单，共用范围校验；不替代城市/景点的提供方身份核验。 |
| [src/domain/location/china-region-nicknames.test.ts](../src/domain/location/china-region-nicknames.test.ts) | 测试（对应模块边界） | 验证 江浙沪/京津冀/川渝/云贵川/东三省/两广/港澳 等展开为对应省份，「一带」「地区」和空格不影响结果，普通地名、单个省、有争议的范围（长三角、东北）和对象键名不算昵称，所有展开省份都在服务范围内。 |
| [src/domain/location/china-region-nicknames.ts](../src/domain/location/china-region-nicknames.ts) | 领域层 | 跨省昵称兜底表（江浙沪 → 江苏省、浙江省、上海市 等），只收各方没有争议的说法；只在模型答不上来时用，模型给了答案时以模型为准。 |
| [src/domain/location/destination-resolution-policy.test.ts](../src/domain/location/destination-resolution-policy.test.ts) | 测试（对应模块边界） | 验证行政/景区后缀、自身市/州前缀、景点旁同名区县让位（行政名之间不让）、兜底前缀匹配（至少 3 字、只在无更严格匹配时）、最后兜底景点（排除设施与景点子项、最多 3 个）、同名歧义、省范围、重复身份及不合理/无效坐标候选；以及同名店铺（类别"其他"、无地点后缀、非行政区）不再按名称匹配，行政区、带后缀名称、景点和无类别候选不受影响。 |
| [src/domain/location/destination-resolution-policy.ts](../src/domain/location/destination-resolution-policy.ts) | 领域层 | 合理名称匹配和候选解析纯规则：提供方标为"其他"、名字不是行政区本身又没有地点后缀的候选（同名店铺）不参与匹配；原话/后缀/自身市区县前缀匹配，同市景点旁的同名区县让位，兜底匹配带其他前缀的名称，最后兜底提供名称含原话的景点（最多 3 个，排除景点的一部分）；返回 resolved/ambiguous/area/unresolved，保留不同 POI 身份。 |
| [src/domain/location/location-suggestion.ts](../src/domain/location/location-suggestion.ts) | 领域层 | 输入建议 LocationSuggestion 类型，包含可能缺失的身份/坐标，与最终目的地确认分开；地图提供方名单（amap、tianditu）和各自的坐标系；本文件不执行校验。 |
| [src/domain/location/location.ts](../src/domain/location/location.ts) | 领域层 | 规范化 LocationCandidate，包含提供方身份、行政归属、地址和坐标（带坐标系 GCJ-02 或 CGCS2000，不互转），以及可选的 kind（是否景点）。 |
| [src/domain/location/place-name.ts](../src/domain/location/place-name.ts) | 领域层 | `isFacilityName(name)`：名字以 大门/北门/入口/出口/游客中心/停车场/观景台/索道/售票处/验票点… 结尾的是设施，不是地点本身。天地图把它们和景区本体归在同一个类别（180400），只能看名字分辨。 |
| [src/domain/location/place-name.test.ts](../src/domain/location/place-name.test.ts) | 测试（对应模块边界） | 验证设施后缀被识别，以及 天安门 / 观复博物馆 / 玉龙雪山国家级风景名胜区 这类名字不被误判。 |
| [src/domain/location/place-image.ts](../src/domain/location/place-image.ts) | 领域层 | 地点照片类型（https 链接、本地图集 `/photos/` 或运行时照片 `/media/place-photos/pixabay-<ID>.<ext>` + 说明文字 + 可选署名 credit）与读取校验，不合法时视为没有照片；照片规则版本 `placePhotoRulesVersion`（存成没图的推荐卡按新版本重查一次）。 |
| [src/domain/locale/locale.ts](../src/domain/locale/locale.ts) | 领域层 | 支持的语言 zh/en、合法性判断及 `<html lang>` 取值。 |
| [src/domain/location/recommendation-identity.test.ts](../src/domain/location/recommendation-identity.test.ts) | 测试（对应模块边界） | 验证等价名称归一化，保留不同山峰/路线/相似地名的独立性。 |
| [src/domain/location/recommendation-identity.ts](../src/domain/location/recommendation-identity.ts) | 领域层 | 推荐名和地区名标准化，处理空白、全角及受支持后缀，不做地点网络核验。 |
| [src/domain/trip-draft/trip-draft.test.ts](../src/domain/trip-draft/trip-draft.test.ts) | 测试（对应模块边界） | 验证近似时间原话、不完整草稿、出发地/交通及目的地 edit 的合法性。 |
| [src/domain/trip-draft/trip-draft.ts](../src/domain/trip-draft/trip-draft.ts) | 领域层 | TripDraft 和交通枚举，校验首页提取的六类字段及 destinationEdit；模型输出用 salvageTripDraft 逐项挽救（坏字段按 missing），请求体用 validateTripDraftDomain 严格校验。 |
| [src/domain/trip-message/destination-choice-identity.ts](../src/domain/trip-message/destination-choice-identity.ts) | 领域层 | 构造省/市/spot 偏好 ID，把重复 POI 展示合并，同时保留历史提交原 ID。 |
| [src/domain/trip-message/destination-choice-message.test.ts](../src/domain/trip-message/destination-choice-message.test.ts) | 测试（对应模块边界） | 验证 city/spot/replace 基底的新卡持久化，以及旧候选读取与非法新卡拒绝。 |
| [src/domain/trip-message/trip-message.test.ts](../src/domain/trip-message/trip-message.test.ts) | 测试（对应模块边界） | 验证消息角色/正文/时间、presentation 形状和历史推荐兼容。 |
| [src/domain/trip-message/trip-message.ts](../src/domain/trip-message/trip-message.ts) | 领域层 | 用户/助手消息与四类受限 presentation（含推荐 pending 标记及 RecommendationScope，卡片可带照片；推荐卡带地标、地标的英文名、其他叫法、备选地标和照片规则版本，照片分未查/有图/null 三态，null 且规则版本旧的带地标卡算待查）校验，最多 12 个 choices，历史格式保留读取。 |
| [src/domain/trip-state/destination-areas-v2.test.ts](../src/domain/trip-state/destination-areas-v2.test.ts) | 测试（对应模块边界） | 验证同市多个 spots、删除市级联但保留省、单删 spot 及新版层级约束。 |
| [src/domain/trip-state/destination-areas.test.ts](../src/domain/trip-state/destination-areas.test.ts) | 测试（对应模块边界） | 验证省市/spot 文案、保留空省、多项添加/删除和派生展示规则。 |
| [src/domain/trip-state/destination-areas.ts](../src/domain/trip-state/destination-areas.ts) | 领域层 | 省市/spot 类型和纯函数：格式化（直辖市的景点紧跟市名：北京市（故宫））、标题（超过两省缩写为“…等N省”）、计数、包含、去重添加、新增部分（destinationAdditions）、级联删除、唯一匹配及结构读取。 |
| [src/domain/trip-state/destination-edit.ts](../src/domain/trip-state/destination-edit.ts) | 领域层 | none/add/set/remove 契约、严格模型 JSON Schema、表达数量/长度/去重校验。 |
| [src/domain/trip-state/destination-legacy-read.test.ts](../src/domain/trip-state/destination-legacy-read.test.ts) | 测试（对应模块边界） | 验证旧自由文本保留为 legacyText，不把未核验名称假装成市。 |
| [src/domain/plan/plan-handoff.ts](../src/domain/plan/plan-handoff.ts) | 领域层 | 交接快照与响应契约，校验 TripState、参考日期、语言和当前有效的偏好。 |
| [src/domain/plan/trip-preference.ts](../src/domain/plan/trip-preference.ts) | 领域层 | 旅程偏好：标签、类型、原话、来源、状态；类型、来源与上限常量；原话比较；体力和同行人类偏好把每天上限降到 3。1.2017：节奏偏好的隐藏方向 `pace`（packed/relaxed，只在 kind 为 pace 时有值，`paceFor` 去掉其他类型的方向），relaxed 也把上限降到 3，`wantsPackedPace`、`wantsRelaxedPace`（1.2018）供路线判断；旧数据缺这个字段读作 null。 |
| [src/domain/plan/spot-card.ts](../src/domain/plan/spot-card.ts) | 领域层 | 景点卡、原文证据、天地图定位结果和单城调研结果的类型，未知字段可以为空；1.2013 起景点卡可带第二轮查到的 availability；1.2116 `CityResearch` 加 `mapLookups`；1.2117 加 `outdoor`（调研模型判断是否户外，不当事实显示）和 `weather`（该景点在行程日期的预报），单城结果加 `weatherCalls` |
| [src/domain/catalog/catalog-entry.ts](../src/domain/catalog/catalog-entry.ts) | 领域层 | Meri 目录（私有仓库 meri-catalog-cn 的 NDJSON）每条记录的 zod 严格 schema，按 spot/dish/restaurant/stay/transport/tip 区分 details；格式一变导入就报错。 |
| [src/domain/catalog/catalog-tags.ts](../src/domain/catalog/catalog-tags.ts) | 领域层 | 标签归并表：景点的 162 种自由标签归成 23 个固定标签（2026-11-25 merlin 定），其他种类的固定标签就是种类；表里没有的标签返回出来，导入停下。 |
| [src/domain/catalog/catalog-row.ts](../src/domain/catalog/catalog-row.ts) | 领域层 | 一条目录记录变成 catalog_entries 的一行：固定标签、source_count、别名拼成的 aliases_text、search_text（名称、别名、种类、固定标签、摘要、景点亮点）。 |
| [src/domain/catalog/catalog-pick.ts](../src/domain/catalog/catalog-pick.ts) | 领域层 | 调研怎么用目录（RAG 第 2 步）：≥ 6 个景点才用目录、≥ 3 道菜才用目录菜；按固定标签判断户外/室内；景点排序（点名的区县 → 有偏好时向量和名字两路 RRF（k=60）合成偏好排名，和热门度排名按 2:1 轮流取，第 3 步 → 否则攻略数 → 把握 → 名字）；按名字或别名找用户点名的景点。 |
| [src/domain/catalog/catalog-tips.ts](../src/domain/catalog/catalog-tips.ts) | 领域层 | RAG 第 5 步：目录提示分三类——关联景点的挂到被选中的目录卡上，节庆（按名字和农历、节期等字样识别）和整城提示放城市卡；节庆在前。 |
| [src/domain/catalog/catalog-tips.test.ts](../src/domain/catalog/catalog-tips.test.ts) | 测试（领域规则） | 节庆识别、景点提示只给被选中的景点、节庆即使关联景点也进城市卡。 |
| [src/domain/catalog/city-scores.ts](../src/domain/catalog/city-scores.ts) | 领域层 | RAG 第 4 步：全库匹配按州/市汇总，最像的一条满分、第二条一半、第三条四分之一，取前 6 座城、每城 3 条；最像的低于 0.5 就不给城市。 |
| [src/domain/catalog/city-scores.test.ts](../src/domain/catalog/city-scores.test.ts) | 测试（领域规则） | 加权让一条精确匹配胜过三条松散匹配（大熊猫：成都胜阿坝）、每城 3 条和 6 座城上限、门槛。 |
| [src/domain/catalog/catalog-pick.test.ts](../src/domain/catalog/catalog-pick.test.ts) | 测试（领域规则） | 户外判断、排序、按名字和别名查找。 |
| [src/platform/catalog/catalog-source.ts](../src/platform/catalog/catalog-source.ts) | 基础设施适配器 | 按（省，州/市）读 catalog_entries 的 spot 和 dish 转成领域类型；按偏好原话同时查向量（余弦前 50，查询向量由百炼算，失败时这一路为空）和名字（word_similarity 前 20），RAG 第 3 步；`CATALOG_ENABLED=true` 才读，数据库客户端第一次用到时才加载；读失败抛 CatalogReadError，调研和吃什么接住后改走搜索。 |
| [src/platform/embedding/bailian-embedding.ts](../src/platform/embedding/bailian-embedding.ts) | 基础设施适配器 | 百炼 /embeddings：一次最多 20 条、按输入顺序返回、维度不对或缺一条就报 invalid_response；不重试；`PAID_CALLS_ENABLED=false` 不发，`EMBEDDING_MAX_CALLS_PER_DAY`（默认 500，计数在 `.cache/embedding-calls.json`）；没有 DASHSCOPE_API_KEY 或 EMBEDDING_BASE_URL 时不建客户端。 |
| [src/platform/embedding/bailian-embedding.test.ts](../src/platform/embedding/bailian-embedding.test.ts) | 测试（适配器） | 请求格式和顺序、HTTP 失败不重试、维度不对或缺向量、总开关、每日上限、超过 20 条、缺配置。 |
| [src/platform/catalog/catalog-source.test.ts](../src/platform/catalog/catalog-source.test.ts) | 测试（适配器） | 开关只认 true；行转成景点（带亮点）和菜，其他种类不要。 |
| [src/domain/catalog/catalog-row.test.ts](../src/domain/catalog/catalog-row.test.ts) | 测试（领域规则） | 标签归并的顺序与去重、未知标签、其他种类、search_text 拼法、schema 拒绝多字段和错 details。 |
| [src/domain/plan/plan-draft.ts](../src/domain/plan/plan-draft.ts) | 领域层 | 计划草稿与路线类型；规划范围（示范日或全部城市与日期）；校验 Plan Agent 的路线（覆盖、放弃条件、天数、区县）并生成每天的城市、转场、重点区县和主题；按添加顺序兜底分天；校验选点提案（候选、所在城市、跨天重复、每天上限与转场日少 1、有原文支持的时间锚点、点名景点），整理冲突和待核实字段；识别用户点名的区域（以市、县、旗结尾的区县名）；用户选择放弃的城市才允许在天数够时放弃；`legReach` 判断一段路的时间能不能用：没路、一头离路超过 1 公里是一大片区域（1.2105）、或可用但头尾有一截超过 300 米没路。；1.2117 加 `reorderRoute`：绕路兜底时按最短顺序重排城市，每城天数、理由和每天的重点区与主题跟着城市走 |
| [src/domain/plan/availability.ts](../src/domain/plan/availability.ts) | 领域层 | 第二轮精查的判断规则（1.2013）：值必须出现在原文里（周几、时刻、月日、天数）、日期算星期几和跨年范围、通知是否过期（一年）；按每站的日期和时段得出 开放 / 部分关闭 / 关闭 / 待确认 / 未核实。 |
| [src/domain/plan/availability.test.ts](../src/domain/plan/availability.test.ts) | 测试 | 验证原文核对、星期与跨年范围、过期通知，以及各种情况下每站的结论（含查了但什么都没找到时不算开放）。 |
| [src/domain/plan/plan-repair.ts](../src/domain/plan/plan-repair.ts) | 领域层 | 验证阶段的代码修复：算每站结论、找出关闭的站、晚上关得早的改下午、关闭的换到同城有空且开放的另一天（转场日上午不排）、改不了的交给 Plan Agent；生成保存用的每站核实记录。 |
| [src/domain/plan/plan-repair.test.ts](../src/domain/plan/plan-repair.test.ts) | 测试 | 验证改时段、换日、没处可换时留给 Plan Agent、转场日只排下午。 |
| [src/domain/plan/train-connections.ts](../src/domain/plan/train-connections.ts) | 领域层 | 1.2110：把经中转城市的两次直达查询拼成一趟中转行程：第二趟要在第一趟到达后至少 40 分钟（同站）或 90 分钟（换站）出发，等车不超过 6 小时；每个第一趟只留最快的第二趟，总共留最快的 3 趟。 |
| [src/domain/plan/train-connections.test.ts](../src/domain/plan/train-connections.test.ts) | 测试 | 跨天拼接、换乘时间太短、跨站换乘、等太久、最快优先。 |
| [src/domain/plan/flight-connections.ts](../src/domain/plan/flight-connections.ts) | 领域层 | 1.2113：把经中转城市的两次直飞查价拼成转机航班：第二班要在第一班落地后至少 1.5 小时（同机场）或 3.5 小时（换机场）起飞，等待不超过 6 小时；票价和机建燃油是两段相加（两张票），余座取较少的一段；每个第一班只留最快的第二班，总共留最快 3 个。 |
| [src/domain/plan/flight-connections.test.ts](../src/domain/plan/flight-connections.test.ts) | 测试 | 录下的上海→迪庆经成都转机拼成一趟、同机场和换机场的最短转机时间、等待超过 6 小时、夜里落地接第二天早班。 |
| [src/domain/plan/air-rail.ts](../src/domain/plan/air-rail.ts) | 领域层 | 1.2114：把飞到中转城市的航班和从那里出发的火车拼成「飞机转火车」：火车至少在落地 2 小时后出发、等待不超过 6 小时，每个航班留到得最早的一趟，总共留最快 3 个；票价是机票加最便宜的座位，没有就是未知。 |
| [src/domain/plan/air-rail.test.ts](../src/domain/plan/air-rail.test.ts) | 测试 | 2 小时换乘、等待超过 6 小时、没有票价、按总时长排序、夜里落地接第二天早上的车。 |
| [src/domain/plan/transfer-legs.ts](../src/domain/plan/transfer-legs.ts) | 领域层 | 1.2106：启程、转场、回程三类交通段的类型和每段的状态（估算、出发地没写、不确定、同一座城、没找到、没路、没查）；`transferLegs` 由代码从路线展开后的每一天和出发地列出要估算的段：第 1 天启程，带 `arrivingFrom` 的天转场，最后一天回程（示范日没有回程）。；1.2115 推荐的 `by` 加 `traveller`（用户在计划页切换的）；1.2114 加 `AirRailOption`、`airRail` 和推荐的 `air_rail` / `airRailCode` |
| [src/domain/plan/transfer-legs.test.ts](../src/domain/plan/transfer-legs.test.ts) | 测试 | 多城和单城列出的段、出发地缺失和不确定、示范日没有回程、schema 读新旧计划。 |
| [src/domain/plan/transport-question.ts](../src/domain/plan/transport-question.ts) | 领域层 | 1.2112：交通提问。启程或回程绑定火车、最快的车超过 12 小时（`longTrainMinutes`）且查到航班时，由代码按真实车次、时长、票价写问题（去程回程合成一个，太长时去掉车次航班号），固定选项「坚持坐火车」「改坐飞机」（「你来定」是卡片自带按钮）；`mentionsTravelMode` 判断偏好里有没有提到火车或飞机（没有就必问）；`transportAnswerOf` 把选项文字换成 train/flight/auto。 |
| [src/domain/plan/transport-question.test.ts](../src/domain/plan/transport-question.test.ts) | 测试 | 中英文问题文本、两段合问、过长去掉代码、答案对应、偏好关键词。 |
| [src/domain/plan/leg-mode.ts](../src/domain/plan/leg-mode.ts) | 领域层 | 1.2115：哪一段能在火车和航班之间切换（启程或回程，最快火车超过 12 小时，两种都查到），以及切换后的这一段（最快的排第一，`by: traveller`）。 |
| [src/domain/plan/leg-mode.test.ts](../src/domain/plan/leg-mode.test.ts) | 测试 | 只有超过 12 小时的火车加上查到的航班才能切换、来回切换、转场不能切。 |
| [src/domain/plan/plan-draft.test.ts](../src/domain/plan/plan-draft.test.ts) | 测试（对应模块边界） | 验证规划范围、路线生成转场日和区县、路线错误被退回、天数不够时放弃城市与兜底、选点校验、转场日少一个景点和冲突整理。 |
| [src/domain/plan/plan-draft-response.ts](../src/domain/plan/plan-draft-response.ts) | 领域层 | 景点卡、调研结果、路线、每日安排、计划草稿（1.2106 起含 `transfers`）、照片和完整计划（ReadyPlan）的运行时 schema，供接口、页面、事件、数据库读取和验证脚本共用。；1.2113 航班可带 `change`（中转城市、等待、是否同机场、两段航班），航班号最长 25 字；1.2115 推荐的 `by` 可为 `traveller`；1.2114 加 `airRail` 和推荐的 `air_rail`；1.2117 校验景点卡的 `outdoor` 和 `weather` |
| [src/domain/plan/weather.ts](../src/domain/plan/weather.ts) | 领域层 | 1.2117：每天预报的形状、WMO 代码到天空类型、户外好/一般/差的门槛（≥25 mm、雷暴、暴雨大雪代码、降雪 ≥5 cm、阵风 ≥62 km/h 为差；≥5 mm 或概率 ≥60% 为一般）、16 天预报窗口、2 km 合并查询点、城市的代表天气 |
| [src/domain/plan/weather.test.ts](../src/domain/plan/weather.test.ts) | 测试 | 天空类型、好坏门槛（用录下的雷阵雨和 8 级风）、预报窗口、合并查询点。 |
| [src/domain/plan/plan-weather.ts](../src/domain/plan/plan-weather.ts) | 领域层 | 1.2117：户外景点排在自己天气差的一天、同城另一天天气不差且有空位时，给 Plan Agent 的退回说明 |
| [src/domain/plan/outfit.ts](../src/domain/plan/outfit.ts) | 领域层 | 1.2117 穿衣：18 样基础款和 10 个部位；按当天最冷的点分层（≥20° 短袖 / 12–20° 长袖+防风 / 5–12° 长袖+抓绒+冲锋衣 / 0–5° 保暖内衣+抓绒+羽绒服 / <0° 再加保暖裤、毛线帽、手套），雨、雷暴、大风、雪、海拔 ≥3000 m、晴热各加相应物品，每样带结构化理由；温差 ≥10° 提醒；检查 Kimi 的补充；打包清单汇总 |
| [src/domain/plan/outfit.test.ts](../src/domain/plan/outfit.test.ts) | 测试 | 分层门槛、玉龙雪山实测那天、雨/雷暴/大风/雪/晴、没有预报、每站预报与城市天气、补充的检查、打包清单。 |
| [src/domain/plan/stays.ts](../src/domain/plan/stays.ts) | 领域层 | 1.2117 住宿：酒店、详情、城市住宿的类型；同城连续几天一段、最后一天回家不算一晚；在这段景点里最居中的已定位景点附近查，没有就查城市；按星级分经济/舒适/高档，每档取最近的有价酒店；`bigAreaStops` 从路程里找出离路超过 1 km 的大片区域（如洱海），不在它附近查 |
| [src/domain/plan/stays.test.ts](../src/domain/plan/stays.test.ts) | 测试 | 分段和晚数、一日游和没日期不住、用录下的样例挑三档。 |
| [src/domain/plan/food.ts](../src/domain/plan/food.ts) | 领域层 | 1.2117 吃什么：类型；推广文章的判断词；网站归并（m.ctrip.com 和 ctrip.com 算一个）；餐厅名去分店；核对引用（在原文里、写到名字），每个网站一条；两个独立见证的判断（两个网站，或一个网站加地图）；天地图结果只认本城且离景点 1.5 km 内最近的；按天切出每座城连续的几天 |
| [src/domain/plan/food.test.ts](../src/domain/plan/food.test.ts) | 测试 | 用录下的样例：软文和探店被去掉、网站归并、引用和两个网站、外地同名店不算、离景点远的不算。 |
| [src/domain/plan/route-distance.ts](../src/domain/plan/route-distance.ts) | 领域层 | 1.2117：城市中心之间的直线路程（有出发地从出发地起、回到出发地），最短顺序（≤8 城穷举，更多用就近 + 2-opt）；绕路判断在 route-weather.ts |
| [src/domain/plan/route-weather.ts](../src/domain/plan/route-weather.ts) | 领域层 | 1.2117：先距离、后天气。每城保留模型给的天数、按顺序排上日期，数每种顺序碰到几天「不宜户外」（转场日照常算）；在不超过最短顺序 30% 的顺序里选差的天数最少的，再选更短的，平手保留模型的顺序；也判断是否绕路 |
| [src/domain/plan/route-weather.test.ts](../src/domain/plan/route-weather.test.ts) | 测试 | 日期分配、两城同距离按天气选、天气不能换来超过 30% 的路程、平手保留、绕路时取 30% 内最好的顺序。 |
| [src/domain/plan/route-distance.test.ts](../src/domain/plan/route-distance.test.ts) | 测试 | 云南南北走向的最短顺序、来回折返超过 30%、无法测量的情况、10 座城、重排后天数和主题跟着城市。 |
| [src/domain/plan/plan-progress.ts](../src/domain/plan/plan-progress.ts) | 领域层 | 计划运行的进度事件格式（服务端和页面共用）：十个阶段（1.2106 加 transfers「查转场」）、当前活动、阶段完成摘要、城市调研完成、定位结果、路线、某一天、照片、等待回答（问题）、已回答、运行结束及错误码；问题的格式；外层带 runId、seq 和服务器时间；1.2013 加验证阶段、核实与重排的活动、spot.checked 事件；1.2112 问题加可选的 `step`（提问的步骤，`plan-route` 或 `transfer-legs`，旧问题没有即路线）。；1.2117 加 `forecasting` 活动；1.2117 加阶段 `outfit` 和事件 `day.outfit` |
| [src/domain/plan/plan-run.ts](../src/domain/plan/plan-run.ts) | 领域层 | 计划运行（状态含等待回答、交接、摘要、错误码、用量）和计划版本的类型，以及 plan-runs、回答（选项、「你来定」或 1.2018 起的自写答案）与 plan 接口的请求和响应 schema。 |
| [src/domain/trip-state/planning-readiness.test.ts](../src/domain/trip-state/planning-readiness.test.ts) | 测试（对应模块边界） | 验证缺目的地、只有省、省市混合、旧文本和已选城市的准备度；其他字段不是硬门槛。 |
| [src/domain/trip-state/planning-readiness.ts](../src/domain/trip-state/planning-readiness.ts) | 领域层 | 纯准备度规则：missing、unverified 或 selected（只有省也算 selected）；仅检查状态，不研究可行性。 |
| [src/domain/trip-state/trip-dates.test.ts](../src/domain/trip-state/trip-dates.test.ts) | 测试（对应模块边界） | 验证含首尾计数、任意两项补算第三项、修改哪项决定补算哪项、跨月跨年/闰日，以及近似/非法值不参与。 |
| [src/domain/trip-state/trip-dates.ts](../src/domain/trip-state/trip-dates.ts) | 领域层 | 开始/结束/时长纯规则：解析精确日期与 N天，按本次修改的字段补算第三项（含首尾计数），近似值与结束早于开始时不补算。 |
| [src/domain/trip-state/trip-state.test.ts](../src/domain/trip-state/trip-state.test.ts) | 测试（对应模块边界） | 验证草稿初始化、显式目的地选择、默认名称/用户名称保护、patch 校验与字段状态，以及 patch 时日期三项补算。 |
| [src/domain/trip-state/trip-state.ts](../src/domain/trip-state/trip-state.ts) | 领域层 | 七类权威字段、certainty/source、初始化/patch（patch 时按 trip-dates 补算日期三项）、目的地展示与推荐资格、旧 destination 读取兼容。 |
| [src/domain/trip-state/workspace-conversation.test.ts](../src/domain/trip-state/workspace-conversation.test.ts) | 测试（对应模块边界） | 验证目的地不混入普通 patch、certainty/source、无修改、非法字段及重复修改拒绝。 |
| [src/domain/trip-state/workspace-conversation.ts](../src/domain/trip-state/workspace-conversation.ts) | 领域层 | 四项模型解释契约，逐项挽救 changes/目的地 edit/三种推荐意图（坏的单项丢弃，只有缺少可用 reply 才失败），另有严格版校验；普通 changes 以当前状态为参照丢弃无变化项后转 user patch；交通可清空为 missing。 |
| [src/domain/trip/trip-errors.ts](../src/domain/trip/trip-errors.ts) | 领域层 | Trip 输入非法与未找到错误，供服务及 route 区分业务失败。 |
| [src/domain/trip/trip.ts](../src/domain/trip/trip.ts) | 领域层 | Trip 身份/owner/status/time 类型及创建输入校验，不包含可变旅程字段或 IO。 |

### 6.8 Journey 应用用例

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/capabilities/journey/create-journey-with-opening.test.ts](../src/capabilities/journey/create-journey-with-opening.test.ts) | 测试（对应模块边界） | 验证开场候选不直接保存目的地、查询失败事实和 opening 失败时 Journey 可恢复。 |
| [src/capabilities/journey/create-journey-with-opening.ts](../src/capabilities/journey/create-journey-with-opening.ts) | 应用层/用例装配 | 创建协调：校验草稿、以 missing 基底执行地点 edit，精确地点作为初始目的地，其余保存固定开场与候选，否则调用普通 opening。 |
| [src/capabilities/journey/destination-concurrency.test.ts](../src/capabilities/journey/destination-concurrency.test.ts) | 测试（对应模块边界） | 验证过期目的地写入拒绝、普通字段冲突重试及保留同时保存的地点。 |
| [src/capabilities/journey/journey-errors.ts](../src/capabilities/journey/journey-errors.ts) | 应用层/用例装配 | Journey 创建/清理失败、缺失状态和 CAS 冲突错误。 |
| [src/capabilities/journey/journey-service-instance.ts](../src/capabilities/journey/journey-service-instance.ts) | 应用层/用例装配 | 装配 TripService、Postgres state repository、消息服务及创建失败清理。 |
| [src/capabilities/journey/journey-service.test.ts](../src/capabilities/journey/journey-service.test.ts) | 测试（对应模块边界） | 验证不完整 Journey、状态/消息失败回滚、读取缺失、patch 和删除等应用边界。 |
| [src/capabilities/journey/journey-service.ts](../src/capabilities/journey/journey-service.ts) | 应用层/用例装配 | Trip + TripState 协调用例，创建（可带精确匹配的初始目的地）及补偿回滚、加载、删除、最新状态 patch 及最多三次 CAS 重试。 |
| [src/capabilities/journey/journey-summary-repository-instance.ts](../src/capabilities/journey/journey-summary-repository-instance.ts) | 应用层/用例装配 | 将数据库装配为生产 PostgresJourneySummaryRepository。 |
| [src/capabilities/journey/my-journeys.test.ts](../src/capabilities/journey/my-journeys.test.ts) | 测试（对应模块边界） | 验证匿名空列表、owner-scoped 列表及读取模型边界。 |
| [src/capabilities/journey/journey-covers.ts](../src/capabilities/journey/journey-covers.ts) | 应用层/用例装配 | 首页旅程封面：每个旅程取第一个有照片的已选地点，卡片选过的地点沿用卡片照片，与 Workspace 标题缩略图一致；限时等待，超时或失败只是没有照片。 |
| [src/capabilities/journey/journey-covers.test.ts](../src/capabilities/journey/journey-covers.test.ts) | 测试（对应模块边界） | 验证封面取第一个地点、无地点不查询、沿用卡片照片，以及慢或失败的查询只让那张卡没照片。 |
| [src/capabilities/journey/my-journeys.ts](../src/capabilities/journey/my-journeys.ts) | 应用层/用例装配 | 用既有访客身份读取 JourneySummary，缺身份返回空列表，不创建新身份。 |
| [src/capabilities/journey/prompts/trip-draft-prompt.test.ts](../src/capabilities/journey/prompts/trip-draft-prompt.test.ts) | 测试（对应模块边界） | 验证草稿 prompt 的不确定性/原话保留、共享字段语义及旅程名按首页语言。 |
| [src/capabilities/journey/prompts/trip-draft-prompt.ts](../src/capabilities/journey/prompts/trip-draft-prompt.ts) | 应用层/用例装配 | 首页草稿提取系统 prompt，带参考日期、时区和首页语言（推断的旅程名用该语言写），约束 certainty 与目的地操作；地名规则按语言分写（中文原样，英文换成中文名）。 |
| [src/capabilities/journey/prompts/trip-state-field-guidance.ts](../src/capabilities/journey/prompts/trip-state-field-guidance.ts) | 应用层/用例装配 | 草稿与 Workspace 共享的普通字段 certainty 和业务语义提示块；精确日期写 YYYY-MM-DD、精确天数写 N天，并说明应用会补算第三项；英文界面另加一句：大概的值保持用户的英文原话（a week）。 |
| [src/capabilities/journey/trip-draft-extractor.test.ts](../src/capabilities/journey/trip-draft-extractor.test.ts) | 测试（对应模块边界） | 验证有效提取不创建 Trip、空输入先拒绝、模型请求/非法输出和截断错误。 |
| [src/capabilities/journey/trip-draft-extractor.ts](../src/capabilities/journey/trip-draft-extractor.ts) | 应用层/用例装配 | 首页提取 JSON Schema 和结构化模型调用，处理请求/截断/输出错误，挽救草稿并记录丢弃项。 |
| [src/capabilities/journey/trip-service-instance.ts](../src/capabilities/journey/trip-service-instance.ts) | 应用层/用例装配 | 将 PostgresTripRepository 与数据库装配成生产 TripService。 |
| [src/capabilities/journey/trip-service.test.ts](../src/capabilities/journey/trip-service.test.ts) | 测试（对应模块边界） | 验证只创建根身份字段、默认 idea、读取/删除及归属保护。 |
| [src/capabilities/journey/trip-service.ts](../src/capabilities/journey/trip-service.ts) | 应用层/用例装配 | 创建/读取/按 owner 处理 Trip 根身份与生命周期，依赖 TripRepository。 |
| [src/capabilities/journey/workflow.md](../src/capabilities/journey/workflow.md) | 应用层说明 | Journey 创建/加载/列表/删除的短说明；详细开场和业务边界查 USER_FLOW_CURRENT。 |

### 6.9 Conversation 应用用例

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/capabilities/conversation/conversation-history-content.ts](../src/capabilities/conversation/conversation-history-content.ts) | 应用层/用例装配 | 将保存的 presentation 写成“展示过的卡片”上下文，明确待选卡不是用户决定。 |
| [src/capabilities/conversation/destination-missing-guidance.ts](../src/capabilities/conversation/destination-missing-guidance.ts) | 应用层/用例装配 | 已停用的缺目的地引导消息的稳定 ID；Meri 不再写该消息，只用于在旧历史中识别并跳过它。 |
| [src/capabilities/conversation/destination-selection-message-id.test.ts](../src/capabilities/conversation/destination-selection-message-id.test.ts) | 测试（对应模块边界） | 验证历史身份不变、卡片/类型不冲突、选择顺序无关及 UUID 合法。 |
| [src/capabilities/conversation/destination-selection-message-id.ts](../src/capabilities/conversation/destination-selection-message-id.ts) | 应用层/用例装配 | 从 Trip、offer 和排序后的选择组合派生稳定确认 UUID，兼容旧候选身份；也从 pending 消息派生推荐卡片消息 UUID。 |
| [src/capabilities/conversation/opening-assistant-id.test.ts](../src/capabilities/conversation/opening-assistant-id.test.ts) | 测试（对应模块边界） | 验证开场 UUID 稳定、合法及按 Trip 区分。 |
| [src/capabilities/conversation/opening-assistant-id.ts](../src/capabilities/conversation/opening-assistant-id.ts) | 应用层/用例装配 | 根据 Trip ID 派生稳定的开场助手 UUID。 |
| [src/capabilities/conversation/opening-conversation-service-instance.ts](../src/capabilities/conversation/opening-conversation-service-instance.ts) | 应用层/用例装配 | 将 JourneyService、解释器和消息服务装配为生产开场服务。 |
| [src/capabilities/conversation/opening-conversation-service.test.ts](../src/capabilities/conversation/opening-conversation-service.test.ts) | 测试（对应模块边界） | 验证正常开场、重复 POST 复用、重开不再调用模型及不合资格拒绝；首句要推荐且「去哪」未定时开场带 pending 标记（去掉问句），已定城市或旧文本目的地时不带。 |
| [src/capabilities/conversation/opening-conversation-service.ts](../src/capabilities/conversation/opening-conversation-service.ts) | 应用层/用例装配 | 开场资格判断，生成/复用固定 ID 的助手开场，防止重试重复调用或写入；模型要推荐且目的地仍开放时给开场挂 `destination_recommendations_pending`，卡片走与聊天相同的推荐通道。 |
| [src/capabilities/conversation/prompts/workspace-conversation-prompt.test.ts](../src/capabilities/conversation/prompts/workspace-conversation-prompt.test.ts) | 测试（对应模块边界） | 验证模型提案、提供方核验、用户确认分离、不虚构计划能力，范围规则不变成固定话术，以及两种模式都写入回复语言规则。 |
| [src/capabilities/conversation/prompts/workspace-conversation-prompt.ts](../src/capabilities/conversation/prompts/workspace-conversation-prompt.ts) | 应用层/用例装配 | 聊天系统 prompt：用户决定、地点提案、推荐/规划边界、中国目的地范围（仅遇境外地点时说明）、回复语言和 opening 规则。 |
| [src/capabilities/conversation/prompts/reply-language-guidance.ts](../src/capabilities/conversation/prompts/reply-language-guidance.ts) | 应用层/用例装配 | 提示词里的语言名和回复语言规则：按用户这条消息的语言回复，分不清时用首页选择的语言（由模型判断），旅程名用首页语言；只管文字，不管 destinationEdit 地名怎么写。 |
| [src/capabilities/conversation/prompts/workspace-conversation-locale-rules.ts](../src/capabilities/conversation/prompts/workspace-conversation-locale-rules.ts) | 应用层/用例装配 | 聊天 prompt 里按语言分写的部分：地点修改规则与示例、推荐意图示例、首句（opening）的推荐意图规则（含首句模糊、尚无目的地时也出少量卡）、天气反例；中文为调好的原文，英文用英文示例并要求把英文/拼音地名换成中文名交给高德。 |
| [src/capabilities/conversation/prompts/chinese-prompts-lock.test.ts](../src/capabilities/conversation/prompts/chinese-prompts-lock.test.ts) | 测试（对应模块边界） | 把中文界面的聊天/开场/草稿 prompt 与两份 JSON schema 和快照逐字比较；有意修改时用 UPDATE_PROMPT_SNAPSHOT=1 重写快照并重跑 harness 中文用例。比较前把快照的 CRLF 归一成 LF，所以 Windows 上 `core.autocrlf` 的检出方式不会让测试失败。 |
| [src/capabilities/conversation/prompts/chinese-prompts.snapshot.txt](../src/capabilities/conversation/prompts/chinese-prompts.snapshot.txt) | 测试数据 | 上面锁定测试的快照：1.0034 调好的中文 prompt 和 schema 原文。 |
| [src/capabilities/conversation/trip-message-service-instance.ts](../src/capabilities/conversation/trip-message-service-instance.ts) | 应用层/用例装配 | 装配 Postgres message repository 和 TripRepository 为生产消息服务。 |
| [src/capabilities/conversation/trip-message-service.test.ts](../src/capabilities/conversation/trip-message-service.test.ts) | 测试（对应模块边界） | 验证真实双边消息、候选 presentation、确认幂等和所有权保护。 |
| [src/capabilities/conversation/trip-message-service.ts](../src/capabilities/conversation/trip-message-service.ts) | 应用层/用例装配 | owner 检查后保存初始原话、开场、完整对话、选卡确认、推荐卡片消息（不存在时才写）、推荐卡照片写回（只改原本是推荐卡的消息的 presentation）及读取消息。 |
| [src/capabilities/conversation/turn-reply.test.ts](../src/capabilities/conversation/turn-reply.test.ts) | 测试（对应模块边界） | 验证地点 edit 正文：已加入、准备度只说一次、有卡或失败时省略模型 reply。 |
| [src/capabilities/conversation/turn-reply.ts](../src/capabilities/conversation/turn-reply.ts) | 应用层/用例装配 | 应用自己的句子（措辞取自调用方传入的 meri-replies）：地点 edit 的“已加入/候选/失败”正文（destinationEditReply，出卡或没找到时提示可在目的地「添加」里自己搜）、推荐引导语去问句（recommendationLeadIn）、已捕获字段/待补信息/准备度固定文案，准备度只在首次可规划时说；不代表规划执行。 |
| [src/capabilities/conversation/meri-replies.ts](../src/capabilities/conversation/meri-replies.ts) | 应用层/用例装配 | Meri 在代码里写的句子的中英两份（已加入/候选/没找到/搜索提示/准备度/选卡确认/推荐固定句），以及两种语言的句子连接、列表分隔和引号；按首页选择的语言取用，不判断用户输入的语言。 |
| [src/capabilities/conversation/workspace-conversation-context.test.ts](../src/capabilities/conversation/workspace-conversation-context.test.ts) | 测试（对应模块边界） | 验证空历史、城市/spot 待选卡上下文、助手合并和历史预算。 |
| [src/capabilities/conversation/workspace-conversation-context.ts](../src/capabilities/conversation/workspace-conversation-context.ts) | 应用层/用例装配 | 选最近 5 轮/6000 字符真实历史，合并连续助手消息，保留选卡确认上下文。 |
| [src/capabilities/conversation/workspace-conversation-interpreter.test.ts](../src/capabilities/conversation/workspace-conversation-interpreter.test.ts) | 测试（对应模块边界） | 验证修改提案、当前状态/历史输入、非法 JSON/输出及 opening 限制（不能改状态，可以要推荐卡）。 |
| [src/capabilities/conversation/workspace-conversation-interpreter.ts](../src/capabilities/conversation/workspace-conversation-interpreter.ts) | 应用层/用例装配 | Workspace/opening 的结构化调用与四项 JSON Schema，挽救模型输出并记录丢弃项，opening 禁止修改。 |

### 6.10 Destination 应用用例

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/capabilities/destination/apply-destination-edit.ts](../src/capabilities/destination/apply-destination-edit.ts) | 应用层/用例装配 | none/add/set/remove 执行：几个整省的合称（江浙沪）先展开为省份、不查地图——对话模型已列出省份时直接用，否则问注入的 `provincesOf`（路由传模型的地点解读，默认只用兜底表）；用户原话中被精确匹配的地点直接追加（added），其余准备待选卡；唯一删除；报告部分失败。 |
| [src/capabilities/destination/destination-choice-flow.test.ts](../src/capabilities/destination/destination-choice-flow.test.ts) | 测试（对应模块边界） | 跨模块验证核验→候选→显式提交不提前写目的地，以及提交复核身份/spot 保留；自身城市前缀算精确并用原话作景点名，其他前缀出卡；江浙沪 复现（合成的 石家庄 同名记录）不再进入地图查询，原话里的昵称直接加省份、模型代说的出省份卡，broadRegion 形式同样展开；以及对话模型已列出省份时直接使用、模型的地点解读能判断表里没有的合称（巴蜀）且优先于兜底表。 |
| [src/capabilities/destination/destination-recommendation-selection-route.test.ts](../src/capabilities/destination/destination-recommendation-selection-route.test.ts) | 测试（对应模块边界） | 验证只有保存的 offer 可提交、owner/ID 校验、提供方失败及选择接口状态边界。 |
| [src/capabilities/destination/destination-selection-reply.test.ts](../src/capabilities/destination/destination-selection-reply.test.ts) | 测试（对应模块边界） | 验证确认包含城市/spot、已知/近似字段不重复追问，只有省也可规划、旧文本需重新确认。 |
| [src/capabilities/destination/destination-selection-reply.ts](../src/capabilities/destination/destination-selection-reply.ts) | 应用层/用例装配 | 从保存前后的 TripState 构造只说新增地点的确认，首次可规划时附准备度和补充信息邀请，固定正文无 LLM 调用，措辞按首页选择的语言（meri-replies）。 |
| [src/capabilities/destination/destination-selection-v2.test.ts](../src/capabilities/destination/destination-selection-v2.test.ts) | 测试（对应模块边界） | 验证多省追加、旧 replace 冲突、已确认/过期卡、安全重试及不恢复已删除目的地。 |
| [src/capabilities/destination/location-service.test.ts](../src/capabilities/destination/location-service.test.ts) | 测试（对应模块边界） | 验证空表达不调用、原话查询、无结果和提供方异常归一化；以及原话没找到时才用模型的正式名称再查一次，用正式名称找到的结果不算原话。 |
| [src/capabilities/destination/location-service.ts](../src/capabilities/destination/location-service.ts) | 应用层/用例装配 | 调用 LocationProvider、规范化错误并执行名称解析；同名商业 POI 干扰时最多补查一次“原词＋市”，要求行政字段佐证；保留原始候选供手动选择。构造时可带 `areas`（旅程已存的省/市），原样传给提供方当搜索先验；还可带 `officialNameOf`（模型给的地图正式名称，苍山 → 点苍山），只在原话没找到时用它再查一次，结果不算原话、照常出卡。 |
| [src/capabilities/destination/saved-area-names.ts](../src/capabilities/destination/saved-area-names.ts) | 应用层/用例装配 | 从 TripState 取出省名 + 市名（不含 spot、去重），作为搜索先验；目的地缺失或只有旧文本时返回空。 |
| [src/capabilities/destination/saved-area-names.test.ts](../src/capabilities/destination/saved-area-names.test.ts) | 测试（对应模块边界） | 验证空旅程返回空、只取省和市、spot 不参与、跨省去重。 |
| [src/capabilities/destination/region-hint.ts](../src/capabilities/destination/region-hint.ts) | 应用层/用例装配 | 地点解读（`readPlace`）：问一次模型这几个字是什么（几个整省的合称 / 省 / 城市 / 景点 / 不知道）、在哪个省和地级市、地图上的正式名称；`hintedAreas` 由此给冷启动先验 `[prefecture, province]`，`provincesOfPlace` 由此判断合称（模型答不上来才用兜底表）。模型给的省份只保留真实省名。4 秒上限（超时等于没有答案）、进程内缓存 7 天且只缓存真实答案、带行政后缀和省级简称不问。只是判断和搜索中心，提供方仍要核验。 |
| [src/capabilities/destination/region-hint.test.ts](../src/capabilities/destination/region-hint.test.ts) | 测试（对应模块边界） | 验证市在省前、行政名和省级简称不调用模型、未知/空答案/模型报错都返回空、真实答案只问一次、永不返回的模型被超时放弃，以及模型读出的整省组合（假省名被丢弃）、模型答案优先于兜底表、模型答不上来时兜底表仍挡住江浙沪、正式名称。 |
| [src/capabilities/destination/place-images.ts](../src/capabilities/destination/place-images.ts) | 应用层/用例装配 | 照片查询顺序（景点/县级市境内→地标→市的国家级景点；省级景点只给只有省的目的地）、卡片配图、同一照片只出现一次、沿用卡片照片的已选地点照片，以及旅程封面（第一个有照片的地点，找到即停）。 |
| [src/capabilities/destination/place-images.test.ts](../src/capabilities/destination/place-images.test.ts) | 测试（对应模块边界） | 验证查询顺序（市卡不退到省）、景区后缀仍按名称查询、逐个兜底、卡片配图、照片去重、沿用对话照片和封面找到即停。 |
| [src/capabilities/destination/destination-photos-route.test.ts](../src/capabilities/destination/destination-photos-route.test.ts) | 测试（对应模块边界） | 验证照片接口按当前地点返回、不共享缓存、not-found 与其他失败区分。 |
| [src/capabilities/destination/location-suggestion-service.test.ts](../src/capabilities/destination/location-suggestion-service.test.ts) | 测试（对应模块边界） | 验证 query 规则、完整建议列表及调用前拒绝非法输入。 |
| [src/capabilities/destination/location-suggestion-service.ts](../src/capabilities/destination/location-suggestion-service.ts) | 应用层/用例装配 | 输入建议用例，trim/长度校验，调用建议端口并转换错误。 |
| [src/capabilities/destination/planning-readiness-route.test.ts](../src/capabilities/destination/planning-readiness-route.test.ts) | 测试（对应模块边界） | 验证无 owner 不加载、读取当前权威状态、准备度只读及不调用地点研究。 |
| [src/capabilities/destination/resolve-destination-place.ts](../src/capabilities/destination/resolve-destination-place.ts) | 应用层/用例装配 | 将核验候选映射为 province/place/spot，保留不同 provider 身份及显示细节；同一偏好的多条记录视为一个地点，并给出 exact（namesSamePlace：原话＋行政/景区后缀，可带记录自身市/区县前缀；其他前缀不算）。placeNameStem 给出行政后缀前最短的词干（迪庆藏族自治州 → 迪庆），只用于判断一段文字是否写到这个地方，不用于显示（1.2015）。 |
| [src/capabilities/destination/search-picks.ts](../src/capabilities/destination/search-picks.ts) | 应用层/用例装配 | 手动搜索结果的噪声过滤：候选里已有行政区答案时，只保留该行政区、名字恰好等于原话的条目，以及以地名后缀结尾的条目；同名的店/公司/节庆（大连上升、大连CS、大连啤酒节）被去掉。天地图把这些也标成 sight，所以只能看名字；旅游区因后缀过长不算行政区。另校验手动添加请求，按完整名称和地区核验单字建议，只返回唯一省/市/spot 偏好。 |
| [src/capabilities/destination/search-picks.test.ts](../src/capabilities/destination/search-picks.test.ts) | 测试（对应模块边界） | 验证搜索噪声过滤；单字建议完整名称/地区核验、市中心区县差异、同名异地/歧义/境外拒绝、同偏好 POI 合并及添加请求结构。 |
| [src/capabilities/destination/verified-destination-choice.ts](../src/capabilities/destination/verified-destination-choice.ts) | 应用层/用例装配 | 对持久化卡项按偏好 ID/旧 provider 身份重新验证；已核验省范围有专门处理。 |

### 6.11 Recommendation 应用用例

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/capabilities/recommendation/destination-recommendation-context.ts](../src/capabilities/recommendation/destination-recommendation-context.ts) | 应用层/用例装配 | 从当前状态、推荐范围（within/elsewhere）和最多 10 条/6000 字符历史构造聊天触发（conversation）的推荐 context，带首页选择的语言（推荐固定句用它）。 |
| [src/capabilities/recommendation/destination-recommendation-generator.test.ts](../src/capabilities/recommendation/destination-recommendation-generator.test.ts) | 测试（对应模块边界） | 验证聊天触发的上下文、真实历史/展示卡、JSON/schema 校验、理由按首页语言（名称保持中文）、未定目的地时模糊请求只要 3–4 个不同类型的地方（明确请求仍是完整一组）及推荐生成错误。 |
| [src/capabilities/recommendation/destination-recommendation-generator.ts](../src/capabilities/recommendation/destination-recommendation-generator.ts) | 应用层/用例装配 | 推荐模型 JSON Schema、AI SDK 调用及领域校验，输出省/市/理由/配图地标及其英文名、其他叫法和 1–2 个备选地标（都只用于配图），非法结果抛专用错误。 |
| [src/capabilities/recommendation/destination-recommendation-model-client.test.ts](../src/capabilities/recommendation/destination-recommendation-model-client.test.ts) | 测试（对应模块边界） | 验证显式按钮调用不伪造 user 消息，AI SDK 只发一次模型请求。 |
| [src/capabilities/recommendation/destination-recommendations-route.test.ts](../src/capabilities/recommendation/destination-recommendations-route.test.ts) | 测试（对应模块边界） | 验证推荐卡片接口：派生 ID、重复请求不重跑、对话或目的地变化后 409、错误请求与工作流失败不写入。 |
| [src/capabilities/recommendation/destination-recommendation-photos-route.test.ts](../src/capabilities/recommendation/destination-recommendation-photos-route.test.ts) | 测试（对应模块边界） | 验证照片流逐行返回并写回、无待查卡时空响应、保存失败仍发完、浏览器离开仍保存、owner/非推荐卡/坏 body 被拒，以及远程查不了的卡不推行、保存时仍为未查。 |
| [src/capabilities/recommendation/destination-recommendation-use-case.test.ts](../src/capabilities/recommendation/destination-recommendation-use-case.test.ts) | 测试（对应模块边界） | 验证推荐范围判断（within/elsewhere/拒绝）、pending 请求还原、状态变化后不出卡及工作流失败传递。 |
| [src/capabilities/recommendation/destination-recommendation-use-case.ts](../src/capabilities/recommendation/destination-recommendation-use-case.ts) | 应用层/用例装配 | 按写入后状态判断推荐范围；从保存的对话还原 pending 请求；状态仍允许时运行工作流。 |
| [src/capabilities/recommendation/destination-recommendation-workflow.test.ts](../src/capabilities/recommendation/destination-recommendation-workflow.test.ts) | 测试（对应模块边界） | 验证省份/顺序保留、搜索失败降级、已定省过滤、空结果固定正文及卡片带地标不带照片。 |
| [src/capabilities/recommendation/recommendation-photos.ts](../src/capabilities/recommendation/recommendation-photos.ts) | 应用层/用例装配 | 为未查过照片（或按旧规则存成没图）的推荐卡并行查图：先查本地（地标、市的代表图或同市已下载照片、备选地标），再按顺序查远程源（先 Wikimedia 再 Pixabay，每个源都先查卡片自己的地标和第一个备选地标，每个源一批共用一份额度）；到一张报一张，有远程源查不了而其他源也没找到的卡不回答、留待下次；回答时记规则版本 `photoRules`；同批照片先到先得不重复，返回补好的 presentation。 |
| [src/capabilities/recommendation/recommendation-photos.test.ts](../src/capabilities/recommendation/recommendation-photos.test.ts) | 测试（对应模块边界） | 验证按地标查图与逐张回报、已有答案或无省的卡不再查、同一照片不出现在两张卡上，本地命中不查远程、没有英文名也按中文地标查、远程查不了的卡保持未查、主地标没图时试第一个备选地标、本地已有的备选地标不触发搜索。 |
| [src/capabilities/recommendation/destination-recommendation-workflow.ts](../src/capabilities/recommendation/destination-recommendation-workflow.ts) | 应用层/用例装配 | Discovery Search→模型生成→省份过滤（within 限已定省，elsewhere 排除已保存省）→卡项 ID（带配图用的地标，不查照片）的确定性流程；搜索故障降级，无排序/访问检查。 |
| [src/capabilities/recommendation/prompts/destination-recommendation-prompt.ts](../src/capabilities/recommendation/prompts/destination-recommendation-prompt.ts) | 应用层/用例装配 | 受限省市推荐 prompt，含聊天触发说明、真实上下文和未核验搜索启发；理由用首页语言写，省/市/地标名保持中文；未定目的地且用户只说想出去玩时只给 3–4 个、各在不同省份的不同类型地方。 |
| [src/capabilities/recommendation/prompts/destination-recommendation-prompt.test.ts](../src/capabilities/recommendation/prompts/destination-recommendation-prompt.test.ts) | 测试（prompt） | 只有目录给出城市时才加目录那段数据，不带分数，其余提示词不变（RAG 第 4 步）。 |

### 6.11a Planning 交接

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/capabilities/planning/pdf-export/plan-pdf.ts](../src/capabilities/planning/pdf-export/plan-pdf.ts) | 应用层 | 核对旅程归属、读取打印快照和语言、判断过期、限制排队和生成耗时、输出进度流。 |
| [src/capabilities/planning/pdf-export/chromium.ts](../src/capabilities/planning/pdf-export/chromium.ts) | 适配器 | 启动无头 Chromium，携带访客 cookie 打开内部打印页，等待图片字体，在内存生成 PDF 并关闭浏览器。 |
| [src/capabilities/planning/pdf-export/protocol.ts](../src/capabilities/planning/pdf-export/protocol.ts) | 契约 | 客户端和服务端共用的导出阶段、文件及错误事件。 |
| [src/capabilities/planning/pdf-export/plan-pdf.test.ts](../src/capabilities/planning/pdf-export/plan-pdf.test.ts) | 测试 | 用替身渲染器覆盖快照、归属、NDJSON、排队、限额、取消和超时。 |
| [src/capabilities/planning/journey-lock.ts](../src/capabilities/planning/journey-lock.ts) | 应用层 | 2026-11-21 旅程锁：有过 Generate plan 运行的旅程，Workspace 的写接口返回 409 `journey_locked`（非本人或未登录照旧走原逻辑，不透露有没有计划）；计划页的写入不受影响 |
| [src/capabilities/planning/journey-lock.test.ts](../src/capabilities/planning/journey-lock.test.ts) | 测试 | 有运行即锁、本人得到 409、未锁/无访客/非本人照常。 |
| [src/capabilities/planning/plan-dates.ts](../src/capabilities/planning/plan-dates.ts) | 应用层 | 2026-11-21 计划页补填日期：只在有过运行、出发日期不准确时接受一次；检查不早于今天、一年内、和已知天数一致、不超过 60 天；写进旅程后返回新交接（最近运行的交接 + 新旅程状态 + 今天） |
| [src/capabilities/planning/plan-dates.test.ts](../src/capabilities/planning/plan-dates.test.ts) | 测试 | 已知天数只填出发、天数未知填两头、只能填一次、各种日期错误、没运行、非本人、HTTP 状态。 |
| [src/capabilities/planning/extract-plan-preferences.ts](../src/capabilities/planning/extract-plan-preferences.ts) | 应用层 | 读整段对话（30 条、12,000 字符，保留第一条）提取偏好，每条带原话、短标签和类型，以消息 ID 核对原话；另给计划页写的一句话生成标签和类型；`labelAnswer`（1.2018）给问题卡里自写的答案生成标签、类型、节奏方向和要放弃的城市，城市必须是行程里的才保留。 |
| [src/capabilities/planning/extract-plan-preferences.test.ts](../src/capabilities/planning/extract-plan-preferences.test.ts) | 测试 | 验证原话来源、标签和类型、30 条与第一条的截取、标签降级和不可用降级。 |
| [src/capabilities/planning/trip-preferences-handler.ts](../src/capabilities/planning/trip-preferences-handler.ts) | 应用层 | 偏好接口：归属检查后列出有效偏好、添加（查重、上限、常用选项或模型标签）、删除（改为 removed）。 |
| [src/capabilities/planning/trip-preferences-route.test.ts](../src/capabilities/planning/trip-preferences-route.test.ts) | 测试 | 经客户端模型验证列出、添加、去重、删除、归属和输入校验，以及每天上限。 |
| [src/capabilities/planning/trip-preference-repository-instance.ts](../src/capabilities/planning/trip-preference-repository-instance.ts) | 装配 | 偏好 repository 的生产实例。 |
| [src/capabilities/planning/planning-handoff-handler.ts](../src/capabilities/planning/planning-handoff-handler.ts) | 应用层 | 组织归属检查后的状态读取、准备度和偏好提取，保存偏好（替换上次的对话提取、跳过用户删除过的），返回禁止缓存的交接结果。 |
| [src/capabilities/planning/planning-handoff-route.test.ts](../src/capabilities/planning/planning-handoff-route.test.ts) | 测试 | 验证归属、准备度、偏好保存与替换、删除过的不回来、提取不可用时保留已存的、快照传递和客户端响应解析。 |
| [src/capabilities/planning/getting-there.ts](../src/capabilities/planning/getting-there.ts) | 应用层 | 1.2107：计划生成后补填一次出发地：请求校验（必须是带天地图坐标、在中国范围内的地点，交通选择四选一）；只对最新的成功运行和它的版本、出发地还空着、行程其他部分没改过时进行；依次写 TripState（出发地，交通方式没填时一并写）、更新版本的 TripState 和计划（只重算启程和回程，转场保留）、把运行的交接换成新的；重发同样的请求能补完中途失败；HTTP 映射（400/404/409/500）。不调用模型。；1.2115：出发地有、交通方式空着时可以只补交通方式（不能回 Workspace），保留已有的开车估算、只跑交通 Agent；每项只能填一次，已有的锁定；计划没有出发地时只补交通方式会被拒（`origin_required`） |
| [src/capabilities/planning/plan-weather-refresh.ts](../src/capabilities/planning/plan-weather-refresh.ts) | 应用层 | 2026-11-22：「重新查天气」：按城市重新查最新一版计划里景点的天气（只用已记住的城市中心，不新查天地图），有预报才重新配穿搭并写回同一版；路线和每天不变；没有日期、旅程变了、没计划或还是查不到时不写。 |
| [src/capabilities/planning/plan-weather-refresh.test.ts](../src/capabilities/planning/plan-weather-refresh.test.ts) | 测试 | 重新查到天气后同一版有预报和穿搭、行程不变；查不到、没日期、旅程变了、没计划时不写。 |
| [src/capabilities/planning/getting-there.test.ts](../src/capabilities/planning/getting-there.test.ts) | 测试 | 三处写入和只查启程回程、只能填一次与中途失败后补完、计划过期和没有计划、交通方式已有时忽略选择、接口状态码。；1.2115：只补交通方式、只写一次、不查天地图、用已保存出发地的 12306 城市名；没出发地时拒绝；都已填好时拒绝；都不填是坏请求 |
| [src/capabilities/planning/plan-run-handler.ts](../src/capabilities/planning/plan-run-handler.ts) | 应用层 | 四个接口的处理：校验交接和归属、与已保存 TripState 比对（409）、没有城市不建运行；开始或复用运行；回答问题（404/409/400 映射）；读取最新版本并判断是否过期；把运行事件写成 SSE（id 为 seq、心跳、重连间隔，运行开始等待回答时结束）。；第 2 步：被站点上限拒绝时回 `{ status: "limited", reason }`；第 3 步把访客和 IP 交给 `start` |
| [src/capabilities/planning/plan-run-service.ts](../src/capabilities/planning/plan-run-service.ts) | 应用层 | 在后台运行 plan-generation 工作流：同一份交接复用运行、等待中的运行或已保存的计划；把 Mastra 事件流转成进度事件、编号、立即推给页面并依次写库；运行暂停时标为 suspended；回答时认领、把答案存成偏好、用 resumeStream 从快照恢复并接着编号；8 分钟兜底时限（每段分别计时）；结束时记状态、错误码、用量和不含等待的用时；服务器重启留下的运行标为中断。1.2018：自写的答案先经 `labelAnswer`，原话存成偏好，要放弃的城市随恢复数据交给路线。；第 2 步：新开规划前查站点上限（总开关、Kimi 当天的钱、当天已新建的规划数），被拒回 `limited`；跑到一半 Kimi 被拒时错误码写 `daily_quota` / `paid_calls_paused`；第 3 步：按访客（数据库，失败不算）和按 IP（内存 24 小时，失败退回）的规划次数，被拒回 `guest_runs` / `address_runs` |
| [src/capabilities/planning/plan-run-service-instance.ts](../src/capabilities/planning/plan-run-service-instance.ts) | 装配 | 用 Postgres 的运行和偏好 repository、Mastra 注册的工作流组装 PlanRunService（第一次运行时才加载 Agent）。；第 2 步接上每天规划数和 Kimi 的拒绝判断；第 3 步接上访客和 IP 的规划次数 |
| [src/capabilities/planning/plan-run-repository-instance.ts](../src/capabilities/planning/plan-run-repository-instance.ts) | 装配 | 计划运行 repository 的 Postgres 实例。 |
| [src/capabilities/planning/plan-run-route.test.ts](../src/capabilities/planning/plan-run-route.test.ts) | 测试 | 经客户端模型验证开始运行与已保存计划、旅程变化 409、没有城市、错误映射、版本过期判断、SSE 按 Last-Event-ID 续传及页面按事件推出状态、调研每城一行而选点只留一行、每天照片的选择，以及时段分组和出处列表。 |

### 6.11b Agent（Mastra）

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/agents/README.md](../src/agents/README.md) | 文档（Agent 设计约定） | Agent 的主文档（英文）：已实现与计划分开写；试验结果与四条发现、Planner 的输入/运行/输出/代码校验/版本与过期、工具、预算、追踪与评估计划、部署与决策记录。docs 只链接到这里。 |
| [src/agents/index.ts](../src/agents/index.ts) | Agent 层 | Mastra 实例：注册 Scout Agent 和 plan-generation 工作流（真实提供方，用到时才创建；天地图客户端不重试）；`planGenerationDependencies` 供验证脚本替换部分依赖；存储用组合存储，只有工作流快照经 `@mastra/pg` 的 WorkflowsPG 存进 Neon 的 `mastra` schema，其余在内存，没有 DATABASE_URL 时全在内存；默认关闭发往 PostHog 的使用统计。；1.2117 接上 Open-Meteo 天气 |
| [src/agents/scout-agent.ts](../src/agents/scout-agent.ts) | Agent 层 | 1.0300 试验 Agent：用两个现有工具回答一个关于中国地点的问题，只为验证 Kimi 经 Mastra 调用工具；将被规划 Agent 取代，不在其上扩建。模型首次使用时才读取环境变量。 |
| [src/agents/planner/research-agent.ts](../src/agents/planner/research-agent.ts) | Agent 层 | 按已选城市进行首轮景点调研。Kimi 先按天数提名城市代表景点（只是提案），与点名景点每 3 个一组并行搜索核实，再由 Mastra 工具补查一次。单独结构化候选并核对来源和原文摘录，没有出处的提名不成卡。位置引用这一句写到了这座城市（全名或词干，如「迪庆」）就算在城里，模型填的城市名是区县（香格里拉）也不丢卡；否则模型填的城市名要是这座城市并出现在同一来源里（1.2015）。 用户点名的区域（如大理市）不当景点搜索，而是让提名集中在那里（1.2012）。；1.2113 第 1 步起第一次搜索先用博查，Agent 的补充搜索可以选 `search-city-deeper`（Kimi），仍然只有一次；1.2117：提取时模型顺便判断每个景点是否户外（`outdoor`，不需要引用） |
| [src/agents/planner/research-agent.test.ts](../src/agents/planner/research-agent.test.ts) | 测试（对应模块边界） | 用模拟模型和搜索结果验证提名与点名景点分组搜索、无出处提名被丢弃、模型不可用时的退路、只补查一次、10 城范围和证据校验。；1.2113 第 1 步：补充搜索可以走 Kimi，仍然只发一次 |
| [src/agents/transport/legs.ts](../src/agents/transport/legs.ts) | Agent 层（交通，纯代码） | 1.2103 起放在交通目录（1.2102 时叫 drive-legs）：同一天相邻、都已定位的两个景点，直线 1.2 公里内查步行（style 3）、更远查最快驾车（style 0），由代码按距离决定；步行分钟按 4.5 公里/小时从距离算（天地图的步行时间不是步行速度）；天地图说没路时记成 `mode: none`（直线、无时间）；先读缓存，每次最多 20 次查询，第一次失败即停、不重试。以后交通 Agent（高铁、机票）也放在这个目录。 |
| [src/agents/transport/legs.test.ts](../src/agents/transport/legs.test.ts) | 测试 | 按距离选步行或开车、步行时间、没路时如实记录、未定位景点断开、缓存优先、第一次拒绝后不再查。 |
| [src/agents/transport/transfers.ts](../src/agents/transport/transfers.ts) | Agent 层（交通，纯代码） | 1.2106：城市之间的开车估算，以后是交通 Agent 的兜底：每个地方查一次城市中心，每段查一次天地图驾车；单城行程的回程复用启程（反向），多城行程回程从最后一座城出发、另查；先读缓存，每次最多 24 次查询，第一次失败即停、不重试，剩下的段写「没查」。 |
| [src/agents/transport/transfers.test.ts](../src/agents/transport/transfers.test.ts) | 测试 | 多城的查询次数和顺序、单城回程复用、缓存命中不再查、失败即停、没找到 / 同城 / 没路、预算上限。 |
| [src/agents/transport/transport-agent.ts](../src/agents/transport/transport-agent.ts) | Agent 层（交通 Agent） | 1.2108：代码先定哪些段可以查火车（自驾不查；启程回程只在选了高铁或让 Meri 判断时查；城市之间都可以查，由 Agent 判断）和每段的出发时段；Mastra Agent 用 `search-trains` 工具决定查哪段、要不要换时段再查，直达查不到时可以用 `search-connection` 指定一个中转城市（1.2110，代码查两段再拼接）；每次最多 8 次查询；1.2111 起还能用 `search-flights` 按 Agent 给的城市代码查机票（启程回程在选了飞机或让 Meri 判断时、城市之间开车超过 6 小时时，每次最多 4 次）；选择可以是火车、飞机或开车，代码核对航班号是查到的；再单独一次结构化调用为每段选火车或开车、写一句理由；代码核对：选的车次必须是这一段查到的，启程回程按用户选的高铁至少给一趟，没有或无效的选择由代码选用时最短的一趟；每段最多展示 3 趟；模型不可用时各段保持开车估算。 1.2112：拆成查询加挑选（`findTransport`，结果存成可序列化的 findings）、是否提问（`transportQuestionFor`）和套用结果（`applyTransport`，可带回答）；允许提问时，绑定火车的启程回程可以查一次「对比航班」，但只在这段火车查过、最快超过 12 小时或没有火车时才真的查；挑选时这类段不再绑定火车，模型用 `askTraveller` 说要不要问；偏好里没提火车或飞机时代码照样问；没查到火车时直接用飞机、理由写明。；1.2113：航班上限改成按钱算（`maxVariflightFen`，默认每次规划 ¥2），调用前预留、没发出去的退回，每个航班结果带 `budgetLeftYuan`；直飞查不到时 `search-flight-connection` 按 Agent 给的中转城市查两段直飞、代码拼接；拼不出时 `suggest-flight-hubs` 问飞常准的中转城市；挑选时转机航班带中转城市、等待和是否换机场；1.2114：直飞查不到且能查火车时，`search-air-rail` 按 Agent 给的附近机场城市查一次机票、一次 12306 再拼接；选择可为 `air_rail`，没选时没有火车或它更快就由代码选 |
| [src/agents/transport/transport-agent.test.ts](../src/agents/transport/transport-agent.test.ts) | 测试 | 代码决定可查的段和时段、Agent 的选择被采用、编造的车次被拒、模型不可用时不变、查询预算与去重；1.2110 的中转：先直达后中转、第二段按到达那天查、有直达时拒绝中转；1.2111 的航班：哪些段能查、城市代码、编造的航班被拒、让 Meri 判断时选飞机、航班预算。 1.2112 的提问：两端合问、必问兜底、三种回答各自的结果、偏好让 Agent 决定不问或只问一段、对比航班只在火车超过 12 小时后才查、不允许提问时不查航班、没有火车时用飞机。；1.2113 的转机：拼两段、直飞查到或没查直飞时拒绝、中转城市兜底、预算不够时不查；1.2114：飞机转火车的拼接和兜底、没查直飞前拒绝、关了火车就没有这个工具、Agent 选它而不选 15 小时的火车 |
| [src/agents/planner/map-check.ts](../src/agents/planner/map-check.ts) | Agent 层（固定步骤） | 景点卡的天地图定位：每个有出处的景点查一次（每城最多 12 个），只认本市同名结果并记区县；1.2100 起也记经纬度（`mapCheck.point`），旧计划为 null；第一次失败即停止、不重试，其余保持未核实；使用定位缓存。；1.2116 加 `MapCheckStop`：一次规划里各城市共用的停止开关，任何一座城失败，所有城市都停 |
| [src/agents/planner/map-check.test.ts](../src/agents/planner/map-check.test.ts) | 测试 | 验证别省同名不算、景区后缀、停车场不算、失败即停、缓存命中、每城上限和缓存过期。；1.2116：一座城失败后，另一座城不再查 |
| [src/agents/planner/spot-weather.ts](../src/agents/planner/spot-weather.ts) | Agent 层（固定步骤） | 1.2117：一座城在行程日期的天气。定位到的景点用自己的坐标，2 km 内合并成一个点，没定位的用城市中心（转场共用的缓存，没有再按本次运行的停止开关查一次天地图）；一城一次请求；超出 16 天标「出发前再看预报」，没有日期不查，失败标不可用、计划照常 |
| [src/agents/planner/spot-weather.test.ts](../src/agents/planner/spot-weather.test.ts) | 测试 | 合并与城市中心、一城一次请求、超出范围、没有日期、失败、城市中心缓存和停止开关。 |
| [src/agents/planner/day-outfits.ts](../src/agents/planner/day-outfits.ts) | Agent 层 | 1.2117 穿衣：代码按天气定每天的基础款，再用一次 Kimi 调用给整趟行程补充（每天最多 4 样、带部位和理由）和一句提示；代码逐条检查；失败、超时（30 秒）或没有模型时只保留基础款，没有预报不调用 |
| [src/agents/planner/day-outfits.test.ts](../src/agents/planner/day-outfits.test.ts) | 测试 | 一次调用、补充的检查、没有日期的天不问、失败只留基础款、没有预报不调用。 |
| [src/agents/planner/plan-stays.ts](../src/agents/planner/plan-stays.ts) | Agent 层 | 1.2117 住宿：每段城市连住查一次 RollingGo，代码挑三档；偏好涉及预算、同行人、步行或避开的东西时，一次 Kimi 调用给每座城从查到的列表里挑一家并写理由（不在列表里的不收）；再查展示的酒店详情；查不到就显示「住宿待查」 |
| [src/agents/planner/plan-stays.test.ts](../src/agents/planner/plan-stays.test.ts) | 测试 | 没偏好不调模型、三档、有偏好的挑选和理由、挑了列表外的不收、搜索失败。 |
| [src/agents/planner/plan-food.ts](../src/agents/planner/plan-food.ts) | Agent 层 | 1.2117 吃什么：每座城 3 次 Kimi 搜索同时发、两座城同时查，每次 10 条（特色菜、居中景点附近的餐厅、老字号；不以湖这类大片区域为中心），去掉推广文章，一次 Kimi 调用摘录特色菜和餐厅（带原文），代码核对引用，再用天地图在景点 1.5 km 内核对餐厅（每城最多 8 家，失败即停）；两个独立见证才显示：地图上找到（一个网站也行）给地址，两个网站但地图没有放「文章里提到的」，只有一个网站又不在地图上的不显示；每座城记一条日志说明每家的去向 |
| [src/agents/planner/plan-food.test.ts](../src/agents/planner/plan-food.test.ts) | 测试 | 三次搜索、推广文章不给模型、一家上地图一家只在文章里、天地图失败即停、搜索全失败。 |
| [src/agents/planner/fixtures/food-search-lijiang-2026-11-21.json](../src/agents/planner/fixtures/food-search-lijiang-2026-11-21.json) | 测试样例 | 2026-11-21 真实搜索两次（丽江特色美食、古城附近餐厅）录下的结果，含两篇软文 |
| [src/agents/planner/fixtures/tianditu-zhazha-mixian-2026-11-21.json](../src/agents/planner/fixtures/tianditu-zhazha-mixian-2026-11-21.json) | 测试样例 | 同日天地图查「渣渣米线」的回答：只有张家口一家，丽江没有 |
| [src/agents/planner/plan-route.ts](../src/agents/planner/plan-route.ts) | Agent 层 | Plan Agent 路线：一次 Kimi 调用规划城市顺序、天数、每天重点区县和主题、放弃的城市，代码校验、重试一次、再按添加顺序兜底；允许时可以返回一个带选项的问题（只在第一次尝试、格式合法时采用；选项可写明放弃哪座城）；天数够时不许自行放弃城市，只有用户选了才可以；用户点名的区域（如大理市）作为重点区域交给模型；空的理由当作没有理由；两次尝试共 60 秒；每次尝试报告进度。1.2016：天数少于城市且没有兴趣或节奏偏好时必须提问，第一次没问就退回再答一次（仍不问则用第一次的路线）；偏好已说明想多看、能接受紧凑时不问「是否保留全部城市」；放弃同一城市的重复选项只留第一个。1.2018：想轻松（relaxed）且每城都排得下，但扣掉转场日后不用赶路的天少于城市数（3 城 3 天、3 城 4 天）时也必须提问，同样退回一次；退回后仍不问，由 `fallbackQuestion` 按模板自己提问（候选最少的城市排前面，中英文）。；1.2117：给模型看每城每天的天气，先就近、再照顾天气；代码按城市中心直线距离做绕路检查，超过最短顺序 30% 退回一次，仍超过就重排；同一次退回也管天气：30% 以内有坏天气更少的顺序就退回，仍不是就由代码改成那个顺序 |
| [src/agents/planner/plan-route.test.ts](../src/agents/planner/plan-route.test.ts) | 测试（对应模块边界） | 用模拟模型验证丽江大理 5 天的路线与转场日、两次不通过后的兜底、模型建不起来时不可用、问题只在允许且格式合法时返回、空理由不让路线失败、放弃城市的选项与用户选择、用户点名的区域进入提示。 |
| [src/agents/planner/plan-days.ts](../src/agents/planner/plan-days.ts) | Agent 层 | Plan Agent 选点：一城的各天一次 Kimi 调用，按短 ID 选景点、时段和时间锚点，代码校验、重试一次；没有候选的城市不调模型；模型把时间锚点写成单独的字符串也能读，格式不对的回答会再试一次（1.2013）；1.2117：给每天的当地天气、每个候选是否户外和它自己天气差的日子；户外景点排在天气差的一天、同城有更好的日子还有空位时，随第二次尝试退回一次，仍在就保留 |
| [src/agents/planner/plan-days.test.ts](../src/agents/planner/plan-days.test.ts) | 测试（对应模块边界） | 验证示范第一天和模型看到的定位信息、单城 7 天、带问题重试、保留第一次可用结果、模型不可用、转场日只排下午和没有候选。 |
| [src/agents/planner/day-photos.ts](../src/agents/planner/day-photos.ts) | Agent 层（固定步骤） | 每天一张照片：先当天景点再所在城市，不重复已用过的照片，没有新照片的那天不配图（1.2103）；选好一张就报告。 |
| [src/agents/planner/verify-spots.ts](../src/agents/planner/verify-spots.ts) | Agent 层（固定步骤） | 第二轮精查：每个景点一次 Kimi 搜索（4 个并行、整次最多 24 次），每城一次结构化调用把原文拆成营业时间、闭馆日、关闭日期范围、预约（扁平字段）、模糊通知；代码核对原文和值，丢掉对不上的。；1.2113 第 1 步：博查先查，代码看结果里有没有时间、预约、闭馆这类字样（`hasFactsFor`），没有的景点每座城交给模型一次，决定哪些用 Kimi 再查、用什么词；再查算在预算里，模型失败用固定查询词 |
| [src/agents/planner/verify-spots.test.ts](../src/agents/planner/verify-spots.test.ts) | 测试 | 用模拟搜索和模型验证只保留原文在来源里、值在原文里的事实，以及搜索预算和没有结果的景点。；1.2113 第 1 步：只有没查到事实的景点交给模型、湖不再查、模型失败用固定查询词、预算用完不再查 |
| [src/agents/planner/plan-test-fixtures.ts](../src/agents/planner/plan-test-fixtures.ts) | 测试辅助 | Plan Agent 与工作流测试共用的云南交接、丽江大理景点卡和按 schema 名应答的模拟模型（记录路线调用的提示和系统提示）。 |
| [src/agents/workflows/plan-generation.ts](../src/agents/workflows/plan-generation.ts) | Agent 层/工作流 | Generate plan 的 Mastra 工作流：读取范围 → 每城调研（foreach 两城并行）→ 天地图定位 → 路线（可暂停提问，恢复时把答案加进偏好再规划）→ 查转场（1.2106）→ 逐城选点 → 配图 → 保存版本；只导入和编排 planner 函数，用 writer 写进度事件；阶段摘要从步骤输出计算；1.2013 起按天选景点之后是验证阶段：verify-facts，再用 dountil 循环 verify-repair（代码换日、Plan Agent 只重排受影响的天、最多 2 轮）；1.2116 起每座城市在 `research-city` 里调研完就定位，`map-check` 只加上延后的城市并汇总；1.2117：每城定位之后查天气（`addCityWeather`），路线步骤取城市中心和出发地做绕路检查 |
| [src/agents/workflows/plan-generation.test.ts](../src/agents/workflows/plan-generation.test.ts) | 测试 | 用 Mastra 和内存 repository 真跑工作流：事件顺序与编号、逐城推送的天、天地图第一次失败即停、保存版本与用量、断线补发、同一交接共用运行和读取已存计划、模型不可用、超时、重启后标为中断；提问时暂停、错误回答被拒、只有一个回答生效、恢复后不重做调研、答案存为偏好并进入版本，单城不提问；选了「放弃某城」后恢复的路线只能放弃那一座；验证循环：关闭的站换日、改不了的天重排、点名景点记为当天关闭、整个阶段只有一行完成 |
| [src/agents/tools/resolve-place.ts](../src/agents/tools/resolve-place.ts) | Agent 工具 | 用工作区同一套地点核验（天地图）查一个中文地名，返回匹配地点（省/市/区、GCJ-02 坐标、是否景点）、最多 5 个候选或整省；不代表开放或可达。 |
| [src/agents/tools/web-search.ts](../src/agents/tools/web-search.ts) | Agent 工具 | 经 Bocha 搜索近期公告（封闭、预约、季节通行），最多 5 条，每条带来源和发布日期；结果只是线索，提供方失败只返回 unavailable，不暴露带密钥的 URL。 |
| [src/agents/tools/tools.test.ts](../src/agents/tools/tools.test.ts) | 测试（对应模块边界） | 验证地点结果的映射与 5 条上限、整省与失败状态，以及搜索 5 条上限、日期透传和失败降级。 |

### 6.12 外部集成：身份、模型、地图、搜索和日志

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/platform/identity/guest-identity.test.ts](../src/platform/identity/guest-identity.test.ts) | 测试（对应模块边界） | 验证既有 UUID 复用、缺失/非法 cookie 创建及 cookie 配置。 |
| [src/platform/identity/guest-identity.ts](../src/platform/identity/guest-identity.ts) | 基础设施端口/适配器 | 读取/验证 meri_guest_id cookie，必要时生成访客 UUID 和安全 cookie 配置。 |
| [src/platform/locale/locale-preference.ts](../src/platform/locale/locale-preference.ts) | 基础设施端口/适配器 | `meri_locale` cookie 名、按 Accept-Language 排序取中/英、读取偏好与写 cookie 的字符串；无服务端依赖，切换按钮共用。 |
| [src/platform/locale/locale-preference.test.ts](../src/platform/locale/locale-preference.test.ts) | 测试（对应模块边界） | 验证浏览器语言排序与权重、cookie 优先且坏值被忽略、cookie 字符串。 |
| [src/platform/locale/request-locale.ts](../src/platform/locale/request-locale.ts) | 基础设施端口/适配器 | 服务端从当前请求的 cookies/headers 取语言。 |
| [src/platform/llm/ai-sdk-kimi-client.test.ts](../src/platform/llm/ai-sdk-kimi-client.test.ts) | 测试（对应模块边界） | mock 验证 schema/历史转发、旧新 SDK 契约、非法/截断输出、超时/HTTP 错误及配置校验。 |
| [src/platform/llm/ai-sdk-kimi-client.ts](../src/platform/llm/ai-sdk-kimi-client.ts) | 基础设施端口/适配器 | Kimi 的 Vercel AI SDK 适配器，结构化输出、finish reason/usage 归一化、60 秒超时、零自动重试和日志。；第 2 步起从环境创建的客户端用 `kimiFetch` 计费 |
| [src/platform/llm/moonshot-chat-model.ts](../src/platform/llm/moonshot-chat-model.ts) | 基础设施端口/适配器 | 唯一构造 Kimi 模型的地方（关闭 thinking、默认 kimi-k2.6 与 api.moonshot.cn），结构化输出客户端和 Agent 共用；可从环境变量构造。；第 2 步起从环境创建的模型都用 `kimiFetch` 计费 |
| [src/platform/llm/moonshot-chat-model.test.ts](../src/platform/llm/moonshot-chat-model.test.ts) | 测试 | 2026-11-22：K2/K3 的请求体（K3 不发 thinking、发 reasoning_effort、输出上限至少 16000），以及 Mastra 工具循环在 K3 上把思考内容带回去 |
| [src/platform/llm/kimi-spend.ts](../src/platform/llm/kimi-spend.ts) | 基础设施/限额 | 第 2 步：Kimi 每天花多少钱。价格表（k2.6、k2.7、k3.1-pro、k3，表外的按最贵算）、按输入/输出/缓存命中 token 算分、读 JSON 和流式返回里的用量；`meteredKimiFetch` 调用前查总开关和当天余额，被拒回 403（带标记，`kimiRefusalOf` 能认出来），返回后记账；`kimiRefusalNow` 给规划说明停下的原因。 |
| [src/platform/llm/kimi-spend.test.ts](../src/platform/llm/kimi-spend.test.ts) | 测试 | 价格和缓存命中、两种缓存字段、记账后到上限拒绝、总开关、流式用量、经过 AI SDK 的错误仍能认出拒绝。 |
| [src/platform/llm/kimi-client.ts](../src/platform/llm/kimi-client.ts) | 基础设施端口/适配器 | StructuredOutputModelClient 端口及通用模型错误，同时保留旧 OpenAI SDK Kimi 实现；当前应用入口默认 AI SDK 客户端。 |
| [src/platform/location-provider/location-provider.ts](../src/platform/location-provider/location-provider.ts) | 基础设施端口/适配器 | 地点搜索端口与 success/failure 规范化结果，隔离高德响应格式。 |
| [src/platform/location-provider/location-suggestion-provider.ts](../src/platform/location-provider/location-suggestion-provider.ts) | 基础设施端口/适配器 | 输入建议端口及规范化错误类型。 |
| [src/platform/observability/logger.ts](../src/platform/observability/logger.ts) | 基础设施端口/适配器 | 共享 Pino logger 和事件名称，按环境配置日志级别/开发格式。 |
| [src/platform/observability/serialize-error.test.ts](../src/platform/observability/serialize-error.test.ts) | 测试（对应模块边界） | 验证错误正文、堆栈和 cause 中凭据脱敏。 |
| [src/platform/observability/serialize-error.ts](../src/platform/observability/serialize-error.ts) | 基础设施端口/适配器 | 序列化 message/stack/cause 等错误信息并移除提供方凭据。 |
| [src/platform/search/bocha-discovery-search.test.ts](../src/platform/search/bocha-discovery-search.test.ts) | 测试（对应模块边界） | mock 验证搜索请求、结果字段/数量、摘要回退、故障转换及缺密钥。；1.2113：到上限不调用、没有 key 不计数、规划读更长的页面 |
| [src/platform/search/bocha-discovery-search.ts](../src/platform/search/bocha-discovery-search.ts) | 基础设施端口/适配器 | 将 Bocha 网页规范化为最多 8 条 DiscoverySearchResult，构造环境适配器。；1.2113 起每次搜索计入博查每天的上限（没有 key 时不计），可以中途取消，Generate plan 每页读 550 字 |
| [src/platform/search/kimi-search-pro.ts](../src/platform/search/kimi-search-pro.ts) | 基础设施端口/适配器 | 用现有 Moonshot 配置调用联网搜索 Pro，最多返回五条来源及短摘录，区分无结果和请求故障。；1.2113 起每次搜索计入 Kimi 搜索每天的上限 |
| [src/platform/search/plan-search.ts](../src/platform/search/plan-search.ts) | 基础设施端口/适配 | 1.2113 第 1 步：Generate plan 的两种搜索：`search` 第一次搜索，默认 Kimi；`PLAN_SEARCH_PROVIDER=bocha` 时先用博查（每页读 550 字），出错或到上限改用 Kimi；`deep` 总是 Kimi，给 Agent 的补充搜索和第二轮核实再查。 |
| [src/platform/search/plan-search.test.ts](../src/platform/search/plan-search.test.ts) | 测试 | 博查先查、失败或到上限改用 Kimi、只用 Kimi 的开关、调用方放弃后不再转查。 |
| [src/platform/search/search-budgets.ts](../src/platform/search/search-budgets.ts) | 基础设施/限流 | 1.2113 第 1 步：博查（默认 500）和 Kimi 搜索（默认 500）每天全站的次数上限，计数存 `.cache`，并行搜索不排队；到上限抛 `daily_limit`，打一条日志。 |
| [src/platform/search/kimi-search-pro.test.ts](../src/platform/search/kimi-search-pro.test.ts) | 测试（对应模块边界） | 模拟请求，覆盖接口参数、来源去重、正文截断、空结果、缺密钥、取消和错误脱敏。 |
| [src/platform/place-photos/place-photo-provider.ts](../src/platform/place-photos/place-photo-provider.ts) | 基础设施/端口 | 照片查询（按名称或按区域国家级景点）接口与允许的照片主机列表。 |
| [src/platform/place-photos/photo-catalog.ts](../src/platform/place-photos/photo-catalog.ts) | 基础设施/索引 | 本地图集校验和匹配（条目可来自 Pixabay 或 Wikimedia Commons；Commons 条目必须有许可证、许可证链接和 Commons 文件页，署名带许可证名称，`catalogCredit` 控制在 120 字内）：明确地区与完整名称／显式别名同时命中；保留括号地区，不猜子串或后缀；`scenicFor` 单独登记行政区代表图且必须属于允许地区；未命中、配置不合法或歧义返回 null；返回同域路径、真实主题和作者署名。 |
| [src/platform/place-photos/catalog-photo-provider.ts](../src/platform/place-photos/catalog-photo-provider.ts) | 基础设施/适配器 | 天地图模式的照片适配器：读取并缓存本地索引，未命中时再读运行时已下载的照片（MediaPhotoStore：景点按地区 + 地标，市按同市已下载照片）；保留查询类型和地区；不请求外部 API；文件缺失或损坏按空目录处理。服务端渲染、封面、地点候选卡和已选地点照片都用它；`loadPhotoCatalog` 供署名页列出全部条目。 |
| [src/platform/place-photos/image-file.ts](../src/platform/place-photos/image-file.ts) | 基础设施/工具 | 从文件字节读出真实格式（JPEG／PNG／WebP）和宽高，不信 Content-Type；不合法返回 null。 |
| [src/platform/place-photos/image-file.test.ts](../src/platform/place-photos/image-file.test.ts) | 测试（对应模块边界） | 验证三种格式的尺寸读取，HTML、空文件、截断文件头和零宽度被拒。 |
| [src/platform/place-photos/photo-regions.ts](../src/platform/place-photos/photo-regions.ts) | 基础设施/数据 | 全部省级行政区和常见地级市的英文写法（含知名县名、景点名），常被混淆的国外地名（中英文，含与国内地名同字的釜山广安里、岘港），以及地区中文简称（大理白族自治州 → 大理）；用于从 tags 排除地点不符的照片和给搜索加地区。 |
| [src/platform/place-photos/pixabay-photo-match.ts](../src/platform/place-photos/pixabay-photo-match.ts) | 基础设施/规则 | 判断一条 Pixabay 结果能否当某地标的照片：地标任何一个名字对上即可（英文名有区分度的词都要出现、单复数视为同一个词；中文名整个出现在中文 tags 里；只是地区名的别名不算），中英文 tags 提到别的省/市或国外地点即拒绝（中文逐个 tag 读），必须表明在中国，原图至少 960 宽且横构图；按原因统计被拒条数；每个地标最多 3 个查询（英文、中文 `lang=zh`、别名或加地区）。 |
| [src/platform/place-photos/pixabay-photo-match.test.ts](../src/platform/place-photos/pixabay-photo-match.test.ts) | 测试（对应模块边界） | 验证泛词不算身份、原图页地址算上传者的词、跨省/跨市/国外拒绝、两市之间的峡谷、全泛词名称、迈泰奥拉误选（真实案例）、尺寸、排序和查询词，宽窄巷子中文 tags（真实案例 2680194）、别名与单复数、中文 tags 的地区冲突和"中国"、被拒原因计数、地区中文简称，以及逐个 tag 读地区（玄武湖, 南京 不是湖南）和只是地区名的别名不算景点名（Codex 验收复现的两例）。 |
| [src/platform/place-photos/remote-photo-finder.ts](../src/platform/place-photos/remote-photo-finder.ts) | 基础设施/端口 | 远程照片源（Wikimedia、Pixabay）共用的接口：found／none／unavailable 三种结果，每批卡片在每个源各开一份额度。 |
| [src/platform/place-photos/capped-body.ts](../src/platform/place-photos/capped-body.ts) | 基础设施/工具 | 按实际收到的字节读下载内容、超过上限就中断；Pixabay 和 Wikimedia 客户端共用。 |
| [src/platform/place-photos/wikimedia-client.ts](../src/platform/place-photos/wikimedia-client.ts) | 基础设施/适配器 | Wikidata SPARQL、Commons imageinfo 和 Commons 图片下载：不需要 key，每个请求带 Meri 的 User-Agent；最多同时 2 个、任意 60 秒不超过 40 次、遵守 429 的 Retry-After、超时；区分被拒（403）、限流和临时失败（含连不上）；把 Commons 的作者、许可证、许可证链接、非自由标记转成纯文字；只从 `thumb.wikimedia.org`、`upload.wikimedia.org` https 下载，最多两次同主机跳转、按实际字节截断。 |
| [src/platform/place-photos/wikimedia-photo-finder.ts](../src/platform/place-photos/wikimedia-photo-finder.ts) | 基础设施/用例 | 推荐卡远程补图的第一个源：先读已下载，再查名字是地标、沿 P131 位于卡片所在市（市又属于卡片的省）且有 P18 的 Wikidata 条目，按名称排序取图，读 Commons 许可证（只收 CC BY、CC BY-SA、CC0、公有领域，横构图），下载 500px 副本检查后发布，记录作者、许可证、条目；每批 12 次查询 / 8 次 Commons / 8 次下载 / 25 秒；"维基没有"按规则版本记 24 小时；任何失败停整批并暂停进程（连不上 10 分钟）；同一地标共用一次操作。 |
| [src/platform/place-photos/wikimedia-client.test.ts](../src/platform/place-photos/wikimedia-client.test.ts) | 测试（对应模块边界） | 验证一次查多个 Commons 文件时按请求时的文件名对回（Commons 会改写大小写和下划线）、没有的文件不返回、作者转纯文字、许可证链接改 https、带 User-Agent、超过 50 个报错。 |
| [src/platform/place-photos/wikimedia-photo-finder.test.ts](../src/platform/place-photos/wikimedia-photo-finder.test.ts) | 测试（对应模块边界） | 验证找到后带许可证保存、署名、重启 0 请求，没有条目算 none 并缓存一天，连不上不缓存且暂停进程，许可证不合格换下一张，限流停整批，每批查询上限，只从维基图片主机下载，查询把地标限定在市和省内且名字无法跳出字符串，条目排序，以及许可证、作者、构图、格式的拒绝规则。 |
| [src/platform/place-photos/pixabay-client.ts](../src/platform/place-photos/pixabay-client.ts) | 基础设施/适配器 | Pixabay 搜索与下载：一次一个请求、排队上限、任意 60 秒不超过 80 次（下载也算）并遵守 `X-RateLimit-Remaining`、超时；区分被拒（400/401/403）、限流（429 或自己的上限）和临时失败；单条坏结果只丢那一条；只从 Pixabay 主机 https 下载、最多两次同主机跳转、按实际字节截断；密钥只出现在请求里。 |
| [src/platform/place-photos/pixabay-client.test.ts](../src/platform/place-photos/pixabay-client.test.ts) | 测试（对应模块边界） | 验证密钥不外泄、只留用到的字段、三类失败、主机与跳转限制、字节上限、非图片、坏结果只丢一条、排队上限、每分钟上限和 Pixabay 剩余次数。 |
| [src/platform/place-photos/pixabay-photo-finder.ts](../src/platform/place-photos/pixabay-photo-finder.ts) | 基础设施/用例 | 推荐卡的远程补图：先读已下载，再按查询词（含 `lang`，每次 50 条）搜索（24 小时磁盘缓存，空结果也缓存）、按规则选候选、下载检查、发布；found／none／unavailable 三种结果；"没有合适的图"按规则版本记 24 小时并写未配图记录；同一地标共用一次操作；每批 20 次搜索 / 10 次下载 / 45 秒，每个地标最多下载 2 个；限流和被拒时整批停止并暂停进程；临时失败 10 分钟内不重查；日志记查询词、条数和被拒原因。 |
| [src/platform/place-photos/pixabay-photo-finder.test.ts](../src/platform/place-photos/pixabay-photo-finder.test.ts) | 测试（对应模块边界） | 验证找到后重启 0 请求、并发共用一次、none 和空结果当天不重查、网络或下载失败不算 none 且暂停后再试、限流停整批、每批搜索上限、每个地标最多下载 2 个、未配图记录的内容。 |
| [src/platform/place-photos/media-photo-store.ts](../src/platform/place-photos/media-photo-store.ts) | 基础设施/存储 | 运行时照片的磁盘存储（`MERI_MEDIA_DIR/place-photos/`）：Pixabay 和 Wikimedia 两种图片与来源记录（最后写，代表发布完成；维基的带作者、原图页、许可证和 Wikidata 条目，Pixabay 可带作者主页）、地标查找结果、按市的照片索引、"没有合适的图"（带规则版本，Pixabay 和维基分开记）、未配图记录和搜索缓存（定期清理过期）；按精确文件名读取已发布记录供署名跳转使用；先写临时名再改名；容量上限（默认 500 MB）满了不收新图、不删旧图；生产环境未配置时为 null。 |
| [src/platform/place-photos/media-photo-store.test.ts](../src/platform/place-photos/media-photo-store.test.ts) | 测试（对应模块边界） | 验证新实例（如重启后）读回照片和查找结果、没有来源记录的文件不提供、只认 Meri 的文件名、容量上限、搜索缓存 24 小时含空结果和过期清理、生产环境必须配置目录、"没有合适的图"按规则版本且两个源分开、维基照片按自己的文件名提供并按时间列出、按市索引、未配图记录排序，以及共用照片提供方先图集后已下载且不连网络。 |
| [src/platform/place-photos/media-photo-route.test.ts](../src/platform/place-photos/media-photo-route.test.ts) | 测试（对应模块边界） | 验证运行中新发布的照片立即可访问、响应头、路径穿越和记录文件 404、没有存储时 404。 |
| [src/platform/place-photos/pixabay-test-fixtures.ts](../src/platform/place-photos/pixabay-test-fixtures.ts) | 测试辅助 | 只给测试用：假 JPEG、Pixabay 结果、按脚本回答并计数的 fetch；不连网络。 |
| [src/platform/place-photos/photo-catalog.test.ts](../src/platform/place-photos/photo-catalog.test.ts) | 测试（对应模块边界） | 验证地区错配、无地区拒绝、明确别名、括号信息、歧义及不合法配置、实际文件及哈希不重复、景区完整名称和跨地区景点；错误旧图不再提供，替代图用新 URL；香格里拉使用松赞林寺代表图而非同义名；离线查询不调用 fetch。 |
| [src/app/photo-credits/source/[file]/route.ts](../src/app/photo-credits/source/%5Bfile%5D/route.ts) | HTTP 接口层 | 照片来源解析：按精确文件名读取图集或已发布运行时来源记录，Pixabay 优先作者主页、缺少时用原图页，Commons 使用原图文件页；`?format=json` 返回 `{url, artist, source}` 供确认弹窗预览，其他请求 307 跳转；只允许两家来源指定的 HTTPS 页面，不缓存结果，无效文件和目标 404，旧卡片不需重写。 |
| [src/platform/place-photos/photo-credit-route.test.ts](../src/platform/place-photos/photo-credit-route.test.ts) | 测试（对应模块边界） | 验证图集和运行时的 Pixabay 署名跳作者主页、旧记录回退原图，以及 Commons 跳原图页；未发布文件／未知文件／路径穿越／不安全目标拒绝。 |
| [public/photos/shimei-bay-wanning-25170960.jpg](../public/photos/shimei-bay-wanning-25170960.jpg) | 静态资源 | 万宁市代表图石梅湾，500×333，Zhangmoon618，Wikimedia Commons，CC BY-SA 3.0；明确登记万宁市／万宁为允许地区和代表图地区。 |
| [scripts/catalog-cities.ts](../scripts/catalog-cities.ts) | 维护数据 | 图集要覆盖的城市，按批次登记：省、全称、简称、英文名（同音城市带省份）、1–2 个最常被拍的景点（中英文名）。第一批江浙沪 25 城（杭州已有代表图），第二批云南、四川、重庆、西藏 34 城（已有代表图的不列），第三批 `south` 广东 21、广西 14、海南 4、福建 9 城（1.0634），第四批 `north` 天津、河北 11、山西 11、内蒙古 11 城（呼伦贝尔已有，1.0635），第五批 `central` 河南 17、湖北 13、湖南 13、江西 10、安徽 15 城（张家界、上饶、黄山已有，1.0637），第六批 `northeast` 辽宁 14、吉林 7、黑龙江 13 城（白山、延边已有，1.0638），第七批 `northwest` 陕西 10、甘肃 13、宁夏 5、青海 6、新疆 12 城（酒泉、海南州、海北州、昌吉、阿勒泰已有，1.0639），第八批 `shandong-guizhou` 山东 15、贵州 9 城（泰安已有，1.0640），`misses` 是前几批没配上图的 20 城换一批搜索词（另外的景点，加主城区和县，1.0641）。 |
| [scripts/build-city-catalog.ts](../scripts/build-city-catalog.ts) | 维护工具 | 按城市补图集代表图：`fetch` 两个图源都抓（1.0638 起），审核页上 Pixabay 的候选排前面、Wikidata 的在后面对照；Wikidata（1.0634 起；每城 1 次查询，名字是城市或它的景点、按 P131 落在这座城市里、城市又属于它的省的条目的 P18，中文名同时按 zh / zh-hans / zh-cn 查），用 `WikimediaClient` 每 50 个文件 1 次读 Commons 作者和许可证（只收 CC BY / CC BY-SA / CC0 / 公有领域，竖图留下但标出），下载 500px 副本，每城最多 4 张；Pixabay 用运行时同一套规则每城找最多 3 张（`--views` 城市景色模式只用 Pixabay、只搜城市名，每城最多 4 张）；都下载到 `.cache/catalog-review/` 并生成审核页（不碰 public/photos；图片以 data URL 嵌在页面里，单独打开也能看，已进图集的候选标"✓ 已选"）；`review` 不联网，按已下载的候选重新生成审核页；Wikidata 查询每次最多等 30 秒，没回答的城市等 5 秒再问一次，仍不行就记下跳过、不让整批停下（Pixabay 搜索同样处理，1.0641 起）；`apply` 按人工挑好的 picks.json（图片 ID、照片说明、文件名）复制进 public/photos 并登记 regions / scenicFor，Commons 照片另记 source / license / licenseUrl。走产品的 WikimediaClient（每分钟不超过 40 次）和 PixabayClient（每分钟不超过 80 次），满了等一分钟，Pixabay 搜索缓存 24 小时，不输出密钥。 |
| [scripts/photo-misses.ts](../scripts/photo-misses.ts) | 维护工具 | 读 `MERI_MEDIA_DIR`（未设时 `.cache/media`）的未配图记录，按次数列出景点、搜索词、返回条数和被拒原因，用来挑选值得人工补进图集的景点；只读本地，不请求 Pixabay、不改文件。 |
| [scripts/fetch-place-photos.ts](../scripts/fetch-place-photos.ts) | 开发验证工具 | 青海湖／天山天池／松赞林寺固定审核后的 Pixabay ID，其余用关键词与 tags 筛候选；成功响应缓存 24 小时（不含密钥的参数哈希），HTTP 失败立即停止并脱敏输出；按实际 JPEG／PNG／WebP 格式、带图片 ID 的文件名下载。新图或更换来源清空地区，核对后才启用；同源刷新保留配置。支持指定地名和 --refresh。 |
| [public/photos/](../public/photos) | 静态资源 | 预下载照片与带来源、明确地区、别名、行政区代表图配置的 photos.json；由本站提供文件。1.0628 起按城市分批补代表图（第一批江浙沪 18 张，第二批云南、四川、重庆、西藏 13 张；1.0632 用 Wikimedia Commons 补了 Pixabay 没有的 20 个城市，共 84 条；1.0634 补镇江和第三批华南 45 城，1.0635 补第四批华北 33 城，1.0637 补第五批华中 65 城，1.0638 补第六批东北 32 城，1.0639 补第七批西北 42 城，1.0640 补山东、贵州 22 城，1.0641 用新搜索词补前几批漏掉的 17 城，后补万宁市石梅湾，共 342 条，Commons 作者／原图页／许可证／许可链接均保存在 photos.json，卡片署名打开外部原图页）。运行时下载的照片不写进这里（生产模式启动后 public 不再变化），而是在 `MERI_MEDIA_DIR`。不代表全国覆盖或逐张审核完成。青海湖和天山天池已更换来源；香格里拉市使用独立景点松赞林寺代表图。 |
| [public/photos/qinghai-lake-2631421.jpg](../public/photos/qinghai-lake-2631421.jpg) | 静态资源 | 本轮查看来源与画面后选用的青海湖畔油菜花照片，Pixabay 2631421，作者 Ponyo-；替代旧茶卡盐湖错图。 |
| [public/photos/tianchi-xinjiang-2077003.jpg](../public/photos/tianchi-xinjiang-2077003.jpg) | 静态资源 | 本轮查看来源与画面后选用的新疆天山天池照片，Pixabay 2077003，作者 ccp877；与长白山天池使用不同照片。 |
| [public/photos/songzanlin-4424995.jpg](../public/photos/songzanlin-4424995.jpg) | 静态资源 | 松赞林寺照片，Pixabay 4424995，作者 samyo；作为香格里拉市／迪庆州明确登记的代表图，旧香格里拉丽江雪山文件已撤下。 |
| [src/platform/http/request-pacer.ts](../src/platform/http/request-pacer.ts) | 基础设施/工具 | 给外部请求排队、按最小间隔放行（可暂停、可插队），天地图用它避开限流；原本写给高德，1.0702 移除高德时搬到这里。 |
| [src/platform/http/request-pacer.test.ts](../src/platform/http/request-pacer.test.ts) | 测试（对应模块边界） | 验证按间隔依次放行、暂停会拦住已在排队的请求、插队的请求排第一。 |
| [src/platform/tianditu/tianditu-fetch.ts](../src/platform/tianditu/tianditu-fetch.ts) | 基础设施/适配器 | 天地图请求客户端：独立排队（开始间隔 ≥300ms，复用 amap-fetch 的通用 pacer）、超时、key 只拼进天地图地址；418 或防火墙 HTML 页视为拒绝、不重试；**429 视为限流**，整队暂停 1 秒、被拒请求排队首、最多重试 3 次（`retryRateLimit: false` 时不重试，景点定位用）；失败只返回固定原因，不含 URL 和 key。1.2102 起有 `getXml`：驾车服务回 XML（标成 text/html），只把 418 和 HTML 拦截页当拒绝。 |
| [src/platform/tianditu/tianditu-drive.ts](../src/platform/tianditu/tianditu-drive.ts) | 外部集成适配器 | 1.2102：天地图驾车规划（`/drive`，style 0 最快）：读 XML 的 `distance`（公里）、`duration`（秒）和 `routelatlon`（`经度,纬度;…`），沿路坐标抽稀到最多 200 个；缺字段就是没有路线，不猜。 |
| [src/platform/tianditu/tianditu-drive.test.ts](../src/platform/tianditu/tianditu-drive.test.ts) | 测试 | 按 2026-11-16 实测格式解析、缺字段、抽稀、请求参数、失败原因、车程缓存。 |
| [src/platform/flight/variflight.ts](../src/platform/flight/variflight.ts) | 外部集成适配器 | 1.2111：飞常准远程 Aviation MCP，第一次查航班时才连接，key 放在 `X-API-Key`；`getFlightPriceByCities` 查两城航班：每行按北京时间算出发和到达、取最便宜的舱位和票价、剩余座位、机建燃油、经停和代码共享；每行的机场城市必须是这一段的两座城，否则整批丢弃并告诉 Agent 代码错了；每天 40 次、失败暂停 30 分钟、余额用完暂停到第二天。；1.2113 起按钱计数（每次查价、每次中转查询各 25 分），每天上限默认 ¥20，当天花费存 `.cache/flight-credits.json`；`createVariflightHubs` 调 `getFlightTransferInfo`，只读出当天、起止城市对的两段中转里的中转城市（最多 3 个，没有票价） |
| [src/platform/flight/variflight.test.ts](../src/platform/flight/variflight.test.ts) | 测试 | 用录下的真实返回：北京时间和跨天、最便宜舱位和机建燃油、城市不符和代码格式、没有航班 / 失败 / 余额用完 / 关闭。；1.2113：按分计数、用录下的上海→迪庆中转返回读出成都，别的日期和城市不算 |
| [src/platform/flight/python-literal.ts](../src/platform/flight/python-literal.ts) | 外部集成适配器 | 1.2111：读取飞常准返回的 Python 字典文本（单引号、True/False/None、元组），只读数据，任何其他东西都报错，不执行。 |
| [src/platform/flight/python-literal.test.ts](../src/platform/flight/python-literal.test.ts) | 测试 | 各种字面量、拒绝代码和多余文本、完整读取录下的真实返回。 |
| [src/platform/flight/fixtures/variflight-sha-ljg-2026-12-21.txt](../src/platform/flight/fixtures/variflight-sha-ljg-2026-12-21.txt) | 测试数据 | 2026-11-18 实测录下的飞常准返回：上海→丽江 2026-12-21 的 5 个直飞航班。 |
| [src/platform/flight/fixtures/variflight-train-ljg-dali-2026-11-20.txt](../src/platform/flight/fixtures/variflight-train-ljg-dali-2026-11-20.txt) | 测试数据 | 2026-11-18 实测：飞常准 Tripmatch `searchTrainTickets` 丽江→大理 11-20，24 行（含大理州其他县的车站），带票价和余票张数。 |
| [src/platform/flight/fixtures/variflight-train-ljg-dali-2026-12-21.txt](../src/platform/flight/fixtures/variflight-train-ljg-dali-2026-12-21.txt) | 测试数据 | 同上 12-21：「暂无数据」，和 12306 一样受约 15 天预售期限制。 |
| [src/platform/flight/fixtures/variflight-air-rail-sha-ljg-2026-12-21.txt](../src/platform/flight/fixtures/variflight-air-rail-sha-ljg-2026-12-21.txt) | 测试数据 | 同日实测：`getFlightAndTrainTransferInfo` 上海→丽江，只返回 3 个单段航班（没有火车段、没有价格、目的地误写鹤庆县、混入 12-22）。 |
| [src/platform/flight/fixtures/variflight-flight-transfer-sha-dig-2026-12-21.txt](../src/platform/flight/fixtures/variflight-flight-transfer-sha-dig-2026-12-21.txt) | 测试数据 | 同日实测：`getFlightTransferInfo` 上海→迪庆，经成都中转（MU9181 + MU5780），没有价格，同一组航班重复 12-21、22、23 三天。 |
| [src/platform/http/daily-budget.ts](../src/platform/http/daily-budget.ts) | 基础设施/限流 | 1.2111 从 rail-budget 抽出：按次付费或易被封的提供方共用的每日预算：一次一个请求、按间隔排队、按北京时间每天计数（存 `.cache`）、失败后暂停（可指定时长）。；1.2113 起上限按各自的单位计（12306 按请求、飞常准按分），每天第一次到上限打一条 warn 日志，写明服务、用了多少、上限多少和北京时间 0 点恢复；第 2 步加 `DailyMeter`：调用前看余额（`room`），调用后记账（`record`） |
| [src/platform/http/daily-budget.test.ts](../src/platform/http/daily-budget.test.ts) | 测试 | 到每天上限只打一次日志、金额按服务自己的单位写；调用后才知道花费时先看余额再记账。 |
| [src/platform/http/client-address.ts](../src/platform/http/client-address.ts) | 基础设施/限流 | 第 3 步：访客的 IP，只认我们自己的代理写的请求头：x-real-ip，其次 x-forwarded-for 的最后一个（第一个客户端能伪造）；不信任 CDN 的请求头；本机没有时共用一个桶。 |
| [src/platform/http/visitor-limits.ts](../src/platform/http/visitor-limits.ts) | 基础设施/限流 | 第 3 步：每个 IP 每小时调用 Kimi 的次数（11 个接口共用，默认 120）、每位访客每小时的聊天句数（默认 30），内存计数、重启清零；`kimiRequestRefusal` 超出时回 429 `too_many_requests`。 |
| [src/platform/http/visitor-limits.test.ts](../src/platform/http/visitor-limits.test.ts) | 测试 | 同一个 IP 换 cookie、换接口都算、伪造的 x-forwarded-for 不起作用、一小时后恢复；访客的聊天句数只算聊天。 |
| [src/platform/rail/rail-mcp.ts](../src/platform/rail/rail-mcp.ts) | 外部集成适配器 | 1.2108：12306-mcp 0.3.10 的子进程，`@mastra/mcp` 客户端；只有 `RAIL_PROVIDER=12306` 时可用，第一次调用 `railTools()` 才启动并一直复用，进程退出时关掉；导入和 `next dev` 不启动；启动本身向 12306 发 3 个请求。 |
| [src/platform/rail/rail-budget.ts](../src/platform/rail/rail-budget.ts) | 基础设施/限流 | 1.2108（1.2111 起用共享的 daily-budget）：全进程一个队列，请求间隔 ≥3 秒；每天（北京时间）最多 100 个请求，计数存 `.cache/rail-requests.json`；失败后暂停 30 分钟。 |
| [src/platform/rail/rail-budget.test.ts](../src/platform/rail/rail-budget.test.ts) | 测试 | 每日上限、跨天重新计数、失败后的暂停。 |
| [src/platform/rail/rail-names.ts](../src/platform/rail/rail-names.ts) | 外部集成适配器 | 1.2108：行政区名转 12306 的城市短名（大理白族自治州 → 大理），点选出发地的地区取城市（上海市闵行区 → 上海）。 |
| [src/platform/rail/rail-names.test.ts](../src/platform/rail/rail-names.test.ts) | 测试 | 自治州、市、直辖市和地区的转换。 |
| [src/platform/rail/rail-12306.ts](../src/platform/rail/rail-12306.ts) | 外部集成适配器 | 1.2108：查两座城某天的火车：车站名来自子进程自己的车站表（不发请求），只有查余票发请求（每次 2 个，记入每日上限）；超出预售期改查同星期几的参考日期；JSON 结果用 zod 校验；出发站和到达站必须属于这两座城，到达时间由出发加历时计算；「有回应没数据」算没车，真正失败才暂停。 |
| [src/platform/rail/rail-variflight.ts](../src/platform/rail/rail-variflight.ts) | 外部集成适配器 | 2026-11-22：飞常准 Tripmatch `searchTrainTickets` 查火车（上线默认）：一次 ¥0.25，走飞常准的钱数预算；只留两座城自己的车站、按出发时段过滤、去重；「暂无数据」算没有车次；失败暂停、不重试。和 12306 适配器同一种回答 |
| [src/platform/rail/rail-variflight.test.ts](../src/platform/rail/rail-variflight.test.ts) | 测试 | 用录下的丽江→大理样例：只留两城车站、时段、去重、预售期外、计费调用、失败暂停，以及 `RAIL_PROVIDER` 的选择 |
| [src/platform/rail/rail-12306.test.ts](../src/platform/rail/rail-12306.test.ts) | 测试 | 车站核对和跨午夜、参考日期、没有车站 / 没有数据 / 失败的区分、关闭时不启动、过去的日期。 |
| [src/platform/tianditu/tianditu-city-point.ts](../src/platform/tianditu/tianditu-city-point.ts) | 外部集成适配器 | 1.2106：按名字查一次城市中心：只读天地图的行政区回答（`area`），名字必须是问的那个（或只多行政区后缀，如 大理 → 大理白族自治州）；POI 列表、别的地名、境外都算没找到，不猜；不重试。实测 2026-11-17：丽江市 → 156530700，(100.225258, 26.8583)。 |
| [src/platform/tianditu/tianditu-city-point.test.ts](../src/platform/tianditu/tianditu-city-point.test.ts) | 测试 | 行政区回答的名字核对、短名加后缀、POI 和无结果、坏坐标、拒绝不重试。 |
| [src/platform/tianditu/city-point-memory.ts](../src/platform/tianditu/city-point-memory.ts) | 基础设施/缓存 | 1.2106：城市中心缓存 180 天（`.cache/tianditu-city-points.json`，最多 2000 条，没找到和失败不存）。 |
| [src/platform/tianditu/drive-leg-memory.ts](../src/platform/tianditu/drive-leg-memory.ts) | 基础设施/缓存 | 1.2102：两点之间的车程缓存 30 天（`.cache/tianditu-drive-legs.json`，最多 2000 条，失败不存），键为两点各取 5 位小数。 |
| [src/platform/tianditu/spot-location-memory.ts](../src/platform/tianditu/spot-location-memory.ts) | 基础设施/缓存 | 景点定位缓存：按「省|市|景点」存天地图的判断（找到：区县、地图名和 1.2100 起的经纬度，30 天，之前存的没有经纬度的条目读时作废、重查一次；没找到：7 天），`.cache/tianditu-spot-locations.json`，上限 2000 条，失败不存。 |
| [src/platform/tianditu/classification-memory.ts](../src/platform/tianditu/classification-memory.ts) | 基础设施/缓存 | 分类搜索缓存：按「行政区 + 类别」把 `queryType 13` 的一页存到 `.cache/tianditu-classification.json`，7 天、上限 50 页、只存真实答案（拒绝和空结果不存）；文件损坏按空缓存处理；写入用临时文件 + 改名，写失败不影响本次查询。 |
| [src/platform/tianditu/classification-memory.test.ts](../src/platform/tianditu/classification-memory.test.ts) | 测试（对应模块边界） | 验证只存真实答案、重启后仍在、7 天过期、超 50 页淘汰最旧、文件损坏当空缓存、统计顺序。 |
| [scripts/cache-stats.ts](../scripts/cache-stats.ts) | 开发验证工具 | 打印分类缓存的每个键、条数、缓存时间和剩余天数；`--clear` 清空。不需要 key。 |
| [src/platform/tianditu/tianditu-location-provider.ts](../src/platform/tianditu/tianditu-location-provider.ts) | 基础设施端口/适配器 | 天地图地点核验：普通搜索 30 条（`show: "2"`）、市/区县结果用逆地理编码补上级（省级不调，且拿不到 addressComponent 算故障）、天地图类别码映射景点 / 其他、直辖市补市级；以景区后缀结尾的名字也算景点；整个景区排前并去掉借名的店；页首没有整个景区时用页面前两个区县做分类搜索——**一次请求取 `风景名胜` 和 `山` 两类**（响应按分类名分组，单类别时是顶层 `pois`，两种形状都解析），已缓存的类别不再请求；**分类页被拒绝时整次核验返回 failure**，绝不退回去用全国页的同名外地地点当成功结果；返回前 5 条，坐标 CGCS2000。没有热度信号：Wikidata 那一步 2026-10-23 移除（大陆服务器连不上），同名的外地景点可能排在前面。 |
| [src/platform/tianditu/tianditu-location-provider.test.ts](../src/platform/tianditu/tianditu-location-provider.test.ts) | 测试（对应模块边界） | 验证类别映射、POI / 行政区规范化、一次搜索只发一个请求、市/省答案的逆地理编码取舍、逆地理编码失败算故障、整个景区排前、两类合成一次请求且按分组解析、缓存命中不再请求、分类被拒绝算失败、无数据 / 拒绝 / 空查询、key 只发给天地图。 |
| [src/platform/tianditu/tianditu-input-tips-provider.ts](../src/platform/tianditu/tianditu-input-tips-provider.ts) | 基础设施端口/适配器 | 天地图建议词搜索（queryType 4）做输入提示：gbCode 去掉 156 变成六位 adcode，行政区文字放 region，坐标 CGCS2000。 |
| [src/platform/tianditu/tianditu-input-tips-provider.test.ts](../src/platform/tianditu/tianditu-input-tips-provider.test.ts) | 测试（对应模块边界） | 验证建议规范化、空结果、超时、拒绝与畸形响应。 |
| [src/platform/map-providers.ts](../src/platform/map-providers.ts) | 基础设施装配 | 创建地点核验、输入提示和照片提供方：1.0702 起只有天地图（`TiandituLocationProvider`、`TiandituInputTipsProvider`），照片用 CatalogPhotoProvider（本地图集 + 已下载照片）；createRemotePhotoFinders 在有媒体目录时返回进程内唯一的远程补图器（先 Wikimedia，有 PIXABAY_API_KEY 再加 Pixabay），只有推荐卡照片接口使用。 |
| [src/platform/provider-limits.ts](../src/platform/provider-limits.ts) | 基础设施配置 | 1.2113：花钱或要客气使用的服务的上限，集中一处，可在 `.env.local` 设：`VARIFLIGHT_MAX_YUAN_PER_PLAN`（默认 ¥2）、`VARIFLIGHT_MAX_YUAN_PER_DAY`（默认 ¥20）、`RAIL_MAX_SEARCHES_PER_PLAN`（默认 8）、`RAIL_MAX_REQUESTS_PER_DAY`（默认 100）；不是正数时用默认值并打日志。每次调用的价格是服务方的事实，留在各自适配器里。；1.2113 第 1 步加 `BOCHA_MAX_CALLS_PER_DAY`（默认 500）和 `KIMI_MAX_SEARCHES_PER_DAY`（默认 500）；第 2 步加 `KIMI_MAX_YUAN_PER_DAY`（默认 ¥40）、`PLAN_RUNS_PER_DAY`（默认 15）和总开关 `paidCallsEnabled`（`PAID_CALLS_ENABLED=false` 才关），Kimi 搜索默认改为 300；第 3 步加 `PLAN_RUNS_PER_GUEST_PER_DAY`（3）、`PLAN_RUNS_PER_IP_PER_DAY`（6）、`CHAT_TURNS_PER_GUEST_PER_HOUR`（30）、`KIMI_REQUESTS_PER_IP_PER_HOUR`（120），全站规划默认改为 30、Kimi 搜索 450；1.2117 加 `OPEN_METEO_MAX_CALLS_PER_DAY`（默认 2000） |
| [src/platform/provider-limits.test.ts](../src/platform/provider-limits.test.ts) | 测试 | 默认值、元换成分、无效值用默认。 |
| [src/platform/hotel/rollinggo.ts](../src/platform/hotel/rollinggo.ts) | 外部集成适配器 | 1.2117 住宿：RollingGo 酒店 MCP，只查不订（key 只有 4 个查询工具）；`HOTEL_PROVIDER=rollinggo` 加 key 才用；每天上限 `ROLLINGGO_MAX_CALLS_PER_DAY`、间隔 1 秒、失败暂停 10 分钟不重试；解析搜索和酒店详情，逐家校验，不保存带推广参数的预订链接，图片只认它自己的图片域名 |
| [src/platform/hotel/rollinggo.test.ts](../src/platform/hotel/rollinggo.test.ts) | 测试 | 用录下的搜索和详情解析、坏数据和外域图片、请求格式、关闭/上限/失败暂停。 |
| [src/platform/hotel/hotel-photos.ts](../src/platform/hotel/hotel-photos.ts) | 基础设施配置 | RollingGo 的图片域名，给 next.config 的图片白名单和适配器的网址检查共用；`hotelPreviewUrl` 只用酒店编号和日期拼出 RollingGo 公开酒店页的链接，不带推广参数 |
| [src/platform/hotel/hotel-photos.test.ts](../src/platform/hotel/hotel-photos.test.ts) | 测试 | 预览链接只含酒店和日期、跨年的退房日期。 |
| [src/platform/hotel/fixtures/rollinggo-search-lijiang-gucheng-2026-11-28.json](../src/platform/hotel/fixtures/rollinggo-search-lijiang-gucheng-2026-11-28.json) | 测试样例 | 2026-11-20 免费调用一次录下：丽江古城 2 km 内 5 家酒店（86–910 元/晚参考价） |
| [src/platform/hotel/fixtures/rollinggo-static-2437027.json](../src/platform/hotel/fixtures/rollinggo-static-2437027.json) | 测试样例 | 同日录下的一家酒店详情：电话、商圈、入住退房时间、设施、5 张图 |
| [src/platform/weather/weather-forecast.ts](../src/platform/weather/weather-forecast.ts) | 基础设施端口 | 1.2117：Meri 的天气端口，几个坐标 + 一段日期 → 每个点每天的预报或失败原因；不抛错、不重试。以后可换和风，也给 Jev 当工具 |
| [src/platform/weather/open-meteo.ts](../src/platform/weather/open-meteo.ts) | 外部集成适配器 | 1.2117：Open-Meteo（免费、无 key、非商用）。一城的点一次请求，7 个每日变量，Asia/Shanghai；zod 校验；每天上限按 Open-Meteo 的算法计数（`.cache/open-meteo-calls.json`），间隔 0.2 秒；网络断开或超时 2 秒后重试一次、不暂停，Open-Meteo 报错或返回格式不对才暂停 10 分钟 |
| [src/platform/weather/open-meteo.test.ts](../src/platform/weather/open-meteo.test.ts) | 测试 | 用录下的样例解析、请求格式、计数、上限、失败暂停、坏格式和断网。 |
| [src/platform/weather/met-norway.ts](../src/platform/weather/met-norway.ts) | 外部集成适配器 | 2026-11-21：MET Norway Locationforecast（免费、无 key、CC BY 4.0），Open-Meteo 的替补。一个点一次请求（坐标 4 位小数、带 User-Agent），把逐小时和每 6 小时的数据按北京时间汇总成每天；中国境内缺的阵风（平均风速 ×1.5）、降雪（雪天或零下的降水，1 mm ≈ 1 cm）和降水概率（改给有雨的小时数）由代码算出并标 `estimated`；覆盖不到 12 小时的首尾两天不要；每天上限 `.cache/met-norway-calls.json`，出错或格式不对暂停 10 分钟，不重试 |
| [src/platform/weather/met-norway.test.ts](../src/platform/weather/met-norway.test.ts) | 测试 | 用录下的大理古城和玉龙雪山样例解析，估算阵风、降雪、雨小时数和雷暴，符号对应 WMO 代码，请求格式、失败与暂停 |
| [src/platform/weather/fallback-forecast.ts](../src/platform/weather/fallback-forecast.ts) | 基础设施组合 | 2026-11-21：先问主提供方（Open-Meteo），没有预报才问替补（MET Norway）；两个都失败时保留主提供方的原因 |
| [src/platform/weather/fallback-forecast.test.ts](../src/platform/weather/fallback-forecast.test.ts) | 测试 | 主提供方成功不问替补；各种失败都改问替补；都失败保留主提供方原因 |
| [src/platform/weather/fixtures/met-norway-dali-2026-11-21.json](../src/platform/weather/fixtures/met-norway-dali-2026-11-21.json) | 测试样例 | 2026-11-21 两次免费调用录下：大理古城（2041 m，22–25 日小雨）和玉龙雪山（4838 m，24 日大雪）到 12-01 的完整预报 |
| [src/platform/weather/fixtures/open-meteo-lijiang-2026-11-21.json](../src/platform/weather/fixtures/open-meteo-lijiang-2026-11-21.json) | 测试样例 | 2026-11-20 真实调用一次录下：丽江古城和玉龙雪山 11-21 至 11-27 的每日预报（含 11-24 雷阵雨 22.5 mm、雪山 11-22 阵风 64 km/h） |
| [src/platform/map-providers.test.ts](../src/platform/map-providers.test.ts) | 测试（对应模块边界） | 验证只用天地图和本地图集、页面照片不联网、只有推荐卡照片接口能调用远程补图。 |
| [src/platform/search/bocha-web-search.test.ts](../src/platform/search/bocha-web-search.test.ts) | 测试（对应模块边界） | mock 验证 POST/envelope、webPages/images 区段、缺密钥不请求及错误脱敏。 |
| [src/platform/search/bocha-web-search.ts](../src/platform/search/bocha-web-search.ts) | 基础设施端口/适配器 | 共享 Bocha Web Search HTTP 请求、响应 envelope 检查、日期转换、超时/网络/API 错误脱敏。 |
| [src/platform/search/discovery-search.ts](../src/platform/search/discovery-search.ts) | 基础设施端口/适配器 | DiscoverySearch 端口、旅程搜索 query、失败降级空上下文和规范化错误。 |

### 6.13 持久化端口、适配器与数据库 schema

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/platform/persistence/database/db.ts](../src/platform/persistence/database/db.ts) | 数据库基础设施 | 检查 DATABASE_URL，按 host 选驱动：localhost/127.0.0.1 用 `pg` + `drizzle-orm/node-postgres` 长连接池，其余用 Neon HTTP；两个驱动的仓库操作一致，类型边界在此一次断言并注明原因。 |
| [src/platform/persistence/database/db.test.ts](../src/platform/persistence/database/db.test.ts) | 测试（对应模块边界） | 用子进程检查驱动选择而不建立连接：localhost / 127.0.0.1 / LOCALHOST 走 pg，neon.tech 与 localhost.example.com 仍走 Neon，缺失或空白 DATABASE_URL 报错。 |
| [src/platform/persistence/database/schema/index.ts](../src/platform/persistence/database/schema/index.ts) | 数据库基础设施 | 导出当前全部表的 schema（含 catalog_entries），不包含旧 user actions 表。 |
| [src/platform/persistence/database/schema/trip-messages.ts](../src/platform/persistence/database/schema/trip-messages.ts) | 数据库基础设施 | trip_messages 表和角色 enum，正文/presentation/时间戳及 Trip 外键级联。 |
| [src/platform/persistence/database/schema/trip-preferences.ts](../src/platform/persistence/database/schema/trip-preferences.ts) | 基础设施/schema | trip_preferences 表、四个 enum（含 1.2017 的 pace）、(trip_id, status) 索引和「只有节奏偏好有方向」的 CHECK 约束。 |
| [src/platform/persistence/database/schema/plan-runs.ts](../src/platform/persistence/database/schema/plan-runs.ts) | 基础设施/schema | plan_runs、plan_run_events、plan_versions 三张表和 plan_run_status enum、外键、唯一约束与索引。 |
| [src/platform/persistence/database/schema/catalog-entries.ts](../src/platform/persistence/database/schema/catalog-entries.ts) | 基础设施/schema | catalog_entries 表（RAG 第 1 步）：目录条目、固定和原始标签、historical/source_refs（只存不展示）、不定维度的 embedding（第 3 步再定维度）；(prefecture, kind) 索引、name 和 aliases_text 的 pg_trgm 索引，kind/confidence 检查约束。 |
| [src/platform/persistence/database/schema/trip-states.ts](../src/platform/persistence/database/schema/trip-states.ts) | 数据库基础设施 | trip_states 表，以 Trip ID 为主键，JSONB 保存状态，删除 Trip 时级联。 |
| [src/platform/persistence/database/schema/trips.ts](../src/platform/persistence/database/schema/trips.ts) | 数据库基础设施 | trips 表及 idea/planning enum，保存 ID/owner/status/时间戳。 |
| [src/platform/persistence/in-memory/in-memory-trip-message-repository.test.ts](../src/platform/persistence/in-memory/in-memory-trip-message-repository.test.ts) | 测试（对应模块边界） | 验证完整对话顺序、独立原话/助手消息及重复身份处理。 |
| [src/platform/persistence/in-memory/in-memory-trip-message-repository.ts](../src/platform/persistence/in-memory/in-memory-trip-message-repository.ts) | 基础设施端口/适配器 | 内存消息仓库，存取真实 turn、按时间读取、稳定 ID 去重及助手消息 presentation 替换。 |
| [src/platform/persistence/in-memory/in-memory-trip-repository.test.ts](../src/platform/persistence/in-memory/in-memory-trip-repository.test.ts) | 测试（对应模块边界） | 验证内存创建/查询和 owner 可见性。 |
| [src/platform/persistence/in-memory/in-memory-trip-repository.ts](../src/platform/persistence/in-memory/in-memory-trip-repository.ts) | 基础设施端口/适配器 | 内存 TripRepository，测试中保留 owner 读写隔离。 |
| [src/platform/persistence/in-memory/in-memory-trip-state-repository.test.ts](../src/platform/persistence/in-memory/in-memory-trip-state-repository.test.ts) | 测试（对应模块边界） | 验证创建/读取、替换更新及内存比较更新。 |
| [src/platform/persistence/in-memory/in-memory-trip-state-repository.ts](../src/platform/persistence/in-memory/in-memory-trip-state-repository.ts) | 基础设施端口/适配器 | 内存 TripStateRepository，实现存取和 CAS，供应用测试模拟状态冲突。 |
| [src/platform/persistence/in-memory/in-memory-plan-run-repository.ts](../src/platform/persistence/in-memory/in-memory-plan-run-repository.ts) | 基础设施端口/适配器 | 内存 PlanRunRepository，供工作流测试和验证脚本使用；含 1.2107 的 `fillPlanFacts`。；第 2 步加 `countRunsStartedSince` |
| [src/platform/persistence/journey-summary-repository.ts](../src/platform/persistence/journey-summary-repository.ts) | 持久化端口/读模型 | JourneySummary 读模型（含已保存的省/市/景点，供封面照片用）和按 owner 列表接口，不作为可变状态仓库。 |
| [src/platform/persistence/postgres/postgres-journey-summary-repository.test.ts](../src/platform/persistence/postgres/postgres-journey-summary-repository.test.ts) | 测试（对应模块边界） | mock 验证权威状态投影、owner 过滤、缺状态、certainty 保留及已保存地点的投影。 |
| [src/platform/persistence/postgres/postgres-journey-summary-repository.ts](../src/platform/persistence/postgres/postgres-journey-summary-repository.ts) | 基础设施端口/适配器 | 关联 Trip 与当前状态，按 owner 查询并投影列表摘要（含已保存的地点结构），不使用旧 Trip 字段。 |
| [src/platform/persistence/postgres/postgres-trip-message-repository.test.ts](../src/platform/persistence/postgres/postgres-trip-message-repository.test.ts) | 测试（对应模块边界） | mock 验证完整 turn 单次插入、原话/助手 presentation、时间顺序和重复 ID 处理。 |
| [src/platform/persistence/postgres/postgres-trip-preference-repository.ts](../src/platform/persistence/postgres/postgres-trip-preference-repository.ts) | 基础设施/存储 | Drizzle 实现：替换对话提取是先删后插两步、没有事务；删除只改状态；读出的时间转成 ISO（交接 schema 要求）。 |
| [src/platform/persistence/postgres/postgres-trip-preference-repository.test.ts](../src/platform/persistence/postgres/postgres-trip-preference-repository.test.ts) | 测试 | 用数据库替身验证先删后插、只改状态、错误包装，以及 Postgres 时间格式读回为 ISO。 |
| [src/platform/persistence/postgres/postgres-plan-run-repository.ts](../src/platform/persistence/postgres/postgres-plan-run-repository.ts) | 基础设施/存储 | Drizzle 实现：建运行、按条件在 running 与 suspended 之间切换（认领回答）、只结束仍在运行的行、找最近运行、按 seq 写读事件、按旅程递增版本号、补填出发地时更新版本和运行的交接（1.2107 `fillPlanFacts`，先版本后运行）；读出的交接、事件、计划、TripState 和偏好都重新校验，时间转成 ISO。；第 2 步加 `countRunsStartedSince`（按 `started_at` 计数）；第 3 步加 `countOwnerRunsStartedSince`（连 `trips` 按主人数当天成功、在跑、在等回答的规划） |
| [src/platform/persistence/postgres/postgres-trip-message-repository.ts](../src/platform/persistence/postgres/postgres-trip-message-repository.ts) | 基础设施端口/适配器 | PostgreSQL 消息插入/读取，完整双边 turn 单次 insert，稳定 ID 重试及 presentation 校验；按 id+trip+assistant 替换 presentation（推荐卡照片，唯一的消息更新）。 |
| [src/platform/persistence/postgres/postgres-trip-repository.test.ts](../src/platform/persistence/postgres/postgres-trip-repository.test.ts) | 测试（对应模块边界） | mock 数据库验证字段映射、owner 条件、列表/删除及错误 cause。 |
| [src/platform/persistence/postgres/postgres-trip-repository.ts](../src/platform/persistence/postgres/postgres-trip-repository.ts) | 基础设施端口/适配器 | PostgreSQL Trip 增查删适配，显式字段映射、owner 过滤和错误包装。 |
| [src/platform/persistence/postgres/postgres-trip-state-repository.test.ts](../src/platform/persistence/postgres/postgres-trip-state-repository.test.ts) | 测试（对应模块边界） | mock 数据库验证状态语义、旧数据读取、JSONB CAS 条件/冲突及异常。 |
| [src/platform/persistence/postgres/postgres-trip-state-repository.ts](../src/platform/persistence/postgres/postgres-trip-state-repository.ts) | 基础设施端口/适配器 | 状态 JSONB 存取、领域读取校验/兼容，原始 JSONB 条件 CAS 与错误包装。 |
| [src/platform/persistence/trip-message-repository.ts](../src/platform/persistence/trip-message-repository.ts) | 持久化端口/读模型 | 消息存储端口，定义完整 turn、单消息、列表及助手消息 presentation 替换能力。 |
| [src/platform/persistence/trip-preference-repository.ts](../src/platform/persistence/trip-preference-repository.ts) | 基础设施/接口 | 偏好 repository：列出、替换对话提取、新增、标为删除。 |
| [src/platform/persistence/plan-run-repository.ts](../src/platform/persistence/plan-run-repository.ts) | 基础设施/接口 | 计划运行 repository：运行（含暂停与恢复的状态切换）、事件和计划版本的读写契约；1.2107 加补填事实后的版本与交接更新。；第 2 步加 `countRunsStartedSince` |
| [src/platform/persistence/trip-repository.ts](../src/platform/persistence/trip-repository.ts) | 持久化端口/读模型 | Trip 存储端口，定义创建、owner-scoped 查询/删除等，不写具体 SQL。 |
| [src/platform/persistence/trip-state-repository.ts](../src/platform/persistence/trip-state-repository.ts) | 持久化端口/读模型 | TripState 存储端口，包含读取/更新及可选 compareAndUpdate；生产实现使用 CAS。 |

### 6.14 数据库迁移和元数据

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [drizzle/0000_initial_trips.sql](../drizzle/0000_initial_trips.sql) | 数据库演进/工具元数据 | 历史初始 Trip 表与生命周期 enum；旧旅程字段后续迁移移除。 |
| [drizzle/0001_support_incomplete_trip_ideas.sql](../drizzle/0001_support_incomplete_trip_ideas.sql) | 数据库演进/工具元数据 | 历史迁移：放宽 destination/日期非空限制并添加 origin，支持不完整想法。 |
| [drizzle/0002_fearless_mach_iv.sql](../drizzle/0002_fearless_mach_iv.sql) | 数据库演进/工具元数据 | 创建 trip_states JSONB 表与级联外键，建立独立权威状态。 |
| [drizzle/0003_misty_maginty.sql](../drizzle/0003_misty_maginty.sql) | 数据库演进/工具元数据 | 增加 owner_guest_id，为历史行回填访客 UUID 并设为非空。 |
| [drizzle/0004_persist_trip_messages.sql](../drizzle/0004_persist_trip_messages.sql) | 数据库演进/工具元数据 | 创建 trip_messages、角色 enum 和 Trip 级联外键。 |
| [drizzle/0005_remove_legacy_trip_state.sql](../drizzle/0005_remove_legacy_trip_state.sql) | 数据库演进/工具元数据 | 删除 Trip 根表旧 name/origin/destination/日期列及日期约束，避免双重状态来源。 |
| [drizzle/0006_backfill_default_journey_names.sql](../drizzle/0006_backfill_default_journey_names.sql) | 数据库演进/工具元数据 | 仅对缺 name 且旧 destination.value 已知的状态回填系统默认旅程名。 |
| [drizzle/0007_trip_user_actions.sql](../drizzle/0007_trip_user_actions.sql) | 数据库演进/工具元数据 | 历史迁移：创建显式推荐 action 表和外键；不是当前 schema 的实体。 |
| [drizzle/0008_trip_message_presentation.sql](../drizzle/0008_trip_message_presentation.sql) | 数据库演进/工具元数据 | 为助手消息增加 JSONB presentation，用于刷新恢复卡片。 |
| [drizzle/0009_drop_trip_user_actions.sql](../drizzle/0009_drop_trip_user_actions.sql) | 数据库演进/工具元数据 | 定义删除旧 trip_user_actions 表，当前代码以请求入口标记推荐来源；未在本次执行迁移。 |
| [drizzle/0010_trip_preferences.sql](../drizzle/0010_trip_preferences.sql) | 迁移 | 创建 trip_preferences 表、enum、外键和索引。 |
| [drizzle/0011_plan_runs.sql](../drizzle/0011_plan_runs.sql) | 迁移 | 创建 plan_runs、plan_run_events、plan_versions 和 plan_run_status enum、外键、唯一约束和索引。 |
| [drizzle/0012_plan_run_suspended.sql](../drizzle/0012_plan_run_suspended.sql) | 迁移 | `plan_run_status` 加 `suspended`。 |
| [drizzle/0013_trip_preference_pace.sql](../drizzle/0013_trip_preference_pace.sql) | 迁移 | 1.2017：`trip_preference_pace` enum、`trip_preferences.pace` 可空列和 CHECK 约束。 |
| [drizzle/0014_catalog_entries.sql](../drizzle/0014_catalog_entries.sql) | 迁移 | RAG 第 1 步：开启 pg_trgm 和 vector 扩展，创建 catalog_entries 表、(prefecture, kind) 索引和两个三元组索引。 |
| [drizzle/meta/0000_snapshot.json](../drizzle/meta/0000_snapshot.json) | 数据库演进/工具元数据 | 第 0 次迁移生成的历史 schema 快照（public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0001_snapshot.json](../drizzle/meta/0001_snapshot.json) | 数据库演进/工具元数据 | 第 1 次迁移生成的历史 schema 快照（public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0002_snapshot.json](../drizzle/meta/0002_snapshot.json) | 数据库演进/工具元数据 | 第 2 次迁移生成的历史 schema 快照（public.trip_states、public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0003_snapshot.json](../drizzle/meta/0003_snapshot.json) | 数据库演进/工具元数据 | 第 3 次迁移生成的历史 schema 快照（public.trip_states、public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0004_snapshot.json](../drizzle/meta/0004_snapshot.json) | 数据库演进/工具元数据 | 第 4 次迁移生成的历史 schema 快照（public.trip_messages、public.trip_states、public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0005_snapshot.json](../drizzle/meta/0005_snapshot.json) | 数据库演进/工具元数据 | 第 5 次迁移生成的历史 schema 快照（public.trip_messages、public.trip_states、public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0006_snapshot.json](../drizzle/meta/0006_snapshot.json) | 数据库演进/工具元数据 | 第 6 次迁移生成的历史 schema 快照（public.trip_messages、public.trip_states、public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0010_snapshot.json](../drizzle/meta/0010_snapshot.json) | 数据库演进/工具元数据 | 第 10 次迁移生成的完整 schema 快照（含 trip_preferences），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0011_snapshot.json](../drizzle/meta/0011_snapshot.json) | 数据库演进/工具元数据 | 第 11 次迁移生成的完整 schema 快照（含计划运行三张表），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0012_snapshot.json](../drizzle/meta/0012_snapshot.json) | 数据库演进/工具元数据 | 第 12 次迁移生成的完整 schema 快照，用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/0015_catalog_embedding_1024.sql](../drizzle/0015_catalog_embedding_1024.sql) | 迁移 | RAG 第 3 步：embedding 改成 vector(1024)，加 HNSW 余弦索引。 |
| [drizzle/meta/0015_snapshot.json](../drizzle/meta/0015_snapshot.json) | 数据库演进/工具元数据 | 第 15 次迁移生成的完整 schema 快照。 |
| [drizzle/meta/0014_snapshot.json](../drizzle/meta/0014_snapshot.json) | 数据库演进/工具元数据 | 第 14 次迁移生成的完整 schema 快照（含 catalog_entries）。 |
| [drizzle/meta/_journal.json](../drizzle/meta/_journal.json) | 数据库演进/工具元数据 | Drizzle 迁移顺序记录，包含 0000–0009；不等于某环境已全部执行。 |

### 6.15 人工验证脚本

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [scripts/verify-destination-conversation-turns.ts](../scripts/verify-destination-conversation-turns.ts) | 开发验证工具 | 用多轮样例人工检查真实模型的地点/偏好解释、推荐意图、中国范围、错别字保留、天气/准备度/单问题规则、已有状态保护及回复语言和英文地名翻译（20–27 为英文界面或跨语言输入），需要模型配置。 |
| [scripts/verify-agent-tools.ts](../scripts/verify-agent-tools.ts) | 开发验证工具 | 用真模型和真提供方跑试验 Agent 的 4 个问题，打印每一步的工具调用与结果、耗时、token 用量和回复；第 4 个验证"工具 + 结构化输出"必须用单独的结构化步骤，需要模型、高德和 Bocha 配置。 |
| [scripts/verify-plan-research.ts](../scripts/verify-plan-research.ts) | 开发验证工具 | 读入 PlanHandoff，用 Kimi 模型和联网搜索 Pro 跑首轮调研，输出各城市状态和景点卡 JSON。 |
| [scripts/verify-plan-draft.ts](../scripts/verify-plan-draft.ts) | 开发验证工具 | 读入 PlanHandoff 和可选的调研结果 JSON（有则代替调研），用真实提供方跑一次 plan-generation 工作流（运行、版本和 Mastra 快照都在内存），每个进度事件到达时打印一行 JSON；遇到提问自动选第一个选项并恢复；最后输出运行记录和计划。 |
| [scripts/eval-plan.ts](../scripts/eval-plan.ts) | 评测工具 | 1.2014：读 `evals/plan/cases/` 的用例（可按 ID 前缀筛选，`--repeat N` 覆盖次数，`--label` 命名结果文件），按计划页的方式逐个跑真实 plan-generation 工作流（内存仓库和快照），提问按用例指定的选项回答；每次运行记下指标和断言结果，写入 `evals/plan/results/<日期>-<label>.json`。某次运行天地图定位停下（`map.checked` 为 stopped）或 Kimi 不可达就终止整批，不重试。 |
| [scripts/eval-plan-score.ts](../scripts/eval-plan-score.ts) | 评测工具 | 用例格式（`evalCaseSchema`）、从用例生成 PlanHandoff、从事件和计划算指标（时长、各阶段耗时、token、调研/验证搜索、天地图查询、重试、覆盖、检查结果、预约、冲突、修复轮数），以及代码判定的断言；纯函数，无 IO。 |
| [scripts/eval-plan-score.test.ts](../scripts/eval-plan-score.test.ts) | 测试 | 生成 handoff 的日期推算、指标来自事件和计划、周一闭馆/缺预约/空天各自判不通过、没有计划时给出原因。 |
| [scripts/import-catalog.ts](../scripts/import-catalog.ts) | 维护工具 | 把 `CATALOG_DIR`（私有仓库根目录）的 `data/cities/*.ndjson` 导入 catalog_entries：先全部校验，有问题一行不写；一个事务里按 id 写入、删掉目录里已没有的条目，可重复执行；`catalog_version` 记私有仓库提交号（有未提交改动加 -dirty）；`--dry-run` 只报增改删数。连任何 Postgres（VPS 经 SSH 隧道）。 |
| [scripts/embed-catalog.ts](../scripts/embed-catalog.ts) | 维护工具 | 给 catalog_entries 里没有向量的行算向量（百炼，每次 20 条），写回时核对 search_text 没变；可重复执行，`--dry-run` 只报数。 |
| [scripts/embed-catalog-batches.ts](../scripts/embed-catalog-batches.ts) | 维护工具 | 按每次请求的条数分批。 |
| [scripts/embed-catalog-batches.test.ts](../scripts/embed-catalog-batches.test.ts) | 测试 | 分批的顺序、最后一批、空、非法批大小。 |
| [scripts/import-catalog-read.ts](../scripts/import-catalog-read.ts) | 维护工具 | 导入的纯逻辑：逐行 JSON + zod + 文件名与省市一致 + 标签归并 + id 不重复（都是问题），related 指向不存在的条目（警告）；计算增改删数。 |
| [scripts/import-catalog-read.test.ts](../scripts/import-catalog-read.test.ts) | 测试 | 坏 JSON、字段错、城市不符、重复 id、未知标签、缺失的 related、文件名不对、增改删计数。 |
| [scripts/eval-retrieval.ts](../scripts/eval-retrieval.ts) | 评测工具 | RAG 检索评测：读 `evals/retrieval/cases.json`，每组算一次查询向量，五种排法（热门度、只用关键词、只用向量、向量+关键词 RRF、和热门度轮流取）各排一遍，打印并保存 hit@4、recall@4、recall@12。约 ¥0.001 一次。 |
| [scripts/eval-retrieval-score.ts](../scripts/eval-retrieval-score.ts) | 评测工具 | 用例格式、四种排法、打分和平均。 |
| [scripts/eval-retrieval-score.test.ts](../scripts/eval-retrieval-score.test.ts) | 测试 | 四种排法的顺序、指标计算、用例文件合法。 |
| [evals/retrieval/city-cases.json](../evals/retrieval/city-cases.json) | 评测用例 | RAG 第 4 步城市推荐 11 组：一句话和应排进前 4 的城市；空列表表示目录应该不给城市（极光、量子物理），退回网页搜索。 |
| [evals/retrieval/cases.json](../evals/retrieval/cases.json) | 评测用例 | 27 组（第 22–27 组直接点名景点：名字、别名或错字）；原 21 组（14 座城，2 组英文）：城市、旅行者原话、应该排在前面的目录景点（2026-11-26 merlin 同意）。 |
| [evals/retrieval/results/](../evals/retrieval/results/) | 评测结果 | 每次检索评测一个 JSON：提交、日期、向量模型、四种排法的总分和每组前 4 名。 |
| [evals/plan/cases/](../evals/plan/cases/) | 评测用例 | 11 个典型旅程：单城、两城、三城天数不够、三城有偏好、点名区县、北京周一故宫、无天数预览、哈尔滨冬季、英文界面、跨省加步行上限、三城刚够但想慢玩（1.2016）；每个写明覆盖什么和断言。 |
| [evals/plan/results/](../evals/plan/results/) | 评测结果 | 每次批量运行一个 JSON：提交、日期、每次运行的指标、断言、提问和每天的景点，用来做版本之间的对比。 |
| [scripts/verify-workspace-location-tool.ts](../scripts/verify-workspace-location-tool.ts) | 开发验证工具 | 人工调用真实 Workspace 解释器，检查地点意图结构；文件名保留旧 tool 命名，当前不是开放式工具 Agent。 |

### 6.16 网站静态资源

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [public/backgrounds/home-v2-landscape.png](../public/backgrounds/home-v2-landscape.png) | 展示资源 | 当前首页 landscape 背景，由 meri-app-shell.module.css 引用。 |
| [public/backgrounds/meri-world-desktop.png](../public/backgrounds/meri-world-desktop.png) | 展示资源 | 当前 Journey 列表背景，由 trips.module.css 引用。 |
| [public/backgrounds/workspace-alpine-day.png](../public/backgrounds/workspace-alpine-day.png) | 展示资源 | 当前 Workspace 背景、旅程缩略图和右侧封面共用的山景图。 |
| [public/brand/meri-app-icon-1024.png](../public/brand/meri-app-icon-1024.png) | 展示资源 | layout/manifest 使用的应用安装图标。 |
| [public/brand/meri-favicon.svg](../public/brand/meri-favicon.svg) | 展示资源 | layout 使用的网站 favicon。 |
| [public/brand/meri-home-mountain.png](../public/brand/meri-home-mountain.png) | 展示资源 | 首页和 Workspace header 使用的山形品牌图。 |
| [public/brand/meri-lockup.svg](../public/brand/meri-lockup.svg) | 展示资源 | Workspace 使用的组合品牌标识。 |
| [public/brand/meri-mark.svg](../public/brand/meri-mark.svg) | 展示资源 | Journey 列表等处使用的独立图形标识。 |
| [public/brand/meri-wordmark.svg](../public/brand/meri-wordmark.svg) | 展示资源 | Journey 列表/缺状态页面使用的文字标识。 |
| [public/companion/bear/bear-sprites.json](../public/companion/bear/bear-sprites.json) | 展示资源 | 小熊精灵图帧清单：帧尺寸、每个动画所在行、帧数和每帧毫秒；由生成脚本写出。 |
| [public/companion/bear/bear-sprites.png](../public/companion/bear/bear-sprites.png) | 展示资源 | 小熊营地小桌精灵图：9 个动画、42 帧，1 倍尺寸透明背景；由生成脚本写出。 |
| [public/companion/workspace-red-panda/idle.webp](../public/companion/workspace-red-panda/idle.webp) | 展示资源 | 工作区小熊猫，空手静态海报。 |
| [public/companion/workspace-red-panda/map.webp](../public/companion/workspace-red-panda/map.webp) | 展示资源 | 工作区小熊猫，持图静态海报。 |
| [public/companion/workspace-red-panda/take-out.webm](../public/companion/workspace-red-panda/take-out.webm) | 展示资源 | 工作区小熊猫，拿出地图。 |
| [public/companion/workspace-red-panda/look.webm](../public/companion/workspace-red-panda/look.webm) | 展示资源 | 工作区小熊猫，低头看地图。 |
| [public/companion/workspace-red-panda/stow.webm](../public/companion/workspace-red-panda/stow.webm) | 展示资源 | 工作区小熊猫，折好并收回地图。 |
| [public/companion/workspace-red-panda/walk.webm](../public/companion/workspace-red-panda/walk.webm) | 展示资源 | 工作区小熊猫，悠闲折返。 |
| [public/companion/workspace-red-panda/drink.webm](../public/companion/workspace-red-panda/drink.webm) | 展示资源 | 工作区小熊猫，单杯喝水并放回。 |
| [public/companion/workspace-red-panda/cookie.webm](../public/companion/workspace-red-panda/cookie.webm) | 展示资源 | 工作区小熊猫，坐下吃一块饼干并起身。 |
| [public/companion/home-v2-companion.png](../public/companion/home-v2-companion.png) | 展示资源 | 聊天头像和 Workspace Companion 使用的角色图。 |
| [public/companion/red-panda/front.webp](../public/companion/red-panda/front.webp) | 展示资源 | 中立朝向静态降级图，与最终二维网格中心格一致。 |
| [public/companion/red-panda/look.json](../public/companion/red-panda/look.json) | 展示资源 | 17×17 姿态图集的编译清单、240px 单元和眼部锚点。 |
| [public/companion/red-panda/look.webp](../public/companion/red-panda/look.webp) | 展示资源 | 289 格透明小熊猫转头图集，4080×4080，119 原生格与170离线补帧格。 |

### 6.17 设计和素材制作

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [assets/companion/red-panda/red-panda-body-no-paws-v2.png](../assets/companion/red-panda/red-panda-body-no-paws-v2.png) | 设计/角色素材 | 基于睁眼原图编辑的去前爪版 PNG（1254×1254，真实 Alpha），用于胸毛补丁；头部毛发仍有细节重绘，不保证像素级一致，尚未接入界面。 |
| [assets/companion/red-panda/red-panda-open-eyes-v1.png](../assets/companion/red-panda/red-panda-open-eyes-v1.png) | 设计/角色素材 | 用户确认的小熊猫睁眼原始 PNG（1254×1254，真实 Alpha、纯白无瞳孔眼睛），供后续闭眼编辑及聊天框角色制作；尚未接入界面。 |
| [assets/companion/bear/generate_bear_sprites.py](../assets/companion/bear/generate_bear_sprites.py) | 设计/素材制作 | 用 Pillow 从 home-v2-companion.png 生成 64px 底图并合成全部小熊帧，写出 public/companion/bear 下的精灵图和帧清单；可加 --preview 输出预览。不是运行时代码。 |
| [assets/logo/Logo.png](../assets/logo/Logo.png) | 设计/素材制作 | 角色/品牌制作参考图片，不是业务逻辑。 |
| [assets/logo/LogoSVG-framework.png](../assets/logo/LogoSVG-framework.png) | 设计/素材制作 | 品牌图形制作参考，不是运行时组件。 |
| [assets/companion/red-panda/oil-motion/README.md](../assets/companion/red-panda/oil-motion/README.md) | 设计/素材制作 | oil-motion / RIFE 制作路线、验收取舍、素材来源、限制与离线重建说明。 |
| [assets/companion/red-panda/oil-motion/build_pose_grid.py](../assets/companion/red-panda/oil-motion/build_pose_grid.py) | 设计/素材制作 | 调用 oil-motion 清理、抽样、抠色和打包的共享素材编译工具，保留帧来源。 |
| [assets/companion/red-panda/oil-motion/build_rife_grid.py](../assets/companion/red-panda/oil-motion/build_rife_grid.py) | 设计/素材制作 | 选定的离线网格编译入口：官方 RIFE 补帧后用 oil-motion 抠色、检查和打包。 |
| [assets/companion/red-panda/oil-motion/prepare_row.py](../assets/companion/red-panda/oil-motion/prepare_row.py) | 设计/素材制作 | 用原版 oil-motion 从新母版抽取原生帧，输出分析和接触表。 |
| [assets/companion/red-panda/oil-motion/manifest.json](../assets/companion/red-panda/oil-motion/manifest.json) | 设计/素材制作 | 归档文件哈希、官方任务用量、预算与验收结果；不含凭据和临时URL。 |
| [assets/companion/red-panda/oil-motion/sources.zip](../assets/companion/red-panda/oil-motion/sources.zip) | 设计/素材制作 | 17张透明关键帧、11段新母版、四个事实源、帧映射与验收证据；内部清单逐文件记录哈希。 |

### 6.18 历史目录占位文件

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/capabilities/.gitkeep](../src/capabilities/.gitkeep) | 工程占位 | 历史目录占位文件；该目录已有实际代码，占位文件不参与运行。 |
| [src/components/.gitkeep](../src/components/.gitkeep) | 工程占位 | 历史目录占位文件；该目录已有实际代码，占位文件不参与运行。 |
| [src/domain/.gitkeep](../src/domain/.gitkeep) | 工程占位 | 历史目录占位文件；该目录已有实际代码，占位文件不参与运行。 |

## 7. 维护与核对

更新时用 `git ls-files` 和 `rg --files --hidden -g '!node_modules' -g '!.git' -g '!.next'` 核对受维护文件与非忽略新文件。新增文件应有准确职责，删除后同时修复索引和 Markdown 链接。迁移只记录 SQL 意图；执行状态应单独检查，不靠文件名称判断。

向用户讲解时先讲第 2–4 节，再选一条第 5 节的业务链路深入源码。逐文件索引用来回答“这段规则在哪里、由谁调用、谁负责保存”，不需要逐条背诵文件名。业务和错误细节继续以 USER_FLOW_CURRENT 的完整章节展开。

### 6.19 首页小熊猫探头接入（1.0706）

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/components/companion/red-panda-companion.ts](../src/components/companion/red-panda-companion.ts) | 表现层 | 探头→二维跟随→回正→收回的实际接入；媒体预加载、最新焦点反向、生命周期暂停和静态降级。 |
| [src/components/companion/red-panda-companion.test.ts](../src/components/companion/red-panda-companion.test.ts) | 测试 | 使用真实 oil-motion 控制器，验证衔接、回正、途中反向、暂停/恢复、动效偏好、冷加载与资源失败。 |
| [src/components/companion/red-panda-peek-model.ts](../src/components/companion/red-panda-peek-model.ts) | 表现层 | 依据真实时钟、播放状态及 settled ID 判断安全停帧，拒绝取消后的中间帧交接。 |
| [src/components/companion/red-panda-peek-model.test.ts](../src/components/companion/red-panda-peek-model.test.ts) | 测试 | 覆盖中间帧/终点判断与编译时钟帧数、hold 和 1 秒速率的一致性。 |
| [public/companion/red-panda/peek.webp](../public/companion/red-panda/peek.webp) | 展示资源 | 已审核探头/收回的透明原生帧图集，103 格，2640×2400，爪子接触边整帧校正。 |
| [public/companion/red-panda/peek.json](../public/companion/red-panda/peek.json) | 展示资源 | 探头图集编译尺寸、帧数与行列清单。 |
| [public/companion/red-panda/peek-clock.mp4](../public/companion/red-panda/peek-clock.mp4) | 展示资源 | 与探头图集同帧数的隐形全关键帧视频时钟，原版播放器负责正放和反向。 |
| [public/companion/red-panda/peek-timeline.json](../public/companion/red-panda/peek-timeline.json) | 展示资源 | 探头唯一运行时时间轴：实际 24fps/103 帧、状态 hold、约 1 秒播放速率与母版索引。 |
| [assets/companion/red-panda/oil-motion/peek/README.md](../assets/companion/red-panda/oil-motion/peek/README.md) | 设计/素材制作 | 探头接入、原版播放器使用、已知首帧差异、内存和离线重建步骤。 |
| [assets/companion/red-panda/oil-motion/peek/build_peek.py](../assets/companion/red-panda/oil-motion/peek/build_peek.py) | 设计/素材制作 | 不调用 API 的 oil-motion 原生帧提取、接触边校正、透明图集与实测时间轴编译。 |
| [assets/companion/red-panda/oil-motion/peek/manifest.json](../assets/companion/red-panda/oil-motion/peek/manifest.json) | 设计/素材制作 | 探头归档/运行时哈希、官方任务用量、检查结果与验收边界，不含凭据或临时 URL。 |
| [assets/companion/red-panda/oil-motion/peek/sources.zip](../assets/companion/red-panda/oil-motion/peek/sources.zip) | 设计/素材制作 | 探头四个事实源、真实 Alpha/视频关键帧、一条母版、提示词、pilot 审核和集成证据，逐文件哈希。 |
